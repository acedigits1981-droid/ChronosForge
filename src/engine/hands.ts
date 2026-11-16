import { WatchFaceConfig } from '../types/watchface';
import { hexToHsl, hslToHex, normalizeHex } from '../utils/colorUtils';
import { getMetallicStopColors } from './materials';

export type HandKind = 'hour' | 'minute' | 'second';

function resolveHandMetalColors(config: WatchFaceConfig) {
  const custom = config.hands.hourMinuteMetalColor
    ? normalizeHex(config.hands.hourMinuteMetalColor)
    : null;
  if (!custom) {
    return getMetallicStopColors(config.hands.finish);
  }
  const hsl = hexToHsl(custom);
  return {
    light: hslToHex(hsl.h, Math.max(10, hsl.s * 0.85), Math.min(96, hsl.l + 24)),
    mid: custom,
    dark: hslToHex(hsl.h, hsl.s, Math.max(8, hsl.l - 22)),
    edge: hslToHex(hsl.h, hsl.s, Math.max(6, hsl.l - 38)),
  };
}

export function getLightDirectionalShadowOffset(config: WatchFaceConfig): {
  offsetX: number;
  offsetY: number;
  blur: number;
} {
  const minDim = Math.min(config.resolution.width, config.resolution.height);
  const scale = minDim / 466;
  const lightRad = ((config.dial.lightAngleDeg ?? 315) * Math.PI) / 180;
  const baseMag = Math.hypot(
    config.hands.shadowOffsetX || 4,
    config.hands.shadowOffsetY || 6
  );
  return {
    offsetX: -Math.cos(lightRad) * baseMag * scale,
    offsetY: -Math.sin(lightRad) * baseMag * scale,
    blur: Math.max(1.5, (config.hands.shadowBlur || 7) * scale),
  };
}

/**
 * Draws a single 3D-shaded hand pointing straight UP (12 o'clock) on a canvas
 * of size (width x height) with pivot at (width/2, height/2).
 */
