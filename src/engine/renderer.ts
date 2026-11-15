import {
  ComplicationArcConfig,
  CompiledWatchAssets,
  CroppedSprite,
  DigitalWidgetConfig,
  GlyphSpriteEntry,
  LayerId,
  SimulationState,
  WatchFaceConfig,
} from '../types/watchface';
import { hexToRgb } from './materials';
import { drawCenterPinCap, renderHandVertical } from './hands';
import { drawDialMotifLayer, drawLiveDialAccents } from './dialMotifs';
import {
  clipWatchBoundary,
  drawBezelAndOuterRing,
  drawDialPlate,
  drawRecessedSubDial,
  drawSapphireGlare,
  isUsingIntactArtwork,
} from './materials';
import {
  buildQuantizedSprite,
  dataUrlToBytes,
  floydSteinbergRGB565,
} from './quantizer';
import {
  GLYPH_CHARSET,
  GlyphRole,
  renderGlyphCanvas,
} from './typography';
import { getSystemClockState, SystemClockState } from '../utils/systemClock';
import { roundedRectPath } from './textureEngine';

function isLayerVisible(config: WatchFaceConfig, id: LayerId): boolean {
  const found = config.layers.find((l) => l.id === id);
  return found ? found.visible : true;
}

export function drawArcGaugeState(
  ctx: CanvasRenderingContext2D,
  arc: ComplicationArcConfig,
  config: WatchFaceConfig,
  progressRatio: number,
  drawTrack = true
): void {
  if (!arc.enabled) return;
  const { width, height } = config.resolution;
  const minDim = Math.min(width, height);
  const cx = width / 2 + arc.relX * minDim;
  const cy = height / 2 + arc.relY * minDim;
  const r = arc.relRadius * minDim;
  const startRad = ((arc.startAngleDeg - 90) * Math.PI) / 180;
  const endRad = ((arc.endAngleDeg - 90) * Math.PI) / 180;
  const clamped = Math.max(0, Math.min(1, progressRatio));
  const activeEndRad = startRad + (endRad - startRad) * clamped;

  ctx.save();
  ctx.lineCap = 'round';

  if (drawTrack) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startRad, endRad, false);
    ctx.strokeStyle = arc.trackColor;
    ctx.lineWidth = arc.thickness;
    ctx.stroke();
  }

  if (clamped > 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startRad, activeEndRad, false);
    ctx.strokeStyle = arc.color;
    ctx.lineWidth = arc.thickness;
    ctx.shadowColor = arc.color;
    ctx.shadowBlur = 4;
    ctx.stroke();
  }

  ctx.restore();
}

function getEffectiveClockSnapshot(sim: SimulationState): SystemClockState {
  if (sim.realTime) {
    return getSystemClockState();
  }
  const sys = getSystemClockState();
  const totalSec = Math.floor(sim.timeSeconds % 86400);
  const hours24 = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const displayHour = sys.is24Hour ? hours24 : hours12;
  const ampm = sys.is24Hour ? null : hours24 >= 12 ? 'PM' : 'AM';
  return {
    ...sys,
    hours24,
    hours12,
    minutes,
    seconds,
    timeSeconds: sim.timeSeconds % 86400,
    displayHourStr: String(displayHour).padStart(2, '0'),
    minuteStr: String(minutes).padStart(2, '0'),
    secondStr: String(seconds).padStart(2, '0'),
    ampm,
  };
}

export function formatWidgetText(
  widget: DigitalWidgetConfig,
  sim: SimulationState,
  clock?: SystemClockState
): string {
  const sys = clock ?? getEffectiveClockSnapshot(sim);

  switch (widget.type) {
    case 'timeDigital':
      return `${sys.displayHourStr}:${sys.minuteStr}`;
    case 'date':
      return sys.dateMMDD;
    case 'day':
      return sys.weekdayShort;
    case 'steps':
      return `${Math.round(sim.steps)}`;
    case 'bpm':
      return `${Math.round(sim.heartRate)}`;
    case 'battery':
      return `${Math.round(sim.battery)}%`;
    case 'weather':
      return `${Math.round(sim.temperature)}°C`;
  }
}

