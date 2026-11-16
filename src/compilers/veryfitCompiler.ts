import JSZip from 'jszip';
import {
  CompiledWatchAssets,
  SimulationState,
  WatchFaceConfig,
} from '../types/watchface';
import { compileWatchSprites } from '../engine/renderer';
import {
  adaptWatchFaceToResolution,
  clampWatchExportResolution,
} from '../presets/watchPresets';
import { compressIwfLz4, fastlz1Compress } from './compression';

export interface VeryFitExportPackage {
  iwfBlob: Blob;
  iwfBytes: Uint8Array;
  iwfLzBytes: Uint8Array;
  iwfJsonString: string;
  fontJsonString: string;
}

/**
 * Generates a compliant VeryFit / IDO (.iwf and .iwf.lz) archive package.
 * Matches `com.watch.life` / IDO watch face container specification:
 * - iwf.json (2-space indented JSON with clib, version: 2, author, compress, item[])
 * - font.json (minified JSON mapping characters '0'-'9', ':', '%', '-' to PNG sprite filenames)
 * - preview.png + background.png + cropped hand/arc/glyph PNGs
 */
export async function buildVeryFitPackage(
  config: WatchFaceConfig,
  sim: SimulationState,
  lzAlgorithm: 'lz4' | 'fastlz' = 'lz4',
  precompiled?: CompiledWatchAssets
): Promise<VeryFitExportPackage> {
  const targetSpec = clampWatchExportResolution(config.resolution);
  const clampedConfig =
    config.resolution.width === targetSpec.width &&
    config.resolution.height === targetSpec.height &&
    config.resolution.shape === targetSpec.shape
      ? config
      : adaptWatchFaceToResolution(config, targetSpec);
  const assets = precompiled ?? compileWatchSprites(clampedConfig, sim);
  const zip = new JSZip();

  // 1. Add preview & background PNGs
  zip.file('preview.png', assets.previewBytes);
  zip.file('background.png', assets.background.pngBytes);

  // 2. Build font.json (minified as required by IDO parser)
  const fontMap: Record<string, Record<string, string>> = {
    time: {},
    metrics: {},
    small: {},
  };

  for (const g of assets.glyphs) {
    const fileName = `${g.sprite.id}.png`;
    zip.file(fileName, g.sprite.pngBytes);
    fontMap[g.fontSet][g.char] = fileName;
  }

  // Also expose flat top-level character map for legacy v2 firmware parsers
  const flatFontJson: Record<string, unknown> = {
    ...(fontMap.metrics || {}),
    sets: fontMap,
  };
  const fontJsonString = JSON.stringify(flatFontJson);
  zip.file('font.json', fontJsonString);

  const width = assets.width;
  const height = assets.height;
  const minDim = Math.min(width, height);
  const isPureDigital =
    clampedConfig.displayMode === 'digital' || !clampedConfig.hands.enabled;

  // 3. Add analog hand & center cap PNGs only when analog/hybrid hands are enabled
  if (!isPureDigital && config.hands.enabled) {
    zip.file('hand_hour.png', assets.handHour.pngBytes);
    zip.file('hand_minute.png', assets.handMinute.pngBytes);
    zip.file('hand_second.png', assets.handSecond.pngBytes);
    zip.file('center_cap.png', assets.centerCap.pngBytes);
  }

  // 4. Add complication arc frame PNGs
  const arcFrameFiles: Record<string, string[]> = {};
  for (const [arcId, frames] of Object.entries(assets.arcFrames)) {
    arcFrameFiles[arcId] = [];
    for (const frame of frames) {
      const fName = `${frame.id}.png`;
      zip.file(fName, frame.pngBytes);
      arcFrameFiles[arcId].push(fName);
    }
  }

  // 5. Construct structured `iwf.json`
  const items: Array<Record<string, unknown>> = [];

  // Background descriptor (static background plate with zero baked hands/time)
  items.push({
    type: 'background',
    x: 0,
    y: 0,
    w: width,
    h: height,
    widget: 'background.png',
    baked_clock: false,
  });

  // Complication progress arcs
  for (const arc of config.complications.arcs) {
    if (!arc.enabled || !arcFrameFiles[arc.id]) continue;
    const firstFrame = assets.arcFrames[arc.id]?.[0];
    items.push({
      type: `progress_${arc.metric}`,
      metric: arc.metric,
      x: firstFrame ? firstFrame.x : 0,
      y: firstFrame ? firstFrame.y : 0,
      w: firstFrame ? firstFrame.width : width,
      h: firstFrame ? firstFrame.height : height,
      frames: arcFrameFiles[arc.id],
    });
  }

  // Dynamic Digital Widgets bound to hardware RTC & health sensors
  for (const widget of config.digital.widgets) {
    if (!widget.enabled) continue;
    const wx = Math.round(width / 2 + widget.relX * minDim);
    const wy = Math.round(height / 2 + widget.relY * minDim);
    const fgHex =
      widget.type === 'timeDigital'
        ? config.digital.hoursColor ?? config.digital.primaryColor
        : widget.type === 'date' || widget.type === 'day'
        ? config.digital.dateColor ?? config.digital.primaryColor
        : config.digital.metricsValueColor ?? config.digital.primaryColor;
    items.push({
      type: widget.type,
      rtc_binding: 'ble_phone_rtc',
      x: wx,
      y: wy,
      align: widget.align,
      font_id: widget.fontSet,
      font: 'font.json',
      fgcolor: `0x${fgHex.replace('#', '')}`,
      minutes_color: `0x${(config.digital.minutesColor ?? config.digital.primaryColor).replace('#', '')}`,
      seconds_color: `0x${(config.digital.secondsColor ?? config.hands.secondHandColor).replace('#', '')}`,
      bgcolor: config.digital.backdropPill?.enabled
        ? `0x${(config.digital.backdropPill.color || '#090b0f').replace('#', '')}`
        : '0x000000',
    });
  }

  // Analog hands descriptor with exact cropped pivot coordinates
  if (!isPureDigital && config.hands.enabled) {
    items.push({
      type: 'analog_hour',
      rtc_binding: 'rtc_hour_12h',
      widget: 'hand_hour.png',
      center_x: assets.handHour.centerX,
      center_y: assets.handHour.centerY,
      anchor_x: assets.handHour.pivotX,
      anchor_y: assets.handHour.pivotY,
      w: assets.handHour.width,
      h: assets.handHour.height,
    });
    items.push({
      type: 'analog_minute',
      rtc_binding: 'rtc_minute',
      widget: 'hand_minute.png',
      center_x: assets.handMinute.centerX,
      center_y: assets.handMinute.centerY,
      anchor_x: assets.handMinute.pivotX,
      anchor_y: assets.handMinute.pivotY,
      w: assets.handMinute.width,
      h: assets.handMinute.height,
    });
    items.push({
      type: 'analog_second',
      rtc_binding: 'rtc_second_sweep',
      widget: 'hand_second.png',
      center_x: assets.handSecond.centerX,
      center_y: assets.handSecond.centerY,
      anchor_x: assets.handSecond.pivotX,
      anchor_y: assets.handSecond.pivotY,
      w: assets.handSecond.width,
      h: assets.handSecond.height,
    });
    items.push({
      type: 'center_cap',
      widget: 'center_cap.png',
      x: assets.centerCap.x,
      y: assets.centerCap.y,
      w: assets.centerCap.width,
      h: assets.centerCap.height,
    });
  }

  const iwfManifest = {
    clib: 'chronosforge_v2',
    version: 2,
    clock_sync: 'ble_phone_rtc',
    display_mode: config.displayMode ?? (config.hands.enabled ? 'hybrid' : 'digital'),
    name: config.name,
    author: config.author,
    width,
    height,
    shape: config.resolution.shape,
    compress: lzAlgorithm === 'lz4' ? 1 : 2,
    preview: 'preview.png',
    background: 'background.png',
    analog:
      !isPureDigital && config.hands.enabled
        ? {
            clock_sync: 'ble_phone_rtc',
            hour: {
              image: 'hand_hour.png',
              center_x: assets.handHour.centerX,
              center_y: assets.handHour.centerY,
              anchor_x: assets.handHour.pivotX,
              anchor_y: assets.handHour.pivotY,
            },
            minute: {
              image: 'hand_minute.png',
              center_x: assets.handMinute.centerX,
              center_y: assets.handMinute.centerY,
              anchor_x: assets.handMinute.pivotX,
              anchor_y: assets.handMinute.pivotY,
            },
            second: {
              image: 'hand_second.png',
              center_x: assets.handSecond.centerX,
              center_y: assets.handSecond.centerY,
              anchor_x: assets.handSecond.pivotX,
              anchor_y: assets.handSecond.pivotY,
            },
          }
        : null,
    item: items,
  };

  // Standard 2-space formatted iwf.json
  const iwfJsonString = JSON.stringify(iwfManifest, null, 2);
  zip.file('iwf.json', iwfJsonString);

  const iwfBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const iwfLzBytes =
    lzAlgorithm === 'lz4'
      ? compressIwfLz4(iwfBytes)
      : fastlz1Compress(iwfBytes);

  const iwfBlob = new Blob([iwfBytes as unknown as BlobPart], {
    type: 'application/octet-stream',
  });

  return {
    iwfBlob,
    iwfBytes,
    iwfLzBytes,
    iwfJsonString,
    fontJsonString,
  };
}
