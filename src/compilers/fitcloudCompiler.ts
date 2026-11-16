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
import { crc32 } from './compression';

export const TBUI_ELEMENT_TYPES: Record<number, string> = {
  0x01: 'BACKGROUND_PLATE',
  0x02: 'PREVIEW_THUMB',
  0x10: 'ANALOG_HOUR_HAND',
  0x11: 'ANALOG_MINUTE_HAND',
  0x12: 'ANALOG_SECOND_HAND',
  0x13: 'CENTER_PIN_CAP',
  0x20: 'DIGITAL_TIME_SET',
  0x21: 'DIGITAL_DATE_SET',
  0x22: 'DIGITAL_STEPS_SET',
  0x23: 'DIGITAL_BPM_SET',
  0x24: 'DIGITAL_BATTERY_SET',
  0x25: 'DIGITAL_WEATHER_SET',
  0x30: 'COMPLICATION_ARC_FRAMES',
  0x40: 'GLYPH_CHAR_ATLAS',
  0x41: 'RTC_BINDING_MANIFEST',
};

export const FITCLOUD_DYNAMIC_CLOCK_TAGS = {
  hour: 'CHHoursHandSmooth',
  minute: 'CHMinutesHandSmooth',
  second: 'CHSecondsHandSmooth',
  digitalTime: 'CHDigitalTimeRTC',
  digitalDate: 'CHDigitalDateRTC',
  digitalSteps: 'CHStepsCounterRTC',
  digitalHeartRate: 'CHHeartRateRTC',
  digitalBattery: 'CHBatteryLevelRTC',
} as const;

export function buildFitCloudClockBindingDescriptor(config: WatchFaceConfig) {
  const isPureDigital = config.displayMode === 'digital' || !config.hands.enabled;
  return {
    engine: 'TBUI_CF20',
    clockSync: 'ble_phone_rtc',
    bakedHandsInBackground: false,
    bakedTimeInBackground: false,
    displayMode: config.displayMode ?? (config.hands.enabled ? 'hybrid' : 'digital'),
    analogBindings:
      !isPureDigital && config.hands.enabled
        ? {
            hourTag: FITCLOUD_DYNAMIC_CLOCK_TAGS.hour,
            minuteTag: FITCLOUD_DYNAMIC_CLOCK_TAGS.minute,
            secondTag: FITCLOUD_DYNAMIC_CLOCK_TAGS.second,
            secondSweepHz: 60,
          }
        : null,
    digitalBindings: config.digital.widgets
      .filter((w) => w.enabled)
      .map((w) => ({
        id: w.id,
        type: w.type,
        rtcTag:
          w.type === 'timeDigital'
            ? FITCLOUD_DYNAMIC_CLOCK_TAGS.digitalTime
            : w.type === 'date' || w.type === 'day'
            ? FITCLOUD_DYNAMIC_CLOCK_TAGS.digitalDate
            : w.type === 'steps'
            ? FITCLOUD_DYNAMIC_CLOCK_TAGS.digitalSteps
            : w.type === 'bpm'
            ? FITCLOUD_DYNAMIC_CLOCK_TAGS.digitalHeartRate
            : FITCLOUD_DYNAMIC_CLOCK_TAGS.digitalBattery,
        fontSet: w.fontSet,
        hoursColorMode: config.digital.hoursColorMode ?? 'solid',
        hoursColor: config.digital.hoursColor ?? config.digital.primaryColor,
        minutesColor: config.digital.minutesColor ?? config.digital.primaryColor,
        secondsColor: config.digital.secondsColor ?? config.hands.secondHandColor,
      })),
  };
}

interface TbuiBlockSpec {
  typeCode: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  pixelFormat: 1 | 2; // 1 = RGB565 (opaque), 2 = RGBA8888 (alpha sprite)
  frameCount: number;
  payload: Uint8Array;
}

/**
 * Generates a structured FitCloudPro (.bin) binary file formatted for the `TBUI` watch face engine.
 */
