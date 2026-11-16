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
      if (
        Math.abs(customImg.brightness - 1) > 0.005 ||
        Math.abs(customImg.contrast - 1) > 0.005
      ) {
        ctx.filter = `brightness(${customImg.brightness}) contrast(${customImg.contrast})`;
      }
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

  // Delegate Luxury Femme & procedural iridescent surface shaders to the Texture Engine (capped at 512px shader canvas then upscaled smoothly for 2048px supersampling speed)
  const shaderScale = Math.min(1, 512 / Math.max(width, height));
  const sw = Math.max(64, Math.round(width * shaderScale));
  const sh = Math.max(64, Math.round(height * shaderScale));
  const makeShaderCanvas = () => {
    const sc = document.createElement('canvas');
    sc.width = sw;
    sc.height = sh;
    return sc;
  };

  if (
    config.dial.material === 'motherOfPearl' ||
    config.dial.material === 'iridescentRoseNacre' ||
    config.dial.material === 'iridescentTahitianPearl' ||
    config.dial.material === 'roseGoldGuilloche' ||
    config.dial.material === 'celestialAventurine' ||
    config.dial.material === 'silkBlushEnamel'
  ) {
    const shaderCanvas = makeShaderCanvas();
    const sctx = shaderCanvas.getContext('2d')!;
    const shaderConfig: WatchFaceConfig =
      shaderScale < 1
        ? {
            ...config,
            resolution: {
              ...config.resolution,
              width: sw,
              height: sh,
              cornerRadius: Math.round(config.resolution.cornerRadius * shaderScale),
            },
          }
        : config;
    if (renderLuxuryTextureShader(sctx, shaderConfig)) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(shaderCanvas, 0, 0, width, height);
      ctx.restore();
      applyOverlayTint(
        ctx,
        width,
        height,
        config.dial.overlayTintColor,
        config.dial.overlayTintOpacity
      );
      return;
    }
  }

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.hypot(cx, cy);
  const [r1, g1, b1] = hexToRgb(config.dial.baseColor);
  const [r2, g2, b2] = hexToRgb(config.dial.secondaryColor);
  const lightRad = (config.dial.lightAngleDeg * Math.PI) / 180;
  const mat = config.dial.material;

  if (mat === 'sunburst' || mat === 'forgedCarbon' || mat === 'matteCeramic') {
    const shaderCanvas = makeShaderCanvas();
    const sctx = shaderCanvas.getContext('2d')!;
    const scx = sw / 2;
    const scy = sh / 2;
    const smaxR = Math.hypot(scx, scy);
    const img = sctx.createImageData(sw, sh);
    const data = img.data;

    if (mat === 'sunburst') {
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const dx = x - scx;
          const dy = y - scy;
          const dist = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);

          const lobeA = Math.pow(Math.max(0, Math.cos(angle - lightRad)), 4);
          const lobeB = Math.pow(Math.max(0, Math.cos(angle - lightRad - Math.PI)), 4);
          const cone = lobeA * 0.72 + lobeB * 0.45;

          const brushAngleIdx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 900);
          const radialGrain = (hash2d(brushAngleIdx, 17) - 0.5) * 24;
          const microRing = Math.sin(dist * 0.9) * 3;
          const vignette = 1 - Math.min(1, dist / smaxR) * 0.38;

          const t = Math.min(1, cone);
          const baseR = r1 + (r2 - r1) * t;
          const baseG = g1 + (g2 - g1) * t;
          const baseB = b1 + (b2 - b1) * t;

          const idx = (y * sw + x) * 4;
          data[idx] = Math.max(8, Math.min(255, baseR * vignette + radialGrain + microRing));
          data[idx + 1] = Math.max(8, Math.min(255, baseG * vignette + radialGrain + microRing));
          data[idx + 2] = Math.max(8, Math.min(255, baseB * vignette + radialGrain + microRing));
          data[idx + 3] = 255;
        }
      }
    } else if (mat === 'forgedCarbon') {
      const freqScale = 466 / Math.max(1, Math.min(sw, sh));
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const dx = x - scx;
          const dy = y - scy;
          const dist = Math.hypot(dx, dy);
          const fx = x * freqScale;
          const fy = y * freqScale;
          const n1 = fbm(fx * 0.045, fy * 0.045, 4);
          const n2 = fbm(fx * 0.14 + 31.7, fy * 0.14 - 11.2, 3);
          const flake = Math.abs(n1 - n2) < 0.09 ? 0.25 : n1 * 0.85;
          const micro = (hash2d(x, y) - 0.5) * 7;

          const lx = Math.cos(lightRad) * (dx / smaxR);
          const ly = Math.sin(lightRad) * (dy / smaxR);
          const lightShade = 1 + (lx + ly) * 0.18;
          const vignette = 1 - Math.min(1, dist / smaxR) * 0.34;

          const idx = (y * sw + x) * 4;
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
    } else {
      const freqScale = 466 / Math.max(1, Math.min(sw, sh));
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const dx = x - scx;
          const dy = y - scy;
          const dist = Math.hypot(dx, dy);
          const fx = x * freqScale;
          const fy = y * freqScale;
          const grain = fbm(fx * 0.08, fy * 0.08, 3) * 0.5 + (hash2d(x, y) - 0.5) * 0.18;
          const lx = Math.cos(lightRad) * (dx / smaxR);
          const ly = Math.sin(lightRad) * (dy / smaxR);
          const shade = Math.max(0.65, Math.min(1.22, 1 + (lx + ly) * 0.24 - (dist / smaxR) * 0.25));

          const idx = (y * sw + x) * 4;
          data[idx] = Math.max(8, Math.min(255, (r1 + (r2 - r1) * grain) * shade));
          data[idx + 1] = Math.max(8, Math.min(255, (g1 + (g2 - g1) * grain) * shade));
          data[idx + 2] = Math.max(8, Math.min(255, (b1 + (b2 - b1) * grain) * shade));
          data[idx + 3] = 255;
        }
      }
    }

    sctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(shaderCanvas, 0, 0, width, height);
    ctx.restore();
  } else {
    const grad = ctx.createRadialGradient(
      cx + Math.cos(lightRad) * maxR * 0.12,
      cy + Math.sin(lightRad) * maxR * 0.12,
      maxR * 0.08,
      cx,
      cy,
      maxR
    );
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
    rimGrad.addColorStop(0, 'rgba(226, 232, 240, 0.55)');
    rimGrad.addColorStop(0.5, 'rgba(71, 85, 105, 0.35)');
    rimGrad.addColorStop(1, 'rgba(10, 12, 16, 0.92)');
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

  // 3. Concentric lathe micro-grooves (azurage)
  const stepGroove = Math.max(2, minDim * 0.0044);
  ctx.lineWidth = Math.max(0.65, minDim * 0.0014);
  for (let gr = stepGroove * 1.4; gr < r - 2; gr += stepGroove) {
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, Math.PI * 2);
    ctx.strokeStyle = isLightPearl
      ? 'rgba(181, 101, 87, 0.11)'
      : 'rgba(255,255,255,0.048)';
    ctx.stroke();
  }

  // 4. Inner Ambient Occlusion shadow
  const aoOffset = r * 0.18 * aoDepth;
  const aoX = cx + Math.cos(lightRad) * aoOffset;
  const aoY = cy + Math.sin(lightRad) * aoOffset;
  const aoGrad = ctx.createRadialGradient(aoX, aoY, r * 0.68, cx, cy, r * 1.04);
  aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
  aoGrad.addColorStop(0.7, `rgba(0,0,0,${((isLightPearl ? 0.16 : 0.36) * aoDepth).toFixed(2)})`);
  aoGrad.addColorStop(1, `rgba(0,0,0,${((isLightPearl ? 0.36 : 0.86) * aoDepth).toFixed(2)})`);
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
  ctx.moveTo(-hw, minDim * 0.008);
  ctx.lineTo(0, -r * 0.76);
  ctx.lineTo(hw, minDim * 0.008);
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

