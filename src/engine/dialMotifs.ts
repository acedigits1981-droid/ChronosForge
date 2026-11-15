import { SimulationState, WatchFaceConfig } from '../types/watchface';
import { getSystemClockState } from '../utils/systemClock';
import {
  drawBrilliantDiamond,
  hash2d,
  roundedRectPath,
  sampleRoundedRectPerimeter,
} from './textureEngine';

function projectDialMarkerPoint(
  angleRad: number,
  config: WatchFaceConfig,
  roundRadiusRatio: number,
  squircleRxRatio: number,
  squircleRyRatio: number
): { x: number; y: number } {
  const { width, height, shape } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  if (shape === 'round') {
    const r = minDim * roundRadiusRatio;
    return { x: cx + cosA * r, y: cy + sinA * r };
  }

  const denom = Math.pow(
    Math.pow(Math.abs(cosA), 2.8) + Math.pow(Math.abs(sinA), 2.8),
    1 / 2.8
  );
  return {
    x: cx + (cosA / denom) * (width * squircleRxRatio),
    y: cy + (sinA / denom) * (height * squircleRyRatio),
  };
}

function drawLotusFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rotationRad: number,
  strokeStyle: string | CanvasGradient
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotationRad);
  ctx.strokeStyle = strokeStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outer 7 petals
  const petalAngles = [-1.15, -0.75, -0.38, 0, 0.38, 0.75, 1.15];
  for (let i = 0; i < petalAngles.length; i++) {
    const pa = petalAngles[i];
    const len = scale * (1 - Math.abs(pa) * 0.24);
    const pw = scale * 0.26;
    ctx.save();
    ctx.rotate(pa);
    ctx.lineWidth = Math.max(1.1, scale * 0.017);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-pw, -len * 0.38, -pw * 0.85, -len * 0.82, 0, -len);
    ctx.bezierCurveTo(pw * 0.85, -len * 0.82, pw, -len * 0.38, 0, 0);
    ctx.stroke();

    // Delicate inner vein
    ctx.lineWidth = Math.max(0.7, scale * 0.009);
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.12);
    ctx.quadraticCurveTo(pw * 0.1, -len * 0.55, 0, -len * 0.86);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Center stamen filaments
  ctx.lineWidth = Math.max(0.8, scale * 0.012);
  for (let s = -2; s <= 2; s++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * scale * 0.06, -scale * 0.32);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * scale * 0.06, -scale * 0.34, Math.max(1.2, scale * 0.02), 0, Math.PI * 2);
    ctx.fillStyle = strokeStyle;
    ctx.fill();
  }

  ctx.restore();
}

function draw3DPyramidStud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  lightColor: string,
  midColor: string,
  darkColor: string
): void {
  ctx.save();
  ctx.translate(x, y);

  // Soft drop shadow
  ctx.beginPath();
  ctx.arc(size * 0.14, size * 0.18, size * 1.05, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.fill();

  const pts: Array<[number, number]> = [
    [0, -size],
    [size, 0],
    [0, size],
    [-size, 0],
  ];
  const shades = [lightColor, midColor, darkColor, midColor];
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fillStyle = shades[i];
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, size * 0.18), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}

