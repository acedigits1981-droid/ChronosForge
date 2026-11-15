import {
  MetallicFinish,
  SubDialConfig,
  WatchFaceConfig,
} from '../types/watchface';
import { getCachedCustomImageSync } from '../utils/paletteExtractor';
import {
  fbm,
  hash2d,
  hexToRgb,
  renderLuxuryBezelTexture,
  renderLuxuryTextureShader,
  roundedRectPath,
  sampleRoundedRectPerimeter,
  traceRoundedRectSubpath,
} from './textureEngine';

export { hexToRgb };

export function getMetallicStopColors(finish: MetallicFinish): {
  light: string;
  mid: string;
  dark: string;
  edge: string;
} {
  switch (finish) {
    case 'brushedTitanium':
      return { light: '#e2e8f0', mid: '#94a3b8', dark: '#475569', edge: '#1e293b' };
    case 'polishedSteel':
      return { light: '#ffffff', mid: '#cbd5e1', dark: '#64748b', edge: '#0f172a' };
    case 'champagneGold':
      return { light: '#fef3c7', mid: '#d4af37', dark: '#785712', edge: '#2e1f05' };
    case 'roseGold18k':
      return { light: '#fff1f2', mid: '#f4af9d', dark: '#b56557', edge: '#4a201b' };
    case 'obsidianBlack':
      return { light: '#64748b', mid: '#262d3a', dark: '#11151c', edge: '#08080a' };
  }
}