export function renderHandVertical(
  ctx: CanvasRenderingContext2D,
  kind: HandKind,
  config: WatchFaceConfig,
  includeBakedShadow = false
): void {
  const { width, height } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const metal = resolveHandMetalColors(config);
  const style = config.hands.style;
  const lightOffset = getLightDirectionalShadowOffset(config);

  ctx.save();
  ctx.translate(cx, cy);

  const drawGeometry = (isShadowPass: boolean) => {
    if (kind === 'second') {
      const tipLen = minDim * 0.41;
      const tailLen = minDim * 0.11;
      const tailW = Math.max(2, minDim * 0.0052);
      const rootW = Math.max(1.3, minDim * 0.003);
      const tipW = Math.max(0.7, minDim * 0.0014);

      if (isShadowPass) {
        ctx.fillStyle = 'rgba(8, 8, 8, 0.58)';
        ctx.strokeStyle = 'rgba(8, 8, 8, 0.58)';
      } else {
        ctx.fillStyle = config.hands.secondHandColor;
        ctx.strokeStyle = config.hands.secondHandColor;
      }

      // Counterweight tail
      ctx.beginPath();
      ctx.moveTo(-tailW, tailLen);
      ctx.lineTo(-rootW, 0);
      ctx.lineTo(rootW, 0);
      ctx.lineTo(tailW, tailLen);
      ctx.closePath();
      ctx.fill();

      // Split-plane second needle shaft with central ridge highlight
      if (isShadowPass) {
        ctx.beginPath();
        ctx.moveTo(-rootW, 0);
        ctx.lineTo(-tipW, -tipLen);
        ctx.lineTo(tipW, -tipLen);
        ctx.lineTo(rootW, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-rootW, 0);
        ctx.lineTo(-tipW, -tipLen);
        ctx.lineTo(0, -tipLen);
        ctx.closePath();
        ctx.fillStyle = config.hands.secondHandColor;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(rootW, 0);
        ctx.lineTo(tipW, -tipLen);
        ctx.lineTo(0, -tipLen);
        ctx.closePath();
        ctx.fillStyle = 'rgba(8, 12, 18, 0.25)';
        ctx.fill();
      }

      // Luminous diamond pip near tip
      const pipY = -tipLen * 0.72;
      const pipH = Math.max(4, minDim * 0.013);
      const pipW = Math.max(2.6, minDim * 0.0078);
      ctx.beginPath();
      ctx.moveTo(0, pipY - pipH);
      ctx.lineTo(pipW, pipY);
      ctx.lineTo(0, pipY + pipH);
      ctx.lineTo(-pipW, pipY);
      ctx.closePath();
      ctx.fillStyle = isShadowPass
        ? 'rgba(8, 8, 8, 0.58)'
        : config.hands.secondHandColor;
      ctx.fill();
      if (!isShadowPass) {
        ctx.fillStyle = config.hands.lumeColor;
        ctx.beginPath();
        ctx.arc(0, pipY, Math.max(1.5, minDim * 0.0038), 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const isHour = kind === 'hour';
    const length = isHour ? minDim * 0.265 : minDim * 0.375;
    const tail = isHour ? minDim * 0.055 : minDim * 0.068;

    if (style === 'feuilleLeaf') {
      // Haute Horlogerie Curved Leaf (Feuille) Hand with Sharp 3D Center Ridge
      const maxBellyW = isHour ? minDim * 0.028 : minDim * 0.022;

      // Left leaf facet (bright specular)
      ctx.beginPath();
      ctx.moveTo(0, tail);
      ctx.quadraticCurveTo(-maxBellyW * 0.45, tail * 0.3, -maxBellyW * 0.35, 0);
      ctx.bezierCurveTo(
        -maxBellyW * 1.15,
        -length * 0.32,
        -maxBellyW * 0.95,
        -length * 0.68,
        0,
        -length
      );
      ctx.closePath();
      ctx.fillStyle = isShadowPass ? 'rgba(8, 8, 8, 0.62)' : metal.light;
      ctx.fill();

      // Right leaf facet (warm shaded bevel)
      ctx.beginPath();
      ctx.moveTo(0, tail);
      ctx.quadraticCurveTo(maxBellyW * 0.45, tail * 0.3, maxBellyW * 0.35, 0);
      ctx.bezierCurveTo(
        maxBellyW * 1.15,
        -length * 0.32,
        maxBellyW * 0.95,
        -length * 0.68,
        0,
        -length
      );
      ctx.closePath();
      ctx.fillStyle = isShadowPass ? 'rgba(8, 8, 8, 0.62)' : metal.dark;
      ctx.fill();

      if (!isShadowPass) {
        ctx.beginPath();
        ctx.moveTo(0, tail * 0.7);
        ctx.lineTo(0, -length + minDim * 0.004);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
        ctx.lineWidth = Math.max(0.9, minDim * 0.0022);
        ctx.stroke();
      }
      return;
    }

    const halfW =
      style === 'dauphine'
        ? isHour
          ? minDim * 0.028
          : minDim * 0.022
        : style === 'skeleton'
        ? isHour
          ? minDim * 0.027
          : minDim * 0.021
        : isHour
        ? minDim * 0.024
        : minDim * 0.019;

    const tipY = -length;
    const shoulderY = -length * 0.83;

    // Left facet (bright specular)
    ctx.beginPath();
    ctx.moveTo(0, tail);
    ctx.lineTo(-halfW * 0.72, tail);
    ctx.lineTo(-halfW, 0);
    ctx.lineTo(style === 'dauphine' ? -halfW * 0.22 : -halfW * 0.78, shoulderY);
    ctx.lineTo(0, tipY);
    ctx.closePath();
    ctx.fillStyle = isShadowPass ? 'rgba(8, 8, 8, 0.65)' : metal.light;
    ctx.fill();

    // Right facet (shaded metallic bevel)
    ctx.beginPath();
    ctx.moveTo(0, tail);
    ctx.lineTo(halfW * 0.72, tail);
    ctx.lineTo(halfW, 0);
    ctx.lineTo(style === 'dauphine' ? halfW * 0.22 : halfW * 0.78, shoulderY);
    ctx.lineTo(0, tipY);
    ctx.closePath();
    ctx.fillStyle = isShadowPass ? 'rgba(8, 8, 8, 0.65)' : metal.dark;
    ctx.fill();

    if (!isShadowPass) {
      // Crisp central specular ridge separating left bright vs right dark planes
      ctx.beginPath();
      ctx.moveTo(0, tail * 0.8);
      ctx.lineTo(0, tipY + minDim * 0.004);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.74)';
      ctx.lineWidth = Math.max(0.9, minDim * 0.0022);
      ctx.stroke();

      const lumeStart = -length * 0.24;
      const lumeEnd = shoulderY * 0.95;
      const lumeW = Math.max(1.6, halfW * 0.44);

      if (style === 'skeleton') {
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(-lumeW * 0.85, -length * 0.34, lumeW * 1.7, length * 0.24);
      }

      ctx.beginPath();
      ctx.moveTo(-lumeW, lumeStart);
      ctx.lineTo(-lumeW * 0.75, lumeEnd);
      ctx.lineTo(0, tipY * 0.93);
      ctx.lineTo(lumeW * 0.75, lumeEnd);
      ctx.lineTo(lumeW, lumeStart);
      ctx.closePath();
      ctx.fillStyle = config.hands.lumeColor;
      ctx.fill();
    }
  };

  if (includeBakedShadow) {
    ctx.save();
    ctx.translate(lightOffset.offsetX, lightOffset.offsetY);
    ctx.filter = `blur(${Math.max(1, lightOffset.blur * 0.5)}px)`;
    drawGeometry(true);
    ctx.restore();
  }

  drawGeometry(false);
  ctx.restore();
}

export function drawCenterPinCap(
  ctx: CanvasRenderingContext2D,
  config: WatchFaceConfig
): void {
  const { width, height } = config.resolution;
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const capR = Math.max(6, minDim * config.glassCap.capRadiusRatio);
  const metal = getMetallicStopColors(config.glassCap.capFinish);
  const lightRad = ((config.dial.lightAngleDeg ?? 315) * Math.PI) / 180;
  const lx = Math.cos(lightRad);
  const ly = Math.sin(lightRad);

  ctx.save();

  ctx.beginPath();
  ctx.arc(
    cx - lx * capR * 0.16,
    cy - ly * capR * 0.16,
    capR * 1.12,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = 'rgba(8, 8, 8, 0.68)';
  ctx.fill();

  const flangeGrad = ctx.createLinearGradient(
    cx + lx * capR,
    cy + ly * capR,
    cx - lx * capR,
    cy - ly * capR
  );
  flangeGrad.addColorStop(0, metal.light);
  flangeGrad.addColorStop(0.5, metal.mid);
  flangeGrad.addColorStop(1, metal.edge);

  ctx.beginPath();
  ctx.arc(cx, cy, capR, 0, Math.PI * 2);
  ctx.fillStyle = flangeGrad;
  ctx.fill();

  const innerGrad = ctx.createRadialGradient(
    cx + lx * capR * 0.25,
    cy + ly * capR * 0.25,
    1,
    cx,
    cy,
    capR * 0.72
  );
  innerGrad.addColorStop(0, metal.light);
  innerGrad.addColorStop(0.7, metal.dark);
  innerGrad.addColorStop(1, metal.edge);

  ctx.beginPath();
  ctx.arc(cx, cy, capR * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.6, capR * 0.22), 0, Math.PI * 2);
  ctx.fillStyle = config.hands.secondHandColor;
  ctx.fill();

  ctx.restore();
}