function draw3DGoldenDie(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tiltRad: number,
  pips: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tiltRad);

  // Drop shadow on glossy floor
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  roundedRectPath(ctx, -size * 0.54, size * 0.42, size * 1.08, size * 0.36, size * 0.14);
  ctx.fill();

  // Side beveled 3D extrusion
  const sideGrad = ctx.createLinearGradient(-size * 0.6, -size * 0.6, size * 0.6, size * 0.6);
  sideGrad.addColorStop(0, '#785012');
  sideGrad.addColorStop(0.5, '#d4af37');
  sideGrad.addColorStop(1, '#3b2406');
  roundedRectPath(ctx, -size * 0.46, -size * 0.46, size * 1.02, size * 1.02, size * 0.18);
  ctx.fillStyle = sideGrad;
  ctx.fill();

  // Top brushed champagne gold face
  const faceGrad = ctx.createLinearGradient(-size * 0.5, -size * 0.5, size * 0.5, size * 0.5);
  faceGrad.addColorStop(0, '#fff7d6');
  faceGrad.addColorStop(0.32, '#f5d27a');
  faceGrad.addColorStop(0.75, '#b88628');
  faceGrad.addColorStop(1, '#61410b');
  roundedRectPath(ctx, -size * 0.5, -size * 0.5, size, size, size * 0.18);
  ctx.fillStyle = faceGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 248, 220, 0.65)';
  ctx.lineWidth = Math.max(1.1, size * 0.03);
  ctx.stroke();

  // Recessed dark bronze pips with specular rim
  const pipR = size * 0.085;
  const off = size * 0.24;
  const pipCoords: Array<[number, number]> =
    pips === 1
      ? [[0, 0]]
      : pips === 3
      ? [
          [-off, -off],
          [0, 0],
          [off, off],
        ]
      : pips === 5
      ? [
          [-off, -off],
          [off, -off],
          [0, 0],
          [-off, off],
          [off, off],
        ]
      : [
          [-off, -off],
          [off, -off],
          [-off, 0],
          [off, 0],
          [-off, off],
          [off, off],
        ];

  for (const [px, py] of pipCoords) {
    ctx.beginPath();
    ctx.arc(px, py, pipR, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1204';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - pipR * 0.2, py - pipR * 0.2, pipR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 236, 179, 0.55)';
    ctx.fill();
  }

  ctx.restore();
}