export function buildFitCloudBin(
  config: WatchFaceConfig,
  sim: SimulationState,
  precompiled?: CompiledWatchAssets,
  modelMagic = 'TBUI_CF20'
): Uint8Array {
  const targetSpec = clampWatchExportResolution(config.resolution);
  const clampedConfig =
    config.resolution.width === targetSpec.width &&
    config.resolution.height === targetSpec.height &&
    config.resolution.shape === targetSpec.shape
      ? config
      : adaptWatchFaceToResolution(config, targetSpec);
  const assets = precompiled ?? compileWatchSprites(clampedConfig, sim);
  const width = assets.width;
  const height = assets.height;
  const minDim = Math.min(width, height);
  const isPureDigital =
    clampedConfig.displayMode === 'digital' || !clampedConfig.hands.enabled;

  const blocks: TbuiBlockSpec[] = [];

  // 1. Background Plate (RGB565 opaque with #080808 pure-black transparency guard applied; zero hands/time baked)
  blocks.push({
    typeCode: 0x01,
    x: 0,
    y: 0,
    width: assets.background.width,
    height: assets.background.height,
    pivotX: Math.round(width / 2),
    pivotY: Math.round(height / 2),
    pixelFormat: 1,
    frameCount: 1,
    payload: assets.background.rgb565Bytes,
  });

  // 2. Complication Arc multi-frame sets
  for (const arc of config.complications.arcs) {
    const frames = assets.arcFrames[arc.id];
    if (!arc.enabled || !frames || frames.length === 0) continue;
    const f0 = frames[0];
    const totalLen = frames.reduce((s, f) => s + f.rgb565Bytes.byteLength, 0);
    const merged = new Uint8Array(totalLen);
    let ptr = 0;
    for (const f of frames) {
      merged.set(f.rgb565Bytes, ptr);
      ptr += f.rgb565Bytes.byteLength;
    }
    blocks.push({
      typeCode: 0x30,
      x: f0.x,
      y: f0.y,
      width: f0.width,
      height: f0.height,
      pivotX: f0.pivotX,
      pivotY: f0.pivotY,
      pixelFormat: 1,
      frameCount: frames.length,
      payload: merged,
    });
  }

  // 3. Digital Widget Character-Set Bindings
  const widgetCodeMap: Record<string, number> = {
    timeDigital: 0x20,
    date: 0x21,
    day: 0x21,
    steps: 0x22,
    bpm: 0x23,
    battery: 0x24,
    weather: 0x25,
  };

  for (const w of config.digital.widgets) {
    if (!w.enabled) continue;
    const matchingGlyphs = assets.glyphs.filter(
      (g) => g.fontSet === w.fontSet && /^[0-9:AMP]$/.test(g.char)
    );
    if (matchingGlyphs.length === 0) continue;

    const g0 = matchingGlyphs[0].sprite;
    const totalLen = matchingGlyphs.reduce(
      (s, g) => s + g.sprite.rgb565Bytes.byteLength,
      0
    );
    const merged = new Uint8Array(totalLen);
    let ptr = 0;
    for (const g of matchingGlyphs) {
      merged.set(g.sprite.rgb565Bytes, ptr);
      ptr += g.sprite.rgb565Bytes.byteLength;
    }

    const wx = Math.round(width / 2 + w.relX * minDim);
    const wy = Math.round(height / 2 + w.relY * minDim);

    blocks.push({
      typeCode: widgetCodeMap[w.type] ?? 0x20,
      x: Math.max(0, wx),
      y: Math.max(0, wy),
      width: g0.width,
      height: g0.height,
      pivotX: g0.pivotX,
      pivotY: g0.pivotY,
      pixelFormat: 1,
      frameCount: matchingGlyphs.length,
      payload: merged,
    });
  }

  // 4. Analog Hands + Center Pin Cap (RGBA8888 with exact rotation anchors & dynamic RTC binding)
  if (!isPureDigital && config.hands.enabled) {
    blocks.push({
      typeCode: 0x10,
      x: assets.handHour.x,
      y: assets.handHour.y,
      width: assets.handHour.width,
      height: assets.handHour.height,
      pivotX: assets.handHour.pivotX,
      pivotY: assets.handHour.pivotY,
      pixelFormat: 2,
      frameCount: 1,
      payload: assets.handHour.rgba8888Bytes,
    });

    blocks.push({
      typeCode: 0x11,
      x: assets.handMinute.x,
      y: assets.handMinute.y,
      width: assets.handMinute.width,
      height: assets.handMinute.height,
      pivotX: assets.handMinute.pivotX,
      pivotY: assets.handMinute.pivotY,
      pixelFormat: 2,
      frameCount: 1,
      payload: assets.handMinute.rgba8888Bytes,
    });

    blocks.push({
      typeCode: 0x12,
      x: assets.handSecond.x,
      y: assets.handSecond.y,
      width: assets.handSecond.width,
      height: assets.handSecond.height,
      pivotX: assets.handSecond.pivotX,
      pivotY: assets.handSecond.pivotY,
      pixelFormat: 2,
      frameCount: 1,
      payload: assets.handSecond.rgba8888Bytes,
    });

    blocks.push({
      typeCode: 0x13,
      x: assets.centerCap.x,
      y: assets.centerCap.y,
      width: assets.centerCap.width,
      height: assets.centerCap.height,
      pivotX: assets.centerCap.pivotX,
      pivotY: assets.centerCap.pivotY,
      pixelFormat: 2,
      frameCount: 1,
      payload: assets.centerCap.rgba8888Bytes,
    });
  }

  // 5. Dynamic BLE/Phone RTC Binding Manifest block
  const rtcManifestBytes = new TextEncoder().encode(
    JSON.stringify(buildFitCloudClockBindingDescriptor(config))
  );
  blocks.push({
    typeCode: 0x41,
    x: 0,
    y: 0,
    width,
    height,
    pivotX: Math.round(width / 2),
    pivotY: Math.round(height / 2),
    pixelFormat: 2,
    frameCount: 1,
    payload: rtcManifestBytes,
  });

  const headerSize = 64;
  const descriptorTableSize = blocks.length * 24;
  let payloadCursor = headerSize + descriptorTableSize;

  const payloadTotal = blocks.reduce((acc, b) => {
    const aligned = (b.payload.byteLength + 3) & ~3;
    return acc + aligned;
  }, 0);

  const footerSize = 16;
  const totalFileSize = payloadCursor + payloadTotal + footerSize;
  const buffer = new ArrayBuffer(totalFileSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Header [0..63]
  bytes[0] = 0x54; // 'T'
  bytes[1] = 0x42; // 'B'
  bytes[2] = 0x55; // 'U'
  bytes[3] = 0x49; // 'I'
  view.setUint16(4, 0x0201, true); // Header version 2.1
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  view.setUint16(10, blocks.length, true);
  view.setUint16(12, blocks.length, true);
  view.setUint16(14, config.resolution.shape === 'round' ? 1 : 2, true);
  view.setUint32(16, headerSize, true);
  view.setUint32(20, headerSize + descriptorTableSize, true);
  view.setUint32(24, totalFileSize, true);

  for (let i = 0; i < 16; i++) {
    bytes[32 + i] = i < modelMagic.length ? modelMagic.charCodeAt(i) : 0;
  }

  // Element descriptors + payloads
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const descOffset = headerSize + i * 24;

    view.setUint8(descOffset + 0, b.typeCode);
    view.setUint8(descOffset + 1, b.pixelFormat);
    view.setUint16(descOffset + 2, b.x, true);
    view.setUint16(descOffset + 4, b.y, true);
    view.setUint16(descOffset + 6, b.width, true);
    view.setUint16(descOffset + 8, b.height, true);
    view.setUint16(descOffset + 10, b.pivotX, true);
    view.setUint16(descOffset + 12, b.pivotY, true);
    view.setUint16(descOffset + 14, b.frameCount, true);
    view.setUint32(descOffset + 16, payloadCursor, true);
    view.setUint32(descOffset + 20, b.payload.byteLength, true);

    bytes.set(b.payload, payloadCursor);
    const aligned = (b.payload.byteLength + 3) & ~3;
    payloadCursor += aligned;
  }

  // Trailing TBUI Footer [payloadCursor .. payloadCursor + 15]
  const footerOffset = payloadCursor;
  bytes[footerOffset + 0] = 0x54; // 'T'
  bytes[footerOffset + 1] = 0x42; // 'B'
  bytes[footerOffset + 2] = 0x55; // 'U'
  bytes[footerOffset + 3] = 0x49; // 'I'
  const bodyChecksum = crc32(bytes.subarray(0, footerOffset));
  view.setUint32(28, bodyChecksum, true);
  view.setUint32(footerOffset + 4, bodyChecksum, true);
  view.setUint32(footerOffset + 8, totalFileSize, true);
  view.setUint32(footerOffset + 12, 0x00004643, true); // "CF\0\0"

  return bytes;
}