function drawFaceted3DHourBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotAngleRad: number,
  widthPx: number,
  lengthPx: number,
  metalHex: string,
  lumeHex: string | null,
  lightAngleRad: number
): void {
  const shadowDist = Math.max(1.8, widthPx * 0.32);
  const sdx = -Math.cos(lightAngleRad) * shadowDist;
  const sdy = -Math.sin(lightAngleRad) * shadowDist;

  // Cast shadow onto dial plate in global studio light coordinates
  ctx.save();
  ctx.translate(x + sdx, y + sdy);
  ctx.rotate(rotAngleRad);
  ctx.fillStyle = 'rgba(8, 8, 8, 0.62)';
  ctx.fillRect(-widthPx / 2, -lengthPx / 2, widthPx, lengthPx);
  ctx.restore();

  const [mr, mg, mb] = hexToRgb(metalHex);
  const bright = `rgb(${Math.min(255, Math.round(mr * 1.24 + 34))}, ${Math.min(255, Math.round(mg * 1.24 + 34))}, ${Math.min(255, Math.round(mb * 1.24 + 34))})`;
  const mid = `rgb(${mr}, ${mg}, ${mb})`;
  const dark = `rgb(${Math.max(12, Math.round(mr * 0.45))}, ${Math.max(12, Math.round(mg * 0.45))}, ${Math.max(12, Math.round(mb * 0.45))})`;

  const hw = widthPx / 2;
  const hl = lengthPx / 2;
  const chamferX = hw * 0.42;
  const chamferY = Math.min(hl * 0.35, chamferX * 1.2);

  // Align facet brightness dynamically with studio light vs marker normal
  const facing = Math.cos(rotAngleRad - lightAngleRad);
  const topCol = facing >= 0 ? bright : mid;
  const botCol = facing >= 0 ? dark : mid;
  const leftCol = Math.sin(rotAngleRad - lightAngleRad) <= 0 ? bright : dark;
  const rightCol = Math.sin(rotAngleRad - lightAngleRad) <= 0 ? dark : bright;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotAngleRad);

  // Top chamfer plane
  ctx.beginPath();
  ctx.moveTo(-hw, -hl);
  ctx.lineTo(hw, -hl);
  ctx.lineTo(hw - chamferX, -hl + chamferY);
  ctx.lineTo(-hw + chamferX, -hl + chamferY);
  ctx.closePath();
  ctx.fillStyle = topCol;
  ctx.fill();

  // Right chamfer plane
  ctx.beginPath();
  ctx.moveTo(hw, -hl);
  ctx.lineTo(hw, hl);
  ctx.lineTo(hw - chamferX, hl - chamferY);
  ctx.lineTo(hw - chamferX, -hl + chamferY);
  ctx.closePath();
  ctx.fillStyle = rightCol;
  ctx.fill();

  // Bottom chamfer plane
  ctx.beginPath();
  ctx.moveTo(-hw, hl);
  ctx.lineTo(hw, hl);
  ctx.lineTo(hw - chamferX, hl - chamferY);
  ctx.lineTo(-hw + chamferX, hl - chamferY);
  ctx.closePath();
  ctx.fillStyle = botCol;
  ctx.fill();

  // Left chamfer plane
  ctx.beginPath();
  ctx.moveTo(-hw, -hl);
  ctx.lineTo(-hw, hl);
  ctx.lineTo(-hw + chamferX, hl - chamferY);
  ctx.lineTo(-hw + chamferX, -hl + chamferY);
  ctx.closePath();
  ctx.fillStyle = leftCol;
  ctx.fill();

  // Luminous / polished center plateau
  ctx.fillStyle = lumeHex ?? mid;
  ctx.fillRect(
    -hw + chamferX * 0.72,
    -hl + chamferY * 0.72,
    Math.max(1.5, widthPx - chamferX * 1.44),
    Math.max(2, lengthPx - chamferY * 1.44)
  );

  // Crisp top specular edge
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = Math.max(0.8, widthPx * 0.08);
  ctx.strokeRect(-hw, -hl, widthPx, lengthPx);
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
  const lightRad = ((config.dial.lightAngleDeg ?? 315) * Math.PI) / 180;
  const aoDepth = Math.max(0.15, Math.min(1, config.dial.recessedAoDepth ?? 0.45));

  ctx.save();

  if (renderLuxuryBezelTexture(ctx, config)) {
    ctx.restore();
    return;
  }

  const lx = Math.cos(lightRad);
  const ly = Math.sin(lightRad);

  if (shape === 'round') {
    const caseRimThick = outerR * 0.036;
    const ceramicThick = outerR * 0.078;
    const rehautThick = outerR * 0.044;
    const totalBezelThick = caseRimThick + ceramicThick + rehautThick;
    const rehautInnerR = outerR - totalBezelThick;

    // 1. Brushed Metallic Case Rim + Sculpted Lug Shoulders (inside round crystal edge)
    const caseGrad = ctx.createLinearGradient(
      cx + lx * outerR,
      cy + ly * outerR,
      cx - lx * outerR,
      cy - ly * outerR
    );
    caseGrad.addColorStop(0, '#f1f5f9');
    caseGrad.addColorStop(0.25, config.bezel.caseTintColor ?? '#94a3b8');
    caseGrad.addColorStop(0.6, '#334155');
    caseGrad.addColorStop(1, '#0f172a');

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, outerR - caseRimThick, 0, Math.PI * 2, true);
    ctx.fillStyle = caseGrad;
    ctx.fill();

    // 2px Diamond-Cut Outer & Inner Edge Highlights on Metallic Case Rim
    const diamondWidth = Math.max(1.5, minDim * 0.0024);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - diamondWidth * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.lineWidth = diamondWidth;
    ctx.stroke();

    // 2. Glossy Ceramic / Tachymeter Bezel Insert
    const ceramicOuterR = outerR - caseRimThick;
    const ceramicInnerR = ceramicOuterR - ceramicThick;
    const ceramicGrad = ctx.createLinearGradient(
      cx + lx * ceramicOuterR,
      cy + ly * ceramicOuterR,
      cx - lx * ceramicOuterR,
      cy - ly * ceramicOuterR
    );
    ceramicGrad.addColorStop(0, '#334155');
    ceramicGrad.addColorStop(0.18, config.bezel.primaryColor);
    ceramicGrad.addColorStop(0.65, '#0c1018');
    ceramicGrad.addColorStop(1, '#1e293b');

    ctx.beginPath();
    ctx.arc(cx, cy, ceramicOuterR, 0, Math.PI * 2);
    ctx.arc(cx, cy, ceramicInnerR, 0, Math.PI * 2, true);
    ctx.fillStyle = ceramicGrad;
    ctx.fill();

    // Glossy sapphire-ceramic specular arc along bezel insert
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      (ceramicOuterR + ceramicInnerR) * 0.5,
      lightRad - 0.85,
      lightRad + 0.85
    );
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = ceramicThick * 0.42;
    ctx.stroke();

    // Diamond-cut step between ceramic insert and 45° inner rehaut
    ctx.beginPath();
    ctx.arc(cx, cy, ceramicInnerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.44)';
    ctx.lineWidth = diamondWidth * 0.9;
    ctx.stroke();

    // 3. Angled 45° Inner Chapter Ring (Rehaut) with Cylindrical Shading
    const rehautSegs = 48;
    for (let s = 0; s < rehautSegs; s++) {
      const a0 = (s / rehautSegs) * Math.PI * 2;
      const a1 = ((s + 1.04) / rehautSegs) * Math.PI * 2;
      const midA = (a0 + a1) * 0.5;
      const lit = (Math.cos(midA - lightRad) + 1) * 0.5;
      const shade = Math.round(18 + lit * 62);
      ctx.beginPath();
      ctx.arc(cx, cy, ceramicInnerR, a0, a1);
      ctx.arc(cx, cy, rehautInnerR, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
      ctx.fill();
    }

    // 4. Deep Ambient Occlusion Shadow Cast onto the Dial Plate from Bezel/Rehaut
    const aoReach = rehautInnerR * 0.14;
    const dialAoGrad = ctx.createRadialGradient(
      cx + lx * minDim * 0.012,
      cy + ly * minDim * 0.012,
      Math.max(10, rehautInnerR - aoReach),
      cx,
      cy,
      rehautInnerR + minDim * 0.005
    );
    dialAoGrad.addColorStop(0, 'rgba(8, 8, 8, 0)');
    dialAoGrad.addColorStop(0.55, `rgba(8, 8, 8, ${(0.28 * aoDepth).toFixed(2)})`);
    dialAoGrad.addColorStop(1, `rgba(8, 8, 8, ${(0.78 * aoDepth).toFixed(2)})`);
    ctx.beginPath();
    ctx.arc(cx, cy, rehautInnerR, 0, Math.PI * 2);
    ctx.fillStyle = dialAoGrad;
    ctx.fill();

    // Rehaut subtle inner edge lip
    ctx.beginPath();
    ctx.arc(cx, cy, rehautInnerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
    ctx.lineWidth = Math.max(1, minDim * 0.0018);
    ctx.stroke();

    // 5. Chapter Ring Ticks + Raised 3D Faceted Metallic Hour Markers
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const isHour = i % 5 === 0;
      const isQuarter = i % 15 === 0;

      const rStart = isHour
        ? rehautInnerR + rehautThick * 0.08
        : rehautInnerR + rehautThick * 0.28;
      const rEnd = ceramicInnerR - rehautThick * 0.08;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * rStart, cy + Math.sin(angle) * rStart);
      ctx.lineTo(cx + Math.cos(angle) * rEnd, cy + Math.sin(angle) * rEnd);
      ctx.strokeStyle = isQuarter
        ? config.bezel.accentColor
        : isHour
        ? config.bezel.tickColor
        : 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = isQuarter
        ? Math.max(2.2, minDim * 0.0046)
        : isHour
        ? Math.max(1.5, minDim * 0.0032)
        : Math.max(0.9, minDim * 0.0017);
      ctx.stroke();

      if (isHour && style !== 'minimal') {
        const markerCenterR = rehautInnerR - minDim * 0.042;
        const mx = cx + Math.cos(angle) * markerCenterR;
        const my = cy + Math.sin(angle) * markerCenterR;
        const w = isQuarter ? Math.max(4, minDim * 0.022) : Math.max(3, minDim * 0.015);
        const len = isQuarter ? minDim * 0.068 : minDim * 0.052;
        const lumeColor = config.bezel.lumePips
          ? config.bezel.markerLumeColor ??
            (isQuarter ? config.bezel.accentColor : '#f8fafc')
          : null;

        drawFaceted3DHourBlock(
          ctx,
          mx,
          my,
          angle + Math.PI / 2,
          w,
          len,
          config.bezel.markerMetalColor ?? '#cbd5e1',
          lumeColor,
          lightRad
        );
      }
    }

    // Engraved Numerals on Ceramic Bezel Insert
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

      ctx.font = `700 ${Math.max(8, Math.round(minDim * 0.021))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const rText = ceramicInnerR + ceramicThick * 0.5;
      for (const item of labels) {
        const rad = ((item.deg - 90) * Math.PI) / 180;
        ctx.save();
        ctx.translate(cx + Math.cos(rad) * rText, cy + Math.sin(rad) * rText);
        ctx.rotate(rad + Math.PI / 2);
        // Subtle engraved dark recess behind numeral
        ctx.fillStyle = 'rgba(8, 8, 8, 0.75)';
        ctx.fillText(item.text, 0.5, 1.0);
        ctx.fillStyle =
          item.deg % 90 === 0 ? config.bezel.accentColor : 'rgba(226,232,240,0.88)';
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }
    }
  } else {
    // Full-HD Sculpted Squircle Case Rim + Ceramic Bezel + 45° Inner Rehaut + AO
    const { cornerRadius } = config.resolution;
    const caseThick = minDim * 0.022;
    const ringThick = minDim * 0.068;
    const totalBezel = caseThick + ringThick;

    // 1. Metallic outer case lip with directional sheen
    const caseGrad = ctx.createLinearGradient(
      cx + lx * (width * 0.5),
      cy + ly * (height * 0.5),
      cx - lx * (width * 0.5),
      cy - ly * (height * 0.5)
    );
    caseGrad.addColorStop(0, '#f1f5f9');
    caseGrad.addColorStop(0.28, config.bezel.caseTintColor ?? '#94a3b8');
    caseGrad.addColorStop(0.7, '#334155');
    caseGrad.addColorStop(1, '#0f172a');

    ctx.beginPath();
    traceRoundedRectSubpath(ctx, 0, 0, width, height, cornerRadius, false);
    traceRoundedRectSubpath(
      ctx,
      caseThick,
      caseThick,
      width - caseThick * 2,
      height - caseThick * 2,
      Math.max(10, cornerRadius - caseThick),
      true
    );
    ctx.fillStyle = caseGrad;
    ctx.fill('evenodd');

    // 2. Ceramic bezel insert & 45° rehaut
    const rehautGrad = ctx.createLinearGradient(
      cx + lx * (width * 0.45),
      cy + ly * (height * 0.45),
      cx - lx * (width * 0.45),
      cy - ly * (height * 0.45)
    );
    rehautGrad.addColorStop(0, '#334155');
    rehautGrad.addColorStop(0.25, config.bezel.primaryColor);
    rehautGrad.addColorStop(0.75, '#0d1118');
    rehautGrad.addColorStop(1, '#1e2633');

    ctx.beginPath();
    traceRoundedRectSubpath(
      ctx,
      caseThick,
      caseThick,
      width - caseThick * 2,
      height - caseThick * 2,
      Math.max(10, cornerRadius - caseThick),
      false
    );
    traceRoundedRectSubpath(
      ctx,
      totalBezel,
      totalBezel,
      width - totalBezel * 2,
      height - totalBezel * 2,
      Math.max(10, cornerRadius - totalBezel),
      true
    );
    ctx.fillStyle = rehautGrad;
    ctx.fill('evenodd');

    // 2px Diamond-cut highlight bevel edges
    roundedRectPath(
      ctx,
      caseThick,
      caseThick,
      width - caseThick * 2,
      height - caseThick * 2,
      Math.max(10, cornerRadius - caseThick)
    );
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(1.4, minDim * 0.0022);
    ctx.stroke();

    roundedRectPath(
      ctx,
      totalBezel,
      totalBezel,
      width - totalBezel * 2,
      height - totalBezel * 2,
      Math.max(10, cornerRadius - totalBezel)
    );
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.26)';
    ctx.lineWidth = Math.max(1.2, minDim * 0.002);
    ctx.stroke();

    // Inner Dial Ambient Occlusion Shadow cast from bezel
    ctx.save();
    roundedRectPath(
      ctx,
      totalBezel,
      totalBezel,
      width - totalBezel * 2,
      height - totalBezel * 2,
      Math.max(10, cornerRadius - totalBezel)
    );
    ctx.clip();
    const sqAoGrad = ctx.createRadialGradient(
      cx + lx * minDim * 0.015,
      cy + ly * minDim * 0.015,
      minDim * 0.28,
      cx,
      cy,
      Math.max(width, height) * 0.62
    );
    sqAoGrad.addColorStop(0, 'rgba(8, 8, 8, 0)');
    sqAoGrad.addColorStop(0.7, `rgba(8, 8, 8, ${(0.24 * aoDepth).toFixed(2)})`);
    sqAoGrad.addColorStop(1, `rgba(8, 8, 8, ${(0.72 * aoDepth).toFixed(2)})`);
    ctx.fillStyle = sqAoGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (style !== 'minimal') {
      const outerTicks = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        caseThick + ringThick * 0.16,
        60,
        0
      );
      const innerTicks = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        caseThick + ringThick * 0.85,
        60,
        0
      );
      const midTicks = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        caseThick + ringThick * 0.52,
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
          : 'rgba(148,163,184,0.45)';
        ctx.lineWidth = isQuarter
          ? Math.max(2.2, minDim * 0.0046)
          : isHour
          ? Math.max(1.5, minDim * 0.0032)
          : Math.max(0.9, minDim * 0.0017);
        ctx.stroke();
      }

      if (config.bezel.lumePips) {
        const dialRx = width * 0.36;
        const dialRy = height * 0.38;
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
          const bw = isQuarter ? Math.max(4, minDim * 0.02) : Math.max(3, minDim * 0.014);
          const blen = isQuarter ? Math.max(10, minDim * 0.052) : Math.max(7, minDim * 0.038);

          drawFaceted3DHourBlock(
            ctx,
            bx,
            by,
            angle + Math.PI / 2,
            bw,
            blen,
            config.bezel.markerMetalColor ?? '#cbd5e1',
            config.bezel.markerLumeColor ??
              (isQuarter ? config.bezel.accentColor : '#f8fafc'),
            lightRad
          );
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