export function drawDialMotifLayer(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig
): void {
  const motif = config.dial.motif;
  const numeralStyle = config.bezel.numeralStyle ?? 'none';
  if ((!motif || motif === 'none') && numeralStyle === 'none') {
    return;
  }

  const { width, height, shape, cornerRadius } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);

  ctx.save();

  if (motif === 'floralRoseGold') {
    // Soft blush watercolor blooms behind botanical line-art
    const wash1 = ctx.createRadialGradient(
      cx - minDim * 0.2,
      cy + minDim * 0.15,
      minDim * 0.02,
      cx - minDim * 0.2,
      cy + minDim * 0.15,
      minDim * 0.34
    );
    wash1.addColorStop(0, 'rgba(244, 175, 157, 0.26)');
    wash1.addColorStop(1, 'rgba(244, 175, 157, 0)');
    ctx.fillStyle = wash1;
    ctx.fillRect(0, 0, width, height);

    const wash2 = ctx.createRadialGradient(
      cx + minDim * 0.22,
      cy - minDim * 0.12,
      minDim * 0.01,
      cx + minDim * 0.22,
      cy - minDim * 0.12,
      minDim * 0.28
    );
    wash2.addColorStop(0, 'rgba(226, 200, 224, 0.24)');
    wash2.addColorStop(1, 'rgba(226, 200, 224, 0)');
    ctx.fillStyle = wash2;
    ctx.fillRect(0, 0, width, height);

    const roseLineGrad = ctx.createLinearGradient(0, height * 0.2, width, height * 0.9);
    roseLineGrad.addColorStop(0, '#c67d6b');
    roseLineGrad.addColorStop(0.5, '#e8a895');
    roseLineGrad.addColorStop(1, '#9e594d');

    drawLotusFlower(ctx, cx - minDim * 0.16, cy + minDim * 0.21, minDim * 0.19, 0.36, roseLineGrad);
    drawLotusFlower(ctx, cx + minDim * 0.19, cy + minDim * 0.24, minDim * 0.145, -0.45, roseLineGrad);
    drawLotusFlower(ctx, cx - minDim * 0.26, cy + minDim * 0.03, minDim * 0.13, 0.85, roseLineGrad);

    // 12 sculpted 18K Rose Gold bracket clips with solitaire stones along the rim
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const pt = projectDialMarkerPoint(a, config, 0.435, 0.405, 0.42);
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(a + Math.PI / 2);
      const cw = Math.max(4, minDim * 0.022);
      const ch = Math.max(10, minDim * 0.065);
      const clipGrad = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
      clipGrad.addColorStop(0, '#9e594d');
      clipGrad.addColorStop(0.5, '#fff1f2');
      clipGrad.addColorStop(1, '#b56557');
      roundedRectPath(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.35);
      ctx.fillStyle = clipGrad;
      ctx.fill();
      ctx.restore();
      drawBrilliantDiamond(ctx, pt.x, pt.y, Math.max(2, minDim * 0.0085), '#f4af9d', h * 3);
    }
  } else if (motif === 'diamondStardust') {
    // Crimson ruby stardust crystal scatter (10-11 o'clock & 4-5 o'clock arcs)
    for (let i = 0; i < 48; i++) {
      const clusterA = i < 24 ? -Math.PI * 0.78 : Math.PI * 0.22;
      const spreadA = (hash2d(i * 13, 7) - 0.5) * 0.9;
      const rFactor = 0.24 + hash2d(i * 5, 19) * 0.15;
      const angle = clusterA + spreadA;
      const pt = projectDialMarkerPoint(angle, config, rFactor, rFactor * 0.9, rFactor * 0.95);
      const crystalR = Math.max(1.2, minDim * (0.0028 + hash2d(i, 31) * 0.0068));

      if (crystalR > minDim * 0.006) {
        drawBrilliantDiamond(ctx, pt.x, pt.y, crystalR, '#fff1f2', i * 2);
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, crystalR, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : 'rgba(255, 228, 230, 0.85)';
        ctx.fill();
      }
    }

    // Matching 12 diamond bezel markers + 12 o'clock 4-point star
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const pt = projectDialMarkerPoint(a, config, 0.435, 0.405, 0.42);
      drawBrilliantDiamond(ctx, pt.x, pt.y, Math.max(2.6, minDim * 0.015), '#f4af9d', h * 4);
    }

    // 4-point faceted star emblem at 12 o'clock
    const starPt = projectDialMarkerPoint(-Math.PI / 2, config, 0.31, 0, 0.32);
    const sr = minDim * 0.022;
    ctx.beginPath();
    ctx.moveTo(starPt.x, starPt.y - sr);
    ctx.lineTo(starPt.x + sr * 0.32, starPt.y - sr * 0.32);
    ctx.lineTo(starPt.x + sr, starPt.y);
    ctx.lineTo(starPt.x + sr * 0.32, starPt.y + sr * 0.32);
    ctx.lineTo(starPt.x, starPt.y + sr);
    ctx.lineTo(starPt.x - sr * 0.32, starPt.y + sr * 0.32);
    ctx.lineTo(starPt.x - sr, starPt.y);
    ctx.lineTo(starPt.x - sr * 0.32, starPt.y - sr * 0.32);
    ctx.closePath();
    ctx.fillStyle = '#fff1f2';
    ctx.fill();
  } else if (motif === 'innerDiamondRing') {
    // Polished steel outer collar + 44-stone inner crystal halo
    if (shape === 'round') {
      const innerR = minDim * 0.39;
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * Math.PI * 2 - Math.PI / 2;
        const sizeScale = Math.abs(Math.sin(a * 2)) * 0.25 + 0.85;
        drawBrilliantDiamond(
          ctx,
          cx + Math.cos(a) * innerR,
          cy + Math.sin(a) * innerR,
          Math.max(2, minDim * 0.011 * sizeScale),
          '#e2e8f0',
          i
        );
      }
    } else {
      const halo = sampleRoundedRectPerimeter(
        width,
        height,
        cornerRadius,
        minDim * 0.1,
        48,
        0
      );
      halo.forEach((pt, i) => {
        drawBrilliantDiamond(
          ctx,
          pt.x,
          pt.y,
          Math.max(2, minDim * 0.01),
          '#e2e8f0',
          i
        );
      });
    }
  } else if (motif === 'pyramidStuds') {
    // Alternating sculpted rose-gold pyramid studs & brilliant-cut diamond indices
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const pt = projectDialMarkerPoint(a, config, 0.385, 0.365, 0.385);
      if (h === 0) {
        ctx.fillStyle = '#f4af9d';
        ctx.font = `700 ${Math.max(16, Math.round(minDim * 0.075))}px "Cormorant Garamond", "Playfair Display", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('12', pt.x, pt.y + minDim * 0.01);
      } else if (h % 3 === 0) {
        drawBrilliantDiamond(ctx, pt.x, pt.y, Math.max(2.6, minDim * 0.016), '#f4af9d', h * 3);
      } else {
        draw3DPyramidStud(
          ctx,
          pt.x,
          pt.y,
          Math.max(3, minDim * 0.017),
          '#fff1f2',
          '#e39c88',
          '#783f42'
        );
      }
    }
  } else if (motif === 'goldenDice') {
    // Subtle golden spotlight reflection at lower dial
    const floorGrad = ctx.createRadialGradient(
      cx,
      cy + minDim * 0.28,
      minDim * 0.02,
      cx,
      cy + minDim * 0.28,
      minDim * 0.32
    );
    floorGrad.addColorStop(0, 'rgba(212, 175, 55, 0.24)');
    floorGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, width, height);

    draw3DGoldenDie(ctx, cx - minDim * 0.13, cy + minDim * 0.22, minDim * 0.14, -0.32, 3);
    draw3DGoldenDie(ctx, cx + minDim * 0.14, cy + minDim * 0.18, minDim * 0.155, 0.28, 5);
  } else if (motif === 'diamondHeartPulse') {
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const pt = projectDialMarkerPoint(a, config, 0.39, 0.37, 0.39);
      if (h === 0) {
        ctx.fillStyle = '#fef3c7';
        ctx.font = `700 ${Math.max(16, Math.round(minDim * 0.075))}px "Playfair Display", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('12', pt.x, pt.y);
      } else if (h === 3 || h === 9) {
        drawBrilliantDiamond(ctx, pt.x - minDim * 0.014, pt.y, Math.max(2, minDim * 0.011), '#fde68a', h);
        drawBrilliantDiamond(ctx, pt.x + minDim * 0.014, pt.y, Math.max(2, minDim * 0.011), '#fde68a', h + 3);
      } else {
        draw3DPyramidStud(
          ctx,
          pt.x,
          pt.y,
          Math.max(2.6, minDim * 0.014),
          '#fef3c7',
          '#d4af37',
          '#6e4e10'
        );
      }
    }
  }

  // Optional Cardinal / Roman / Arabic 1-12 Dial Numerals
  if (numeralStyle === 'roman') {
    const romans = [
      { h: 0, label: 'XII' },
      { h: 3, label: 'III' },
      { h: 6, label: 'VI' },
      { h: 9, label: 'IX' },
    ];
    ctx.font = `600 ${Math.max(14, Math.round(minDim * 0.062))}px "Cormorant Garamond", "Playfair Display", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of romans) {
      const a = (item.h / 12) * Math.PI * 2 - Math.PI / 2;
      const pt = projectDialMarkerPoint(a, config, 0.335, 0.325, 0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillText(item.label, pt.x + 1, pt.y + 1.5);
      ctx.fillStyle = config.bezel.tickColor;
      ctx.fillText(item.label, pt.x, pt.y);
    }
  } else if (numeralStyle === 'cardinal') {
    const cardinals = [
      { h: 0, label: '12' },
      { h: 3, label: '3' },
      { h: 6, label: '6' },
      { h: 9, label: '9' },
    ];
    ctx.font = `700 ${Math.max(15, Math.round(minDim * 0.068))}px "Outfit", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of cardinals) {
      const a = (item.h / 12) * Math.PI * 2 - Math.PI / 2;
      const pt = projectDialMarkerPoint(a, config, 0.345, 0.33, 0.355);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(item.label, pt.x + 1.2, pt.y + 1.8);
      ctx.fillStyle = config.bezel.tickColor;
      ctx.fillText(item.label, pt.x, pt.y);
    }
  } else if (numeralStyle === 'arabic12') {
    ctx.font = `600 ${Math.max(11, Math.round(minDim * 0.044))}px "Outfit", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let h = 1; h <= 12; h++) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const pt = projectDialMarkerPoint(a, config, 0.34, 0.33, 0.355);
      ctx.fillStyle = config.bezel.tickColor;
      ctx.fillText(String(h), pt.x, pt.y);
    }
  }

  ctx.restore();
}

/**
 * Draws dynamic date window apertures and diamond heart pulse motifs during live frame rendering.
 * When includeDynamicReadouts is false (static hardware background export), dynamic numbers/text are omitted.
 */
export function drawLiveDialAccents(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig,
  sim: SimulationState,
  includeDynamicReadouts = true
): void {
  if (config.displayMode === 'digital') {
    return;
  }

  const { width, height, shape } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const sysClock = getSystemClockState();

  if (config.dial.dateWindow?.enabled) {
    const pos = config.dial.dateWindow.position;
    const isCircle = config.dial.dateWindow.shape === 'circle';
    const dx = pos === '3oclock' ? cx + minDim * (shape === 'round' ? 0.21 : 0.2) : cx;
    const dy = pos === '6oclock' ? cy + minDim * (shape === 'round' ? 0.22 : 0.25) : cy;

    ctx.save();
    if (isCircle) {
      const r = Math.max(11, minDim * 0.056);
      const rim = ctx.createLinearGradient(dx - r, dy - r, dx + r, dy + r);
      rim.addColorStop(0, '#fff1f2');
      rim.addColorStop(0.5, config.bezel.accentColor);
      rim.addColorStop(1, '#4a201b');
      ctx.beginPath();
      ctx.arc(dx, dy, r + Math.max(2, minDim * 0.007), 0, Math.PI * 2);
      ctx.fillStyle = rim;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    } else {
      const rw = Math.max(26, minDim * 0.13);
      const rh = Math.max(18, minDim * 0.082);
      roundedRectPath(ctx, dx - rw / 2 - 2, dy - rh / 2 - 2, rw + 4, rh + 4, 4);
      ctx.fillStyle = config.bezel.accentColor;
      ctx.fill();
      roundedRectPath(ctx, dx - rw / 2, dy - rh / 2, rw, rh, 3);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    }

    if (includeDynamicReadouts) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 ${Math.max(11, Math.round(minDim * 0.048))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sysClock.dayOfMonthStr, dx, dy + 0.5);
    }
    ctx.restore();
  }

  if (config.dial.motif === 'diamondHeartPulse') {
    const hx = cx;
    const hy = cy + minDim * 0.22;
    const hs = minDim * 0.145;

    ctx.save();
    ctx.translate(hx, hy);

    // Subtle dark heart interior
    ctx.beginPath();
    ctx.moveTo(0, hs * 0.65);
    ctx.bezierCurveTo(-hs * 0.95, hs * 0.05, -hs * 0.95, -hs * 0.72, 0, -hs * 0.24);
    ctx.bezierCurveTo(hs * 0.95, -hs * 0.72, hs * 0.95, hs * 0.05, 0, hs * 0.65);
    ctx.closePath();
    ctx.fillStyle = 'rgba(42, 6, 12, 0.52)';
    ctx.fill();
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = Math.max(1.8, minDim * 0.0055);
    ctx.stroke();

    // Diamond studs along upper heart lobes
    const diamondOffsets: Array<[number, number]> = [
      [-hs * 0.42, -hs * 0.44],
      [-hs * 0.68, -hs * 0.24],
      [-hs * 0.62, hs * 0.04],
      [hs * 0.42, -hs * 0.44],
      [hs * 0.68, -hs * 0.24],
      [hs * 0.62, hs * 0.04],
    ];
    diamondOffsets.forEach(([ox, oy], idx) => {
      drawBrilliantDiamond(ctx, ox, oy, Math.max(1.6, minDim * 0.007), '#fde68a', idx);
    });

    // ECG pulse line
    ctx.beginPath();
    ctx.moveTo(-hs * 0.48, hs * 0.24);
    ctx.lineTo(-hs * 0.22, hs * 0.24);
    ctx.lineTo(-hs * 0.12, hs * 0.04);
    ctx.lineTo(0, hs * 0.38);
    ctx.lineTo(hs * 0.12, hs * 0.12);
    ctx.lineTo(hs * 0.22, hs * 0.24);
    ctx.lineTo(hs * 0.48, hs * 0.24);
    ctx.strokeStyle = 'rgba(255, 241, 242, 0.78)';
    ctx.lineWidth = Math.max(1.2, minDim * 0.003);
    ctx.stroke();

    if (includeDynamicReadouts) {
      ctx.fillStyle = '#fff1f2';
      ctx.font = `700 ${Math.max(10, Math.round(minDim * 0.04))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`♥ ${Math.round(sim.heartRate)}`, 0, -hs * 0.02);
    }
    ctx.restore();
  }

  if (config.dial.motif === 'brushedMinimal' && includeDynamicReadouts) {
    ctx.save();
    ctx.fillStyle = config.digital.dateColor ?? config.digital.glowColor;
    ctx.font = `italic 500 ${Math.max(13, Math.round(minDim * 0.052))}px "Playfair Display", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sysClock.weekdayLong, cx, cy - minDim * 0.2);
    ctx.restore();
  }
}
