import { DialMaterial, WatchFaceConfig } from '../types/watchface';

export function hash2d(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = (n ^ (n >> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

export function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2d(xi, yi);
  const b = hash2d(xi + 1, yi);
  const c = hash2d(xi, yi + 1);
  const d = hash2d(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export interface IridescentSpectrumSample {
  rShift: number;
  gShift: number;
  bShift: number;
  fresnelSheen: number;
}

export type IridescenceProfile = 'opalPearl' | 'roseChampagne' | 'tahitianPeacock';

/**
 * Pure physically-inspired thin-film optical interference solver for the Texture Engine.
 * Models aragonite nacre platelet Bragg diffraction across RGB wavelengths.
 */
export function evaluateIridescentSpectrum(
  phase: number,
  angleDelta: number,
  intensity = 1.0,
  profile: IridescenceProfile = 'opalPearl'
): IridescentSpectrumSample {
  const clampedIntensity = Math.max(0, Math.min(2.0, intensity));
  const fresnelSheen = Math.pow(Math.max(0, Math.cos(angleDelta)), 2.8);

  if (profile === 'tahitianPeacock') {
    // Deep Tahitian black mother-of-pearl: peacock emerald-teal -> violet -> magenta shifts
    const rShift =
      (Math.sin(phase * 1.15 + 4.4) * 26 + Math.cos(phase * 0.65) * 14) *
      clampedIntensity;
    const gShift =
      (Math.sin(phase * 1.15 + 1.8) * 34 + fresnelSheen * 18) *
      clampedIntensity;
    const bShift =
      (Math.sin(phase * 1.15 + 3.1) * 38 + Math.cos(phase * 0.8) * 12) *
      clampedIntensity;
    return { rShift, gShift, bShift, fresnelSheen };
  }

  if (profile === 'roseChampagne') {
    // Delicate French Riviera rose-champagne nacre: blush rose -> warm gold -> pearl lavender
    const rShift =
      (Math.sin(phase + 0.35) * 20 + fresnelSheen * 16) * clampedIntensity;
    const gShift =
      (Math.sin(phase + 2.05) * 15 + Math.cos(phase * 0.85) * 8) *
      clampedIntensity;
    const bShift =
      (Math.sin(phase + 3.85) * 19 + Math.cos(phase * 0.7) * 9) *
      clampedIntensity;
    return { rShift, gShift, bShift, fresnelSheen };
  }

  // 'opalPearl': Classic white-blush-aqua opalescent mother-of-pearl
  const rShift =
    (Math.sin(phase) * 17 + Math.cos(phase * 0.7) * 11) * clampedIntensity;
  const gShift =
    (Math.sin(phase + 2.1) * 15 + Math.cos(phase * 0.9) * 9) * clampedIntensity;
  const bShift =
    (Math.sin(phase + 4.2) * 19 + fresnelSheen * 12) * clampedIntensity;
  return { rShift, gShift, bShift, fresnelSheen };
}

export function isIridescentTextureMaterial(material: DialMaterial): boolean {
  return (
    material === 'motherOfPearl' ||
    material === 'iridescentRoseNacre' ||
    material === 'iridescentTahitianPearl' ||
    material === 'roseGoldGuilloche' ||
    material === 'celestialAventurine' ||
    material === 'silkBlushEnamel'
  );
}

/**
 * Pure procedural Texture Engine pixel evaluator for Mother-of-Pearl & Iridescent Nacre styles.
 * Returns clamped [R, G, B] values (guaranteed >= 8 to respect FitCloudPro #080808 guard).
 */
export function sampleIridescentNacrePixel(
  nx: number,
  ny: number,
  baseRgb: [number, number, number],
  secondaryRgb: [number, number, number],
  lightRad: number,
  iridescenceIntensity = 1.0,
  profile: IridescenceProfile = 'opalPearl'
): [number, number, number] {
  const dist = Math.hypot(nx, ny);
  const angle = Math.atan2(ny, nx);

  // Scale normalized coordinates (-1..1) into consistent nacre platelet frequency space
  const sx = (nx + 1) * 233;
  const sy = (ny + 1) * 233;

  const nacreWave = fbm(sx * 0.017, sy * 0.013, 4);
  const fineRipple = fbm(
    sx * 0.052 + nacreWave * 3.4,
    sy * 0.052 - nacreWave * 2.6,
    3
  );
  const swirl = Math.sin(dist * 9.5 + nacreWave * 5.0) * 0.35;
  const phase =
    nacreWave * 6.4 +
    fineRipple * 4.8 +
    swirl +
    Math.cos(angle - lightRad) * 1.5;

  const spec = evaluateIridescentSpectrum(
    phase,
    angle - lightRad,
    iridescenceIntensity,
    profile
  );

  const vignette = 1 - Math.min(1, dist * 0.85) * (profile === 'tahitianPeacock' ? 0.28 : 0.16);
  const blend = Math.max(0, Math.min(1, fineRipple * 0.62 + spec.fresnelSheen * 0.38));

  const baseR = baseRgb[0] + (secondaryRgb[0] - baseRgb[0]) * blend;
  const baseG = baseRgb[1] + (secondaryRgb[1] - baseRgb[1]) * blend;
  const baseB = baseRgb[2] + (secondaryRgb[2] - baseRgb[2]) * blend;

  return [
    Math.max(8, Math.min(255, Math.round((baseR + spec.rShift) * vignette))),
    Math.max(8, Math.min(255, Math.round((baseG + spec.gShift) * vignette))),
    Math.max(8, Math.min(255, Math.round((baseB + spec.bShift) * vignette))),
  ];
}

/**
 * Renders any Luxury Femme procedural iridescent surface shader into a CanvasRenderingContext2D.
 * Supports full 1080x1080 Full HD resolution cleanly.
 */
export function renderLuxuryTextureShader(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig
): boolean {
  const { width, height } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const halfDim = minDim * 0.5;
  const maxR = Math.hypot(cx, cy);
  const baseRgb = hexToRgb(config.dial.baseColor);
  const secRgb = hexToRgb(config.dial.secondaryColor);
  const lightRad = (config.dial.lightAngleDeg * Math.PI) / 180;
  const iridIntensity = config.dial.iridescenceIntensity ?? 1.0;
  const mat = config.dial.material;

  if (
    mat === 'motherOfPearl' ||
    mat === 'iridescentRoseNacre' ||
    mat === 'iridescentTahitianPearl'
  ) {
    const profile: IridescenceProfile =
      mat === 'iridescentTahitianPearl'
        ? 'tahitianPeacock'
        : mat === 'iridescentRoseNacre'
        ? 'roseChampagne'
        : 'opalPearl';

    const img = ctx.createImageData(width, height);
    const data = img.data;
    const invHalf = 1 / halfDim;

    for (let y = 0; y < height; y++) {
      const ny = (y - cy) * invHalf;
      for (let x = 0; x < width; x++) {
        const nx = (x - cx) * invHalf;
        const [cr, cg, cb] = sampleIridescentNacrePixel(
          nx,
          ny,
          baseRgb,
          secRgb,
          lightRad,
          iridIntensity,
          profile
        );
        const idx = (y * width + x) * 4;
        data[idx] = cr;
        data[idx + 1] = cg;
        data[idx + 2] = cb;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return true;
  }

  if (mat === 'roseGoldGuilloche') {
    const img = ctx.createImageData(width, height);
    const data = img.data;
    const [r1, g1, b1] = baseRgb;
    const [r2, g2, b2] = secRgb;

    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dist = Math.hypot(dx, dy);
        const normR = dist / halfDim;
        const angle = Math.atan2(dy, dx);

        // Dual engine-turned Flinqué rosette interference + subtle iridescent rose-gold sheen
        const wave1 = Math.sin(angle * 36 + Math.sin(normR * 28) * 1.85);
        const wave2 = Math.cos(angle * 36 - Math.sin(normR * 28) * 1.85);
        const guillocheRidge = (wave1 * wave2 + 1) * 0.5;

        const lobeA = Math.pow(Math.max(0, Math.cos(angle - lightRad)), 3);
        const lobeB = Math.pow(
          Math.max(0, Math.cos(angle - lightRad - Math.PI)),
          3
        );
        const spec = lobeA * 0.74 + lobeB * 0.44;
        const vignette = 1 - Math.min(1, dist / maxR) * 0.3;

        const iridShift = Math.sin(normR * 14 + angle * 2 - lightRad) * 9 * iridIntensity;
        const t = Math.min(1, spec * 0.65 + guillocheRidge * 0.42);
        const cr = (r1 + (r2 - r1) * t) * vignette + (guillocheRidge - 0.5) * 28 + iridShift;
        const cg = (g1 + (g2 - g1) * t) * vignette + (guillocheRidge - 0.5) * 20;
        const cb = (b1 + (b2 - b1) * t) * vignette + (guillocheRidge - 0.5) * 19 + iridShift * 0.6;

        const idx = (y * width + x) * 4;
        data[idx] = Math.max(8, Math.min(255, cr));
        data[idx + 1] = Math.max(8, Math.min(255, cg));
        data[idx + 2] = Math.max(8, Math.min(255, cb));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return true;
  }

  if (mat === 'celestialAventurine') {
    const img = ctx.createImageData(width, height);
    const data = img.data;
    const invScale = 466 / minDim;
    const [r1, g1, b1] = baseRgb;
    const [r2, g2, b2] = secRgb;

    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const nebula = fbm(x * invScale * 0.015, y * invScale * 0.015, 3);
        const vignette = 1 - Math.min(1, dist / maxR) * 0.34;

        const aurora = Math.sin(nebula * 7.2 + Math.cos(angle - lightRad)) * 12 * iridIntensity;
        let cr = (r1 + (r2 - r1) * nebula) * vignette + aurora * 0.45;
        let cg = (g1 + (g2 - g1) * nebula) * vignette + aurora * 0.3;
        let cb = (b1 + (b2 - b1) * nebula) * vignette + aurora * 0.9;

        const sparkleSeed = hash2d(x, y);
        if (sparkleSeed > 0.992) {
          const intensity = (sparkleSeed - 0.992) / 0.008;
          const isRoseSparkle = hash2d(x + 19, y + 7) > 0.42;
          cr += intensity * (isRoseSparkle ? 238 : 215);
          cg += intensity * (isRoseSparkle ? 178 : 228);
          cb += intensity * (isRoseSparkle ? 198 : 255);
        }

        const idx = (y * width + x) * 4;
        data[idx] = Math.max(8, Math.min(255, cr));
        data[idx + 1] = Math.max(8, Math.min(255, cg));
        data[idx + 2] = Math.max(8, Math.min(255, cb));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return true;
  }

  if (mat === 'silkBlushEnamel') {
    const img = ctx.createImageData(width, height);
    const data = img.data;
    const [r1, g1, b1] = baseRgb;
    const [r2, g2, b2] = secRgb;

    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        const silkCone =
          Math.pow(Math.max(0, Math.cos(angle - lightRad)), 2) * 0.68;
        const petalWave = Math.sin(angle * 12) * 0.045;
        const enamelIrid =
          Math.sin(dist / halfDim * 6.5 + angle * 2) * 9 * iridIntensity;
        const vignette = 1 - Math.min(1, dist / maxR) * 0.24;

        const t = Math.max(0, Math.min(1, silkCone + petalWave));
        const idx = (y * width + x) * 4;
        data[idx] = Math.max(
          8,
          Math.min(255, (r1 + (r2 - r1) * t) * vignette + enamelIrid)
        );
        data[idx + 1] = Math.max(
          8,
          Math.min(255, (g1 + (g2 - g1) * t) * vignette + enamelIrid * 0.65)
        );
        data[idx + 2] = Math.max(
          8,
          Math.min(255, (b1 + (b2 - b1) * t) * vignette + enamelIrid * 0.85)
        );
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return true;
  }

  return false;
}

/**
 * Draws a high-resolution multi-facet brilliant-cut diamond with spectral optical dispersion fire
 * and 18K rose gold milgrain claw setting.
 */
export function drawBrilliantDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  prongColor = '#f4af9d',
  fireSeed = 0
): void {
  ctx.save();
  ctx.translate(x, y);

  // Outer bezel setting rim + rose gold shadow halo
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(42, 20, 24, 0.55)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.1, 0, Math.PI * 2);
  ctx.fillStyle = prongColor;
  ctx.fill();

  // Diamond pavilion base gradient
  const baseGrad = ctx.createRadialGradient(
    -radius * 0.25,
    -radius * 0.25,
    0.5,
    0,
    0,
    radius
  );
  baseGrad.addColorStop(0, '#ffffff');
  baseGrad.addColorStop(0.52, '#e2e8f0');
  baseGrad.addColorStop(0.84, '#94a3b8');
  baseGrad.addColorStop(1, '#334155');

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // 8-star brilliant crown facets with spectral dispersion fire
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + fireSeed * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius * 0.96, Math.sin(a) * radius * 0.96);
    ctx.lineTo(
      Math.cos(a + 0.34) * radius * 0.56,
      Math.sin(a + 0.34) * radius * 0.56
    );
    ctx.closePath();
    if (i % 3 === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    } else if (i % 3 === 1) {
      ctx.fillStyle = 'rgba(186, 230, 253, 0.52)'; // icy cyan fire
    } else {
      ctx.fillStyle = 'rgba(251, 207, 232, 0.45)'; // soft rose diamond fire
    }
    ctx.fill();
  }

  // Crisp octagonal table top flash
  ctx.beginPath();
  ctx.arc(-radius * 0.17, -radius * 0.17, radius * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 4 micro milgrain gold prongs at 45° diagonals
  const prongR = radius * 0.95;
  const prongSize = Math.max(0.9, radius * 0.17);
  ctx.fillStyle = '#fff1f2';
  for (let p = 0; p < 4; p++) {
    const pa = (p * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(Math.cos(pa) * prongR, Math.sin(pa) * prongR, prongSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

export function traceRoundedRectSubpath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  counterClockwise = false
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!counterClockwise) {
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
  } else {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x, y, x, y + rad, rad);
    ctx.lineTo(x, y + h - rad);
    ctx.arcTo(x, y + h, x + rad, y + h, rad);
    ctx.lineTo(x + w - rad, y + h);
    ctx.arcTo(x + w, y + h, x + w, y + h - rad, rad);
    ctx.lineTo(x + w, y + rad);
    ctx.arcTo(x + w, y, x + w - rad, y, rad);
    ctx.lineTo(x + rad, y);
  }
}

export interface PerimeterSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Samples evenly spaced points clockwise starting from top-center (12 o'clock)
 * along an inset rounded-rectangle perimeter.
 */
export function sampleRoundedRectPerimeter(
  width: number,
  height: number,
  cornerRadius: number,
  inset: number,
  count: number,
  phaseOffset = 0
): PerimeterSample[] {
  const x = inset;
  const y = inset;
  const w = Math.max(8, width - inset * 2);
  const h = Math.max(8, height - inset * 2);
  const r = Math.max(2, Math.min(cornerRadius - inset, w / 2, h / 2));

  const topHalf = Math.max(0, w / 2 - r);
  const rightSeg = Math.max(0, h - 2 * r);
  const bottomSeg = Math.max(0, w - 2 * r);
  const leftSeg = Math.max(0, h - 2 * r);
  const arcLen = (Math.PI / 2) * r;

  const segments = [
    { len: topHalf, kind: 'line' as const, x0: x + w / 2, y0: y, x1: x + w - r, y1: y, nx: 0, ny: -1 },
    { len: arcLen, kind: 'arc' as const, cx: x + w - r, cy: y + r, a0: -Math.PI / 2, a1: 0 },
    { len: rightSeg, kind: 'line' as const, x0: x + w, y0: y + r, x1: x + w, y1: y + h - r, nx: 1, ny: 0 },
    { len: arcLen, kind: 'arc' as const, cx: x + w - r, cy: y + h - r, a0: 0, a1: Math.PI / 2 },
    { len: bottomSeg, kind: 'line' as const, x0: x + w - r, y0: y + h, x1: x + r, y1: y + h, nx: 0, ny: 1 },
    { len: arcLen, kind: 'arc' as const, cx: x + r, cy: y + h - r, a0: Math.PI / 2, a1: Math.PI },
    { len: leftSeg, kind: 'line' as const, x0: x, y0: y + h - r, x1: x, y1: y + r, nx: -1, ny: 0 },
    { len: arcLen, kind: 'arc' as const, cx: x + r, cy: y + r, a0: Math.PI, a1: Math.PI * 1.5 },
    { len: topHalf, kind: 'line' as const, x0: x, y0: y, x1: x + w / 2, y1: y, nx: 0, ny: -1 },
  ];

  // Fix final segment x0 to x + r -> x + w / 2
  segments[8] = { len: topHalf, kind: 'line' as const, x0: x + r, y0: y, x1: x + w / 2, y1: y, nx: 0, ny: -1 };

  const totalLen = segments.reduce((acc, s) => acc + s.len, 0);
  const out: PerimeterSample[] = [];

  for (let i = 0; i < count; i++) {
    let target = (((i + phaseOffset) / count) * totalLen) % totalLen;
    if (target < 0) target += totalLen;

    let acc = 0;
    for (const seg of segments) {
      if (target <= acc + seg.len || seg === segments[segments.length - 1]) {
        const t = seg.len > 1e-6 ? Math.max(0, Math.min(1, (target - acc) / seg.len)) : 0;
        if (seg.kind === 'line') {
          out.push({
            x: seg.x0 + (seg.x1 - seg.x0) * t,
            y: seg.y0 + (seg.y1 - seg.y0) * t,
            nx: seg.nx,
            ny: seg.ny,
          });
        } else {
          const a = seg.a0 + (seg.a1 - seg.a0) * t;
          out.push({
            x: seg.cx + Math.cos(a) * r,
            y: seg.cy + Math.sin(a) * r,
            nx: Math.cos(a),
            ny: Math.sin(a),
          });
        }
        break;
      }
      acc += seg.len;
    }
  }

  return out;
}

/**
 * Renders 18K Rose Gold Diamond Pavé, Double-Row Micro-Pavé, or 72-Flute Rose Gold bezels
 * for both Round and Full-HD Squircle/Square smartwatches.
 */
export function renderLuxuryBezelTexture(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig
): boolean {
  const { width, height, shape, cornerRadius } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const outerR = minDim / 2;
  const style = config.bezel.style;

  if (
    style !== 'diamondPave' &&
    style !== 'doubleRowDiamondPave' &&
    style !== 'flutedRoseGold'
  ) {
    return false;
  }

  if (shape !== 'round') {
    const bezelThick = minDim * (style === 'doubleRowDiamondPave' ? 0.088 : 0.072);
    const outerGrad = ctx.createLinearGradient(0, 0, width, height);
    outerGrad.addColorStop(0, '#c88b7d');
    outerGrad.addColorStop(0.25, '#864e52');
    outerGrad.addColorStop(0.5, '#f2b7a6');
    outerGrad.addColorStop(0.8, '#66383c');
    outerGrad.addColorStop(1, '#3b1e23');

    ctx.beginPath();
    traceRoundedRectSubpath(ctx, 0, 0, width, height, cornerRadius, false);
    traceRoundedRectSubpath(
      ctx,
      bezelThick,
      bezelThick,
      width - bezelThick * 2,
      height - bezelThick * 2,
      Math.max(12, cornerRadius - bezelThick),
      true
    );
    ctx.fillStyle = outerGrad;
    ctx.fill('evenodd');

    // Inner & outer 18K rose gold milgrain borders
    roundedRectPath(
      ctx,
      bezelThick,
      bezelThick,
      width - bezelThick * 2,
      height - bezelThick * 2,
      Math.max(12, cornerRadius - bezelThick)
    );
    ctx.strokeStyle = config.bezel.accentColor;
    ctx.lineWidth = Math.max(1.8, minDim * 0.0042);
    ctx.stroke();

    roundedRectPath(
      ctx,
      bezelThick * 0.1,
      bezelThick * 0.1,
      width - bezelThick * 0.2,
      height - bezelThick * 0.2,
      Math.max(12, cornerRadius - bezelThick * 0.1)
    );
    ctx.strokeStyle = 'rgba(255, 241, 242, 0.42)';
    ctx.lineWidth = Math.max(1.1, minDim * 0.0022);
    ctx.stroke();

    if (style === 'doubleRowDiamondPave') {
      const gemR = Math.max(2.2, bezelThick * 0.19);
      const outerGems = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        bezelThick * 0.31,
        64,
        0
      );
      outerGems.forEach((pt, idx) => {
        drawBrilliantDiamond(ctx, pt.x, pt.y, gemR, config.bezel.accentColor, idx);
      });

      const innerGems = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        bezelThick * 0.7,
        52,
        0.5
      );
      innerGems.forEach((pt, idx) => {
        drawBrilliantDiamond(
          ctx,
          pt.x,
          pt.y,
          gemR * 0.9,
          config.bezel.accentColor,
          idx + 17
        );
      });
    } else if (style === 'diamondPave') {
      const gemR = Math.max(2.8, bezelThick * 0.31);
      const gems = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        bezelThick * 0.5,
        52,
        0
      );
      gems.forEach((pt, idx) => {
        drawBrilliantDiamond(ctx, pt.x, pt.y, gemR, config.bezel.accentColor, idx);
      });
    } else {
      // Fluted 18K Rose Gold Squircle Frame
      const fluteSamples = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        bezelThick * 0.5,
        88,
        0
      );
      for (let i = 0; i < fluteSamples.length; i++) {
        const pt = fluteSamples[i];
        ctx.beginPath();
        ctx.moveTo(pt.x - pt.nx * bezelThick * 0.44, pt.y - pt.ny * bezelThick * 0.44);
        ctx.lineTo(pt.x + pt.nx * bezelThick * 0.44, pt.y + pt.ny * bezelThick * 0.44);
        ctx.strokeStyle =
          i % 3 === 0
            ? 'rgba(255, 241, 242, 0.72)'
            : i % 3 === 1
            ? config.bezel.accentColor
            : config.bezel.primaryColor;
        ctx.lineWidth = Math.max(2.2, minDim * 0.008);
        ctx.stroke();
      }
    }

    // 12 Diamond Solitaire Hour Indices gracefully aligned inside the squircle dial
    const dialRx = width * 0.37;
    const dialRy = height * 0.385;
    const solitaireBaseR = Math.max(3.0, minDim * 0.0115);
    for (let h = 0; h < 12; h++) {
      const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      // Superellipse projection (p=2.8) matches Apple/Squircle inner contour harmoniously
      const denom = Math.pow(
        Math.pow(Math.abs(cosA), 2.8) + Math.pow(Math.abs(sinA), 2.8),
        1 / 2.8
      );
      const mx = cx + (cosA / denom) * dialRx;
      const my = cy + (sinA / denom) * dialRy;
      drawBrilliantDiamond(
        ctx,
        mx,
        my,
        h % 3 === 0 ? solitaireBaseR * 1.25 : solitaireBaseR * 0.92,
        config.bezel.accentColor,
        h * 5
      );
    }

    return true;
  }

  const ringThick = outerR * (style === 'doubleRowDiamondPave' ? 0.145 : 0.125);

  if (style === 'diamondPave' || style === 'doubleRowDiamondPave') {
    // Brushed/Polished 18K Rose Gold setting channel
    const channelGrad = ctx.createRadialGradient(
      cx,
      cy,
      outerR - ringThick,
      cx,
      cy,
      outerR
    );
    channelGrad.addColorStop(0, config.bezel.primaryColor);
    channelGrad.addColorStop(0.2, '#b97b70');
    channelGrad.addColorStop(0.55, '#d99a8a');
    channelGrad.addColorStop(0.84, '#7d4648');
    channelGrad.addColorStop(1, '#3b1e23');

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, outerR - ringThick, 0, Math.PI * 2, true);
    ctx.fillStyle = channelGrad;
    ctx.fill();

    // Inner & outer 18K rose gold milgrain borders
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - ringThick, 0, Math.PI * 2);
    ctx.strokeStyle = config.bezel.accentColor;
    ctx.lineWidth = Math.max(1.8, minDim * 0.0042);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - ringThick * 0.08, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 241, 242, 0.45)';
    ctx.lineWidth = Math.max(1.1, minDim * 0.0022);
    ctx.stroke();

    if (style === 'doubleRowDiamondPave') {
      // Double staggered micro-pavé diamond halo (Outer 56 + Inner 44 = 100 gemstones)
      const outerGems = 56;
      const outerOrbitR = outerR - ringThick * 0.3;
      const gemR = Math.max(2.4, ringThick * 0.21);

      for (let i = 0; i < outerGems; i++) {
        const angle = (i / outerGems) * Math.PI * 2 - Math.PI / 2;
        drawBrilliantDiamond(
          ctx,
          cx + Math.cos(angle) * outerOrbitR,
          cy + Math.sin(angle) * outerOrbitR,
          gemR,
          config.bezel.accentColor,
          i
        );
      }

      const innerGems = 44;
      const innerOrbitR = outerR - ringThick * 0.7;
      for (let i = 0; i < innerGems; i++) {
        const angle = ((i + 0.5) / innerGems) * Math.PI * 2 - Math.PI / 2;
        drawBrilliantDiamond(
          ctx,
          cx + Math.cos(angle) * innerOrbitR,
          cy + Math.sin(angle) * innerOrbitR,
          gemR * 0.92,
          config.bezel.accentColor,
          i + 11
        );
      }

      // 12 larger solitaire diamond hour markers
      for (let h = 0; h < 12; h++) {
        const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
        const markerR = outerR - ringThick * 1.42;
        drawBrilliantDiamond(
          ctx,
          cx + Math.cos(angle) * markerR,
          cy + Math.sin(angle) * markerR,
          h % 3 === 0 ? gemR * 1.45 : gemR * 1.15,
          config.bezel.accentColor,
          h * 3
        );
      }
    } else {
      // Single-row 48-stone brilliant-cut diamond pavé
      const gemCount = 48;
      const gemOrbitR = outerR - ringThick * 0.5;
      const gemRadius = Math.max(3.2, ringThick * 0.34);
      for (let i = 0; i < gemCount; i++) {
        const angle = (i / gemCount) * Math.PI * 2 - Math.PI / 2;
        drawBrilliantDiamond(
          ctx,
          cx + Math.cos(angle) * gemOrbitR,
          cy + Math.sin(angle) * gemOrbitR,
          gemRadius,
          config.bezel.accentColor,
          i
        );
      }

      for (let h = 0; h < 12; h++) {
        const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
        const markerR = outerR - ringThick * 1.48;
        drawBrilliantDiamond(
          ctx,
          cx + Math.cos(angle) * markerR,
          cy + Math.sin(angle) * markerR,
          h % 3 === 0 ? gemRadius * 1.05 : gemRadius * 0.82,
          config.bezel.accentColor,
          h * 5
        );
      }
    }

    return true;
  }

  // 72-Flute 18K Rose Gold Bezel
  const fluteCount = 72;
  for (let i = 0; i < fluteCount; i++) {
    const a0 = (i / fluteCount) * Math.PI * 2;
    const a1 = ((i + 1) / fluteCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a1);
    ctx.arc(cx, cy, outerR - ringThick, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle =
      i % 3 === 0
        ? '#fff1f2'
        : i % 3 === 1
        ? config.bezel.accentColor
        : config.bezel.primaryColor;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, outerR - ringThick, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff1f2';
  ctx.lineWidth = Math.max(1.5, minDim * 0.0035);
  ctx.stroke();

  for (let h = 0; h < 12; h++) {
    const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
    const markerR = outerR - ringThick * 1.45;
    drawBrilliantDiamond(
      ctx,
      cx + Math.cos(angle) * markerR,
      cy + Math.sin(angle) * markerR,
      h % 3 === 0 ? ringThick * 0.34 : ringThick * 0.25,
      config.bezel.accentColor,
      h * 7
    );
  }

  return true;
}