function getCachedGlyph(
  char: string,
  fontSet: 'time' | 'metrics' | 'small',
  role: GlyphRole,
  config: WatchFaceConfig,
  glyphMap?: Map<string, HTMLCanvasElement>
): HTMLCanvasElement {
  const key = `${fontSet}:${role}:${char}`;
  let c = glyphMap?.get(key);
  if (!c) {
    c = renderGlyphCanvas(char, fontSet, config, { role });
    glyphMap?.set(key, c);
  }
  return c;
}

function drawMetricLinearBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  barW: number,
  barH: number,
  ratio: number,
  fillColor: string,
  trackColor: string
): void {
  const clamped = Math.max(0.02, Math.min(1, ratio));
  ctx.save();
  roundedRectPath(ctx, x - barW / 2, y - barH / 2, barW, barH, barH / 2);
  ctx.fillStyle = trackColor;
  ctx.fill();

  roundedRectPath(
    ctx,
    x - barW / 2,
    y - barH / 2,
    Math.max(barH, barW * clamped),
    barH,
    barH / 2
  );
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.restore();
}

export function drawDigitalWidgetsLive(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig,
  sim: SimulationState,
  glyphMap?: Map<string, HTMLCanvasElement>
): void {
  const { width, height } = config.resolution;
  const minDim = Math.min(width, height);
  const sys = getEffectiveClockSnapshot(sim);
  const isPureDigital = config.displayMode === 'digital' || !config.hands.enabled;

  for (const widget of config.digital.widgets) {
    if (!widget.enabled) continue;
    const wx = width / 2 + widget.relX * minDim;
    const wy = height / 2 + widget.relY * minDim;

    if (widget.type === 'timeDigital') {
      const hourChars = Array.from(sys.displayHourStr).map((ch) =>
        getCachedGlyph(ch, widget.fontSet, 'hours', config, glyphMap)
      );
      const colonCanvas = getCachedGlyph(':', widget.fontSet, 'hours', config, glyphMap);
      const minChars = Array.from(sys.minuteStr).map((ch) =>
        getCachedGlyph(ch, widget.fontSet, 'minutes', config, glyphMap)
      );
      const allMain = [...hourChars, colonCanvas, ...minChars];
      if (allMain.length === 0) continue;

      const scale = widget.scale;
      const glyphW = allMain[0].width * scale;
      const stepAdvance = glyphW * 0.78;
      const mainVisualW = stepAdvance * (allMain.length - 1) + glyphW;
      const mainH = allMain[0].height * scale;

      const subFontSet = 'small';
      const showSecAmpm = isPureDigital;
      const secChars = showSecAmpm
        ? Array.from(sys.secondStr).map((ch) =>
            getCachedGlyph(ch, subFontSet, 'seconds', config, glyphMap)
          )
        : [];
      const ampmChars =
        showSecAmpm && sys.ampm
          ? Array.from(sys.ampm).map((ch) =>
              getCachedGlyph(ch, subFontSet, 'ampm', config, glyphMap)
            )
          : [];
      const subScale = widget.scale * (widget.fontSet === 'time' ? 0.88 : 0.7);
      const secGlyphW = secChars.length > 0 ? secChars[0].width * subScale : 0;
      const secAdvance = secGlyphW * 0.8;
      const maxSubLen = Math.max(secChars.length, ampmChars.length);
      const secVisualW =
        maxSubLen > 0 ? secAdvance * (maxSubLen - 1) + secGlyphW : 0;
      const sideGap = showSecAmpm && maxSubLen > 0 ? minDim * 0.022 : 0;
      const totalSpanW = mainVisualW + sideGap + secVisualW;

      let cursorX =
        widget.align === 'center'
          ? wx - totalSpanW / 2
          : widget.align === 'right'
          ? wx - totalSpanW
          : wx;
      const blockStartX = cursorX;

      // Optional Readability Backdrop Pill behind hero time digits
      if (config.digital.backdropPill?.enabled) {
        const [pr, pg, pb] = hexToRgb(config.digital.backdropPill.color || '#090b0f');
        const alpha = Math.max(0.1, Math.min(0.92, config.digital.backdropPill.opacity));
        const padX = minDim * 0.044;
        const padY = minDim * 0.026;
        const pillX = blockStartX - padX;
        const pillY = wy - mainH / 2 - padY;
        const pillW = totalSpanW + padX * 2;
        const pillH = mainH + padY * 2;
        ctx.save();
        roundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH * 0.36);
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha.toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = Math.max(1, minDim * 0.0022);
        ctx.stroke();
        ctx.restore();
      }

      for (const gCanvas of allMain) {
        const gw = gCanvas.width * scale;
        ctx.drawImage(gCanvas, cursorX, wy - mainH / 2, gw, mainH);
        cursorX += stepAdvance;
      }

      if (showSecAmpm && secChars.length > 0) {
        const sideX = blockStartX + mainVisualW + sideGap;
        const subH = secChars[0].height * subScale;
        if (ampmChars.length > 0) {
          let ax = sideX;
          for (const g of ampmChars) {
            ctx.drawImage(g, ax, wy - subH * 0.96, g.width * subScale, subH);
            ax += secAdvance;
          }
          let sx = sideX;
          for (const g of secChars) {
            ctx.drawImage(g, sx, wy + subH * 0.06, g.width * subScale, subH);
            sx += secAdvance;
          }
        } else {
          let sx = sideX;
          for (const g of secChars) {
            ctx.drawImage(g, sx, wy - subH / 2, g.width * subScale, subH);
            sx += secAdvance;
          }
        }
      }
      continue;
    }

    const role: GlyphRole =
      widget.type === 'date' || widget.type === 'day' ? 'date' : 'metrics';
    const text = formatWidgetText(widget, sim, sys);

    const charCanvases: HTMLCanvasElement[] = [];
    for (const ch of text) {
      charCanvases.push(getCachedGlyph(ch, widget.fontSet, role, config, glyphMap));
    }

    if (charCanvases.length === 0) continue;
    const scale = widget.scale;
    const glyphW = charCanvases[0].width * scale;
    const stepAdvance = glyphW * 0.78;
    const totalW = stepAdvance * (charCanvases.length - 1) + glyphW;
    const h = charCanvases[0].height * scale;
    const hasLinearGauge =
      isPureDigital && (widget.type === 'battery' || widget.type === 'steps');

    let cursorX =
      widget.align === 'center'
        ? wx - totalW / 2
        : widget.align === 'right'
        ? wx - totalW
        : wx;

    // Subtle readability pill on small readouts if custom photo + backdropPill active
    if (isPureDigital && config.digital.backdropPill?.enabled) {
      const [pr, pg, pb] = hexToRgb(config.digital.backdropPill.color || '#090b0f');
      const alpha = Math.max(0.1, Math.min(0.85, config.digital.backdropPill.opacity * 0.82));
      const padX = minDim * 0.022;
      const barExtraH = hasLinearGauge ? minDim * 0.028 : 0;
      ctx.save();
      roundedRectPath(
        ctx,
        cursorX - padX,
        wy - h / 2 - minDim * 0.008,
        totalW + padX * 2,
        h + minDim * 0.016 + barExtraH,
        h * 0.45
      );
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha.toFixed(3)})`;
      ctx.fill();
      ctx.restore();
    }

    for (const gCanvas of charCanvases) {
      const gw = gCanvas.width * scale;
      ctx.drawImage(gCanvas, cursorX, wy - h / 2, gw, h);
      cursorX += stepAdvance;
    }

    // Crisp Pure Digital linear progress gauges for Battery & Steps
    if (hasLinearGauge) {
      const arcMatch = config.complications.arcs.find((a) => a.metric === widget.type);
      const fillCol =
        arcMatch?.color ??
        config.digital.metricsIconColor ??
        config.bezel.accentColor;
      const trackCol = arcMatch?.trackColor ?? 'rgba(148, 163, 184, 0.25)';
      const ratio =
        widget.type === 'battery'
          ? sim.battery / 100
          : Math.min(1, sim.steps / 20000);
      drawMetricLinearBar(
        ctx,
        wx,
        wy + h * 0.78,
        Math.max(minDim * 0.14, totalW * 0.92),
        Math.max(4, minDim * 0.011),
        ratio,
        fillCol,
        trackCol
      );
    }
  }
}

/**
 * Renders the static dial background plate (for background.png export).
 * Hardware rule: never bake analog hands or time/date digits onto the background bitmap.
 */
export function renderStaticBackgroundCanvas(
  config: WatchFaceConfig,
  sim: SimulationState
): HTMLCanvasElement {
  const { width, height, shape, cornerRadius } = config.resolution;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const isPureDigital = config.displayMode === 'digital' || !config.hands.enabled;
  const intactMode = isUsingIntactArtwork(config);

  ctx.save();
  clipWatchBoundary(ctx, width, height, shape, cornerRadius);

  if (isLayerVisible(config, 'dial')) {
    drawDialPlate(ctx, config);
    if (!isPureDigital && !intactMode) {
      for (const sub of config.dial.subDials) {
        const ratio =
          sub.type === 'battery'
            ? sim.battery / 100
            : sub.type === 'steps'
            ? sim.steps / 20000
            : sub.type === 'heartRate'
            ? (sim.heartRate - 50) / 130
            : 0;
        drawRecessedSubDial(ctx, sub, config, ratio);
      }
    }
  } else {
    ctx.fillStyle = '#090b0f';
    ctx.fillRect(0, 0, width, height);
  }

  if (isLayerVisible(config, 'bezel') && !intactMode) {
    drawBezelAndOuterRing(ctx, config);
  }

  if (isLayerVisible(config, 'dial') && !intactMode) {
    drawDialMotifLayer(ctx, config);
    drawLiveDialAccents(ctx, config, sim, false);
  }

  if (isLayerVisible(config, 'complications')) {
    for (const arc of config.complications.arcs) {
      drawArcGaugeState(ctx, arc, config, 0, true);
    }
  }

  ctx.restore();
  return canvas;
}

/**
 * Renders the live interactive watch frame into a target canvas
 */
export function renderLiveWatchFrame(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig,
  sim: SimulationState,
  cachedDialCanvas?: HTMLCanvasElement,
  glyphCache?: Map<string, HTMLCanvasElement>
): void {
  const { width, height, shape, cornerRadius } = config.resolution;
  const isPureDigital = config.displayMode === 'digital' || !config.hands.enabled;
  const intactMode = isUsingIntactArtwork(config);
  const clock = getEffectiveClockSnapshot(sim);
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  clipWatchBoundary(ctx, width, height, shape, cornerRadius);

  // Layer 1 & 2: Dial Plate, Sub-Dials, Bezel
  if (cachedDialCanvas) {
    ctx.drawImage(cachedDialCanvas, 0, 0);
    if (isLayerVisible(config, 'dial') && !isPureDigital && !intactMode) {
      for (const sub of config.dial.subDials) {
        const ratio =
          sub.type === 'battery'
            ? sim.battery / 100
            : sub.type === 'steps'
            ? sim.steps / 20000
            : sub.type === 'heartRate'
            ? (sim.heartRate - 50) / 130
            : (clock.timeSeconds % 86400) / 86400;
        drawRecessedSubDial(ctx, sub, config, ratio);
      }
    }
  } else {
    if (isLayerVisible(config, 'dial')) {
      drawDialPlate(ctx, config);
      if (!isPureDigital && !intactMode) {
        for (const sub of config.dial.subDials) {
          const ratio =
            sub.type === 'battery'
              ? sim.battery / 100
              : sub.type === 'steps'
              ? sim.steps / 20000
              : sub.type === 'heartRate'
              ? (sim.heartRate - 50) / 130
              : (clock.timeSeconds % 86400) / 86400;
          drawRecessedSubDial(ctx, sub, config, ratio);
        }
      }
    }
    if (isLayerVisible(config, 'bezel') && !intactMode) {
      drawBezelAndOuterRing(ctx, config);
    }
    if (isLayerVisible(config, 'dial') && !intactMode) {
      drawDialMotifLayer(ctx, config);
    }
  }

  if (isLayerVisible(config, 'dial') && !intactMode) {
    drawLiveDialAccents(ctx, config, sim, true);
  }

  // Layer 3: Complication Arcs & Gauges
  if (isLayerVisible(config, 'complications')) {
    for (const arc of config.complications.arcs) {
      const rawRatio =
        arc.metric === 'battery'
          ? sim.battery / 100
          : arc.metric === 'steps'
          ? sim.steps / 20000
          : (sim.heartRate - 50) / 130;
      const discreteIdx = Math.round(
        Math.max(0, Math.min(1, rawRatio)) * (arc.frameCount - 1)
      );
      const snappedRatio = discreteIdx / Math.max(1, arc.frameCount - 1);
      drawArcGaugeState(ctx, arc, config, snappedRatio, true);
    }
  }

  // Layer 4: Digital Readouts & Custom Bitmap Typography
  if (isLayerVisible(config, 'digital')) {
    drawDigitalWidgetsLive(ctx, config, sim, glyphCache);
  }

  // Layer 5: 3D-Shaded Analog Hands with Global-Light Drop Shadows (omitted in Pure Digital)
  if (!isPureDigital && isLayerVisible(config, 'hands') && config.hands.enabled) {
    const t = clock.timeSeconds % 86400;
    const secVal = sim.sweep60fps ? t % 60 : Math.floor(t % 60);
    const minVal = (t / 60) % 60;
    const hourVal = (t / 3600) % 12;

    const hourRad = (hourVal / 12) * Math.PI * 2;
    const minRad = (minVal / 60) * Math.PI * 2;
    const secRad = (secVal / 60) * Math.PI * 2;

    const drawRotatedHandWithGlobalShadow = (
      kind: 'hour' | 'minute' | 'second',
      angleRad: number
    ) => {
      const off = document.createElement('canvas');
      off.width = width;
      off.height = height;
      const octx = off.getContext('2d')!;
      octx.translate(width / 2, height / 2);
      octx.rotate(angleRad);
      octx.translate(-width / 2, -height / 2);
      renderHandVertical(octx, kind, config, false);

      // Soft drop shadow offset in global dial light coordinates (+4px, +6px)
      ctx.save();
      ctx.shadowColor = 'rgba(8, 8, 8, 0.72)';
      ctx.shadowBlur = config.hands.shadowBlur;
      ctx.shadowOffsetX = config.hands.shadowOffsetX;
      ctx.shadowOffsetY = config.hands.shadowOffsetY;
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    };

    drawRotatedHandWithGlobalShadow('hour', hourRad);
    drawRotatedHandWithGlobalShadow('minute', minRad);
    drawRotatedHandWithGlobalShadow('second', secRad);
  }

  // Layer 6: Center Pin Cap & Sapphire Crystal Glare
  if (isLayerVisible(config, 'glassCap')) {
    if (!isPureDigital && isLayerVisible(config, 'hands') && config.hands.enabled) {
      drawCenterPinCap(ctx, config);
    }
    drawSapphireGlare(ctx, config);
  }

  // Optional live 16-bit RGB565 Hardware Dither Preview (only read back pixels when explicitly toggled)
  if (sim.hardwareRgb565Preview) {
    const frameData = ctx.getImageData(0, 0, width, height);
    floydSteinbergRGB565(frameData, sim.fitCloudBlackGuard);
    ctx.putImageData(frameData, 0, 0);
  }

  ctx.restore();
}

/**
 * Generates the complete set of cropped, quantized & dithered hardware sprites
 * for VeryFit (.iwf / .iwf.lz) and FitCloudPro (.bin TBUI) compilers.
 */
export function compileWatchSprites(
  rawConfig: WatchFaceConfig,
  sim: SimulationState
): CompiledWatchAssets {
  const isFhdMaster =
    rawConfig.resolution.width > 600 || rawConfig.resolution.height > 600;
  const config: WatchFaceConfig = isFhdMaster
    ? {
        ...rawConfig,
        resolution:
          rawConfig.resolution.shape === 'round'
            ? {
                id: '466x466',
                label: '466×466 Round (Super-Sampled from 1080p FHD)',
                width: 466,
                height: 466,
                shape: 'round',
                cornerRadius: 233,
              }
            : {
                id: '368x448',
                label: '368×448 Squircle (Super-Sampled from 1080p FHD)',
                width: 368,
                height: 448,
                shape: 'squircle',
                cornerRadius: 82,
              },
      }
    : rawConfig;

  const { width, height } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;

  // 1. Background sprite (full watch dimensions)
  const bgCanvas = renderStaticBackgroundCanvas(config, sim);
  const background = buildQuantizedSprite({
    id: 'background',
    category: 'background',
    label: `Dial Background (${width}×${height})`,
    sourceCanvas: bgCanvas,
    centerX: cx,
    centerY: cy,
    crop: false,
    ditherRgb565: true,
    fitCloudBlackGuard: true,
  });

  // 2. Preview thumbnail (240x240 or 240x280 rounded)
  const prevW = 240;
  const prevH =
    config.resolution.shape === 'round'
      ? 240
      : Math.round((240 * height) / width);
  const fullLiveCanvas = document.createElement('canvas');
  fullLiveCanvas.width = width;
  fullLiveCanvas.height = height;
  renderLiveWatchFrame(
    fullLiveCanvas.getContext('2d', { willReadFrequently: true })!,
    config,
    {
      ...sim,
      hardwareRgb565Preview: true,
    }
  );

  const prevCanvas = document.createElement('canvas');
  prevCanvas.width = prevW;
  prevCanvas.height = prevH;
  const pctx = prevCanvas.getContext('2d')!;
  clipWatchBoundary(
    pctx,
    prevW,
    prevH,
    config.resolution.shape,
    Math.round(config.resolution.cornerRadius * (prevW / width))
  );
  pctx.drawImage(fullLiveCanvas, 0, 0, prevW, prevH);
  const previewBytes = dataUrlToBytes(prevCanvas.toDataURL('image/png'));

  // 3. Analog hands (tight-cropped with exact rotation pivot)
  const makeHandSprite = (
    kind: 'hour' | 'minute' | 'second',
    label: string
  ): CroppedSprite => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    renderHandVertical(c.getContext('2d')!, kind, config, true);
    return buildQuantizedSprite({
      id: `hand_${kind}`,
      category: 'hand',
      label,
      sourceCanvas: c,
      centerX: cx,
      centerY: cy,
      crop: true,
      ditherRgb565: true,
      fitCloudBlackGuard: true,
    });
  };

  const handHour = makeHandSprite('hour', 'Hour Hand (3D Faceted)');
  const handMinute = makeHandSprite('minute', 'Minute Hand (3D Faceted)');
  const handSecond = makeHandSprite('second', 'Second Hand + Lume Pip');

  // 4. Center Pin Cap sprite
  const capCanvas = document.createElement('canvas');
  capCanvas.width = width;
  capCanvas.height = height;
  drawCenterPinCap(capCanvas.getContext('2d')!, config);
  const centerCap = buildQuantizedSprite({
    id: 'center_cap',
    category: 'cap',
    label: 'Center Pivot Cap',
    sourceCanvas: capCanvas,
    centerX: cx,
    centerY: cy,
    crop: true,
    ditherRgb565: true,
    fitCloudBlackGuard: true,
  });

  // 5. Discrete Complication Arc Frame Sprites
  const arcFrames: Record<string, CroppedSprite[]> = {};
  for (const arc of config.complications.arcs) {
    if (!arc.enabled) continue;
    const frames: CroppedSprite[] = [];
    const previewFrames = Math.min(arc.frameCount, 8);
    for (let f = 0; f < previewFrames; f++) {
      const ratio = f / Math.max(1, previewFrames - 1);
      const ac = document.createElement('canvas');
      ac.width = width;
      ac.height = height;
      drawArcGaugeState(ac.getContext('2d')!, arc, config, ratio, false);
      frames.push(
        buildQuantizedSprite({
          id: `${arc.id}_f${f}`,
          category: 'arc',
          label: `${arc.label} [${Math.round(ratio * 100)}%]`,
          sourceCanvas: ac,
          centerX: cx,
          centerY: cy,
          crop: true,
          ditherRgb565: true,
          fitCloudBlackGuard: true,
        })
      );
    }
    arcFrames[arc.id] = frames;
  }

  // 6. Custom Anti-Aliased Bitmap Typography Glyphs
  const glyphs: GlyphSpriteEntry[] = [];
  const activeFontSets = new Set<'time' | 'metrics' | 'small'>(['metrics', 'small']);
  for (const w of config.digital.widgets) {
    if (w.enabled) activeFontSets.add(w.fontSet);
  }

  for (const fontSet of activeFontSets) {
    const role: GlyphRole =
      fontSet === 'time' ? 'hours' : fontSet === 'metrics' ? 'minutes' : 'date';
    for (const ch of GLYPH_CHARSET) {
      const gCanvas = renderGlyphCanvas(ch, fontSet, config, { role });
      const safeName =
        ch === ':'
          ? 'colon'
          : ch === '%'
          ? 'percent'
          : ch === '-'
          ? 'minus'
          : ch === '/'
          ? 'slash'
          : ch === '°'
          ? 'deg'
          : `char_${ch}`;
      const sprite = buildQuantizedSprite({
        id: `font_${fontSet}_${safeName}`,
        category: 'glyph',
        label: `Glyph '${ch}' (${fontSet})`,
        sourceCanvas: gCanvas,
        centerX: gCanvas.width / 2,
        centerY: gCanvas.height / 2,
        crop: true,
        ditherRgb565: true,
        fitCloudBlackGuard: true,
      });
      glyphs.push({ char: ch, fontSet, sprite });
    }
  }

  const allSprites: CroppedSprite[] = [
    background,
    handHour,
    handMinute,
    handSecond,
    centerCap,
    ...Object.values(arcFrames).flat(),
    ...glyphs.map((g) => g.sprite),
  ];

  const uncompressedRgbaBytes = allSprites.reduce(
    (sum, s) => sum + s.rgba8888Bytes.byteLength,
    0
  );
  const rgb565PayloadBytes = allSprites.reduce(
    (sum, s) => sum + s.rgb565Bytes.byteLength,
    0
  );
  const pngTotalBytes =
    previewBytes.byteLength +
    allSprites.reduce((sum, s) => sum + s.pngBytes.byteLength, 0);

  return {
    width,
    height,
    background,
    previewBytes,
    centerCap,
    handHour,
    handMinute,
    handSecond,
    arcFrames,
    glyphs,
    allSprites,
    budget: {
      uncompressedRgbaBytes,
      rgb565PayloadBytes,
      veryfitIwfBytes: pngTotalBytes + 2048,
      veryfitLzBytes: Math.round(pngTotalBytes * 0.78),
      fitcloudBinBytes: rgb565PayloadBytes + allSprites.length * 24 + 128,
      spriteCount: allSprites.length,
      flashBudgetMinKb: 300,
      flashBudgetMaxKb: 1200,
    },
  };
}