export function clipWatchBoundary(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shape: 'round' | 'squircle',
  cornerRadius: number
): void {
  ctx.beginPath();
  if (shape === 'round') {
    const r = Math.min(width, height) / 2;
    ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
  } else {
    const r = Math.min(cornerRadius, width / 2, height / 2);
    ctx.moveTo(r, 0);
    ctx.lineTo(width - r, 0);
    ctx.quadraticCurveTo(width, 0, width, r);
    ctx.lineTo(width, height - r);
    ctx.quadraticCurveTo(width, height, width - r, height);
    ctx.lineTo(r, height);
    ctx.quadraticCurveTo(0, height, 0, height - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
  }
  ctx.closePath();
  ctx.clip();
}

export function isUsingIntactArtwork(config: WatchFaceConfig): boolean {
  return Boolean(
    config.dial.intactArtworkUrl && !config.dial.customImage?.enabled
  );
}

function applyOverlayTint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color?: string,
  opacity?: number,
  useHueBlend = false
): void {
  if (!color || !opacity || opacity <= 0.01) return;
  const [r, g, b] = hexToRgb(color);
  ctx.save();
  if (useHueBlend) {
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.68, Math.max(0, opacity))})`;
  } else {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.88, Math.max(0, opacity))})`;
  }
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawDialPlate(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig
): void {
  const { width, height } = config.resolution;
  const customImg = config.dial.customImage;
  if (customImg?.enabled && customImg.dataUrl) {
    const imgEl = getCachedCustomImageSync(customImg.dataUrl);
    if (imgEl) {
      const cx = width / 2;
      const cy = height / 2;
      const minDim = Math.min(width, height);
      const coverScale = Math.max(
        width / Math.max(1, imgEl.naturalWidth),
        height / Math.max(1, imgEl.naturalHeight)
      );
      const scale = coverScale * Math.max(0.5, Math.min(2.5, customImg.zoom));
      const panOffsetX = customImg.panX * width * 0.42;
      const panOffsetY = customImg.panY * height * 0.42;

      ctx.save();
      ctx.fillStyle = '#090b0f';
      ctx.fillRect(0, 0, width, height);

      ctx.translate(cx + panOffsetX, cy + panOffsetY);
      ctx.rotate((customImg.rotationDeg * Math.PI) / 180);
      ctx.filter = `brightness(${customImg.brightness}) contrast(${customImg.contrast})`;
      const drawW = imgEl.naturalWidth * scale;
      const drawH = imgEl.naturalHeight * scale;
      ctx.drawImage(imgEl, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      // Photo color-grade tint overlay
      applyOverlayTint(
        ctx,
        width,
        height,
        customImg.tintColor,
        customImg.tintOpacity
      );
      applyOverlayTint(
        ctx,
        width,
        height,
        config.dial.overlayTintColor,
        config.dial.overlayTintOpacity
      );

      // Edge vignette & deep bezel ambient occlusion under crystal
      const vig = Math.max(0, Math.min(1, customImg.vignette));
      if (vig > 0.01) {
        const outerR = Math.hypot(cx, cy);
        const vigGrad = ctx.createRadialGradient(
          cx,
          cy,
          minDim * 0.22,
          cx,
          cy,
          outerR * 0.96
        );
        vigGrad.addColorStop(0, 'rgba(8, 8, 10, 0)');
        vigGrad.addColorStop(0.65, `rgba(8, 8, 10, ${(vig * 0.34).toFixed(3)})`);
        vigGrad.addColorStop(1, `rgba(8, 8, 10, ${(vig * 0.84).toFixed(3)})`);
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, width, height);
      }
      return;
    }
  }

  // Exact high-rendered watch artwork path (non-cartoonish, pixel-intact)
  if (config.dial.intactArtworkUrl) {
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, width, height);

    const artImg = getCachedCustomImageSync(config.dial.intactArtworkUrl);
    if (artImg) {
      const iw = Math.max(1, artImg.naturalWidth);
      const ih = Math.max(1, artImg.naturalHeight);
      // 1:1 edge-to-edge on matching square/round targets; aspect-safe contain on rectangular watches
      const isSquareAspect = Math.abs(width - height) <= 4;
      const scale = isSquareAspect
        ? Math.max(width / iw, height / ih)
        : Math.min(width / iw, height / ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(artImg, drawX, drawY, drawW, drawH);
      ctx.restore();

      applyOverlayTint(
        ctx,
        width,
        height,
        config.dial.overlayTintColor,
        config.dial.overlayTintOpacity,
        true
      );
      return;
    }
  }

  // Delegate Luxury Femme & procedural iridescent surface shaders to the Texture Engine
  if (renderLuxuryTextureShader(ctx, config)) {
    applyOverlayTint(
      ctx,
      width,
      height,
      config.dial.overlayTintColor,
      config.dial.overlayTintOpacity
    );
    return;
  }

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.hypot(cx, cy);
  const [r1, g1, b1] = hexToRgb(config.dial.baseColor);
  const [r2, g2, b2] = hexToRgb(config.dial.secondaryColor);
  const lightRad = (config.dial.lightAngleDeg * Math.PI) / 180;
  const mat = config.dial.material;

  if (mat === 'sunburst') {
    const img = ctx.createImageData(width, height);
    const data = img.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        const lobeA = Math.pow(Math.max(0, Math.cos(angle - lightRad)), 4);
        const lobeB = Math.pow(Math.max(0, Math.cos(angle - lightRad - Math.PI)), 4);
        const cone = lobeA * 0.7 + lobeB * 0.45;

        const brushAngleIdx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 900);
        const radialGrain = (hash2d(brushAngleIdx, 17) - 0.5) * 24;
        const microRing = Math.sin(dist * 0.9) * 3;
        const vignette = 1 - Math.min(1, dist / maxR) * 0.38;

        const t = Math.min(1, cone);
        const baseR = r1 + (r2 - r1) * t;
        const baseG = g1 + (g2 - g1) * t;
        const baseB = b1 + (b2 - b1) * t;

        const idx = (y * width + x) * 4;
        data[idx] = Math.max(8, Math.min(255, baseR * vignette + radialGrain + microRing));
        data[idx + 1] = Math.max(8, Math.min(255, baseG * vignette + radialGrain + microRing));
        data[idx + 2] = Math.max(8, Math.min(255, baseB * vignette + radialGrain + microRing));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (mat === 'forgedCarbon') {
    const img = ctx.createImageData(width, height);
    const data = img.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const n1 = fbm(x * 0.045, y * 0.045, 4);
        const n2 = fbm(x * 0.14 + 31.7, y * 0.14 - 11.2, 3);
        const flake = Math.abs(n1 - n2) < 0.09 ? 0.25 : n1 * 0.85;
        const micro = (hash2d(x, y) - 0.5) * 7;

        const lx = Math.cos(lightRad) * (dx / maxR);
        const ly = Math.sin(lightRad) * (dy / maxR);
        const lightShade = 1 + (lx + ly) * 0.16;
        const vignette = 1 - Math.min(1, dist / maxR) * 0.34;

        const idx = (y * width + x) * 4;
        const mix = Math.max(0, Math.min(1, flake));
        const cr = (r1 + (r2 - r1) * mix) * lightShade * vignette + micro;
        const cg = (g1 + (g2 - g1) * mix) * lightShade * vignette + micro;
        const cb = (b1 + (b2 - b1) * mix) * lightShade * vignette + micro;
        data[idx] = Math.max(8, Math.min(255, cr));
        data[idx + 1] = Math.max(8, Math.min(255, cg));
        data[idx + 2] = Math.max(8, Math.min(255, cb));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (mat === 'matteCeramic') {
    const img = ctx.createImageData(width, height);
    const data = img.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const grain = fbm(x * 0.08, y * 0.08, 3) * 0.5 + (hash2d(x, y) - 0.5) * 0.18;
        const lx = Math.cos(lightRad) * (dx / maxR);
        const ly = Math.sin(lightRad) * (dy / maxR);
        const shade = Math.max(0.65, Math.min(1.2, 1 + (lx + ly) * 0.22 - (dist / maxR) * 0.25));

        const idx = (y * width + x) * 4;
        data[idx] = Math.max(8, Math.min(255, (r1 + (r2 - r1) * grain) * shade));
        data[idx + 1] = Math.max(8, Math.min(255, (g1 + (g2 - g1) * grain) * shade));
        data[idx + 2] = Math.max(8, Math.min(255, (b1 + (b2 - b1) * grain) * shade));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else {
    const grad = ctx.createRadialGradient(cx, cy, maxR * 0.1, cx, cy, maxR);
    grad.addColorStop(0, '#090b0f');
    grad.addColorStop(0.78, config.dial.baseColor);
    grad.addColorStop(1, config.dial.secondaryColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  applyOverlayTint(
    ctx,
    width,
    height,
    config.dial.overlayTintColor,
    config.dial.overlayTintOpacity
  );
}

export function drawRecessedSubDial(
  ctx: CanvasRenderingContext2D,
  sub: SubDialConfig,
  config: WatchFaceConfig,
  metricRatio: number
): void {
  if (!sub.enabled) return;
  const { width, height } = config.resolution;
  const minDim = Math.min(width, height);
  const cx = width / 2 + sub.relX * minDim;
  const cy = height / 2 + sub.relY * minDim;
  const r = sub.relRadius * minDim;
  const aoDepth = config.dial.recessedAoDepth;
  const lightRad = (config.dial.lightAngleDeg * Math.PI) / 180;
  const isLightPearl =
    config.dial.material === 'motherOfPearl' ||
    config.dial.material === 'iridescentRoseNacre';

  ctx.save();

  // 1. Outer bevel highlight rim
  const rimGrad = ctx.createLinearGradient(
    cx + Math.cos(lightRad) * r,
    cy + Math.sin(lightRad) * r,
    cx - Math.cos(lightRad) * r,
    cy - Math.sin(lightRad) * r
  );
  if (
    isLightPearl ||
    config.dial.material === 'iridescentTahitianPearl' ||
    config.bezel.style === 'diamondPave' ||
    config.bezel.style === 'doubleRowDiamondPave' ||
    config.bezel.style === 'flutedRoseGold'
  ) {
    rimGrad.addColorStop(0, '#783f42');
    rimGrad.addColorStop(0.5, '#f4af9d');
    rimGrad.addColorStop(1, '#fff1f2');
  } else {
    rimGrad.addColorStop(0, 'rgba(10, 12, 16, 0.92)');
    rimGrad.addColorStop(0.5, 'rgba(71, 85, 105, 0.35)');
    rimGrad.addColorStop(1, 'rgba(226, 232, 240, 0.45)');
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r + Math.max(1.5, minDim * 0.004), 0, Math.PI * 2);
  ctx.fillStyle = rimGrad;
  ctx.fill();

  // 2. Recessed cavity base
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const baseGrad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
  if (isLightPearl) {
    baseGrad.addColorStop(0, '#fdf8fa');
    baseGrad.addColorStop(0.8, '#efe0e7');
    baseGrad.addColorStop(1, '#dec7d2');
  } else {
    baseGrad.addColorStop(0, '#141824');
    baseGrad.addColorStop(0.85, '#0c0f17');
    baseGrad.addColorStop(1, '#08090d');
  }
  ctx.fillStyle = baseGrad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // 3. Concentric CD-style lathe micro-grooves
  const stepGroove = Math.max(2, minDim * 0.0048);
  ctx.lineWidth = Math.max(0.65, minDim * 0.0015);
  for (let gr = 4; gr < r - 2; gr += stepGroove) {
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, Math.PI * 2);
    ctx.strokeStyle = isLightPearl
      ? 'rgba(181, 101, 87, 0.09)'
      : 'rgba(255,255,255,0.035)';
    ctx.stroke();
  }

  // 4. Inner Ambient Occlusion shadow
  const aoOffset = r * 0.16 * aoDepth;
  const aoX = cx - Math.cos(lightRad) * aoOffset;
  const aoY = cy - Math.sin(lightRad) * aoOffset;
  const aoGrad = ctx.createRadialGradient(aoX, aoY, r * 0.72, cx, cy, r * 1.04);
  aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
  aoGrad.addColorStop(0.7, `rgba(0,0,0,${((isLightPearl ? 0.14 : 0.32) * aoDepth).toFixed(2)})`);
  aoGrad.addColorStop(1, `rgba(0,0,0,${((isLightPearl ? 0.32 : 0.82) * aoDepth).toFixed(2)})`);
  ctx.fillStyle = aoGrad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // 5. Sub-dial graduation ticks
  const tickTotal = 24;
  for (let i = 0; i < tickTotal; i++) {
    const a = (i / tickTotal) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 6 === 0;
    const inner = r * (isMajor ? 0.76 : 0.84);
    const outer = r * 0.93;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.strokeStyle = isMajor
      ? sub.accentColor
      : isLightPearl
      ? 'rgba(120, 63, 66, 0.45)'
      : 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = isMajor ? Math.max(1.5, minDim * 0.0032) : Math.max(0.85, minDim * 0.0018);
    ctx.stroke();
  }

  // 6. Sub-dial label
  ctx.fillStyle = isLightPearl ? '#6e3b47' : 'rgba(148, 163, 184, 0.82)';
  ctx.font = `600 ${Math.max(7, Math.round(r * 0.19))}px "Outfit", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sub.label, cx, cy - r * 0.34);

  // 7. Miniature 3D sub-dial hand
  const clamped = Math.max(0, Math.min(1, metricRatio));
  const handAngle = -Math.PI * 0.75 + clamped * Math.PI * 1.5 - Math.PI / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(handAngle);

  const hw = Math.max(2, r * 0.045);
  ctx.beginPath();
  ctx.moveTo(-hw, 4);
  ctx.lineTo(0, -r * 0.76);
  ctx.lineTo(hw, 4);
  ctx.closePath();
  ctx.fillStyle = sub.accentColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2.2, r * 0.085), 0, Math.PI * 2);
  ctx.fillStyle = isLightPearl ? '#b56557' : '#e2e8f0';
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

export function drawBezelAndOuterRing(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig
): void {
  const { width, height, shape } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const outerR = minDim / 2;
  const style = config.bezel.style;

  ctx.save();

  if (renderLuxuryBezelTexture(ctx, config)) {
    ctx.restore();
    return;
  }

  if (shape === 'round') {
    const ringThick = outerR * 0.125;

    // Standard Tactical / Tachymeter / Compass sloped rehaut
    const rehautGrad = ctx.createRadialGradient(
      cx,
      cy,
      outerR - ringThick,
      cx,
      cy,
      outerR
    );
    rehautGrad.addColorStop(0, 'rgba(8, 10, 15, 0.88)');
    rehautGrad.addColorStop(0.25, config.bezel.primaryColor);
    rehautGrad.addColorStop(0.88, '#0f131a');
    rehautGrad.addColorStop(1, '#262f3f');

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, outerR - ringThick, 0, Math.PI * 2, true);
    ctx.fillStyle = rehautGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - ringThick, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
    ctx.lineWidth = Math.max(1.2, minDim * 0.0025);
    ctx.stroke();

    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const isHour = i % 5 === 0;
      const isQuarter = i % 15 === 0;

      const rStart = isHour ? outerR - ringThick * 0.92 : outerR - ringThick * 0.55;
      const rEnd = outerR - ringThick * 0.14;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * rStart, cy + Math.sin(angle) * rStart);
      ctx.lineTo(cx + Math.cos(angle) * rEnd, cy + Math.sin(angle) * rEnd);
      ctx.strokeStyle = isQuarter
        ? config.bezel.accentColor
        : isHour
        ? config.bezel.tickColor
        : 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = isQuarter
        ? Math.max(2.6, minDim * 0.0055)
        : isHour
        ? Math.max(1.8, minDim * 0.0038)
        : Math.max(1, minDim * 0.002);
      ctx.stroke();

      if (isHour && style !== 'minimal') {
        const batonIn = outerR - ringThick * 1.72;
        const batonOut = outerR - ringThick * 1.05;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + Math.PI / 2);

        const w = isQuarter ? Math.max(4, minDim * 0.017) : Math.max(3, minDim * 0.013);
        const len = batonOut - batonIn;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-w / 2 + 1.5, -batonOut + 2, w, len);

        ctx.fillStyle = config.bezel.markerMetalColor ?? '#cbd5e1';
        ctx.fillRect(-w / 2, -batonOut, w, len);

        if (config.bezel.lumePips) {
          ctx.fillStyle =
            config.bezel.markerLumeColor ??
            (isQuarter ? config.bezel.accentColor : '#f8fafc');
          ctx.fillRect(
            -w / 2 + 1.1,
            -batonOut + 1.5,
            Math.max(1, w - 2.2),
            Math.max(2, len - 3)
          );
        }
        ctx.restore();
      }
    }

    if (style === 'tachymeter' || style === 'compass') {
      const labels =
        style === 'compass'
          ? [
              { deg: 0, text: 'N' },
              { deg: 30, text: '30' },
              { deg: 60, text: '60' },
              { deg: 90, text: 'E' },
              { deg: 120, text: '120' },
              { deg: 150, text: '150' },
              { deg: 180, text: 'S' },
              { deg: 210, text: '210' },
              { deg: 240, text: '240' },
              { deg: 270, text: 'W' },
              { deg: 300, text: '300' },
              { deg: 330, text: '330' },
            ]
          : [
              { deg: 0, text: 'TACHY' },
              { deg: 36, text: '500' },
              { deg: 60, text: '350' },
              { deg: 90, text: '240' },
              { deg: 120, text: '180' },
              { deg: 150, text: '140' },
              { deg: 180, text: '120' },
              { deg: 210, text: '100' },
              { deg: 240, text: '90' },
              { deg: 270, text: '80' },
              { deg: 300, text: '70' },
              { deg: 330, text: '65' },
            ];

      ctx.font = `700 ${Math.max(8, Math.round(minDim * 0.023))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const item of labels) {
        const rad = ((item.deg - 90) * Math.PI) / 180;
        const rText = outerR - ringThick * 0.5;
        ctx.save();
        ctx.translate(cx + Math.cos(rad) * rText, cy + Math.sin(rad) * rText);
        ctx.rotate(rad + Math.PI / 2);
        ctx.fillStyle =
          item.deg % 90 === 0 ? config.bezel.accentColor : 'rgba(226,232,240,0.85)';
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }
    }
  } else {
    // Full-HD Sculpted Squircle Rehaut & Perimeter Track
    const { cornerRadius } = config.resolution;
    const ringThick = minDim * 0.068;

    const rehautGrad = ctx.createLinearGradient(0, 0, width, height);
    rehautGrad.addColorStop(0, '#262f3f');
    rehautGrad.addColorStop(0.28, config.bezel.primaryColor);
    rehautGrad.addColorStop(0.75, '#0f131a');
    rehautGrad.addColorStop(1, '#1e2633');

    ctx.beginPath();
    traceRoundedRectSubpath(ctx, 0, 0, width, height, cornerRadius, false);
    traceRoundedRectSubpath(
      ctx,
      ringThick,
      ringThick,
      width - ringThick * 2,
      height - ringThick * 2,
      Math.max(10, cornerRadius - ringThick),
      true
    );
    ctx.fillStyle = rehautGrad;
    ctx.fill('evenodd');

    roundedRectPath(
      ctx,
      ringThick,
      ringThick,
      width - ringThick * 2,
      height - ringThick * 2,
      Math.max(10, cornerRadius - ringThick)
    );
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
    ctx.lineWidth = Math.max(1.2, minDim * 0.0025);
    ctx.stroke();

    if (style !== 'minimal') {
      const outerTicks = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        ringThick * 0.25,
        60,
        0
      );
      const innerTicks = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        ringThick * 0.85,
        60,
        0
      );
      const midTicks = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        ringThick * 0.56,
        60,
        0
      );

      for (let i = 0; i < 60; i++) {
        const isHour = i % 5 === 0;
        const isQuarter = i % 15 === 0;
        const pOut = outerTicks[i];
        const pIn = isHour ? innerTicks[i] : midTicks[i];

        ctx.beginPath();
        ctx.moveTo(pIn.x, pIn.y);
        ctx.lineTo(pOut.x, pOut.y);
        ctx.strokeStyle = isQuarter
          ? config.bezel.accentColor
          : isHour
          ? config.bezel.tickColor
          : 'rgba(148,163,184,0.42)';
        ctx.lineWidth = isQuarter
          ? Math.max(2.4, minDim * 0.005)
          : isHour
          ? Math.max(1.6, minDim * 0.0035)
          : Math.max(0.9, minDim * 0.0018);
        ctx.stroke();
      }

      if (config.bezel.lumePips) {
        const dialRx = width * 0.37;
        const dialRy = height * 0.39;
        for (let h = 0; h < 12; h++) {
          const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const denom = Math.pow(
            Math.pow(Math.abs(cosA), 2.8) + Math.pow(Math.abs(sinA), 2.8),
            1 / 2.8
          );
          const bx = cx + (cosA / denom) * dialRx;
          const by = cy + (sinA / denom) * dialRy;
          const isQuarter = h % 3 === 0;
          const bw = isQuarter ? Math.max(4, minDim * 0.015) : Math.max(3, minDim * 0.011);
          const blen = isQuarter ? Math.max(10, minDim * 0.036) : Math.max(7, minDim * 0.026);

          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(angle + Math.PI / 2);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(-bw / 2 + 1.2, -blen / 2 + 1.5, bw, blen);
          ctx.fillStyle = config.bezel.markerMetalColor ?? '#cbd5e1';
          ctx.fillRect(-bw / 2, -blen / 2, bw, blen);
          ctx.fillStyle =
            config.bezel.markerLumeColor ??
            (isQuarter ? config.bezel.accentColor : '#f8fafc');
          ctx.fillRect(-bw / 2 + 1, -blen / 2 + 1.2, Math.max(1, bw - 2), Math.max(2, blen - 2.4));
          ctx.restore();
        }
      }
    }
  }

  ctx.restore();
}

export function drawSapphireGlare(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig
): void {
  if (!config.glassCap.sapphireGlare || config.glassCap.glareIntensity <= 0.01) {
    return;
  }
  const { width, height } = config.resolution;
  const alpha = config.glassCap.glareIntensity * 0.22;

  ctx.save();
  const glareGrad = ctx.createLinearGradient(0, 0, width, height);
  glareGrad.addColorStop(0, `rgba(186, 230, 253, ${(alpha * 1.15).toFixed(3)})`);
  glareGrad.addColorStop(0.36, `rgba(255, 255, 255, ${(alpha * 0.7).toFixed(3)})`);
  glareGrad.addColorStop(0.48, 'rgba(255, 255, 255, 0)');
  glareGrad.addColorStop(0.82, 'rgba(15, 23, 42, 0)');
  glareGrad.addColorStop(1, `rgba(56, 189, 248, ${(alpha * 0.45).toFixed(3)})`);

  ctx.fillStyle = glareGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
