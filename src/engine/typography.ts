import { WatchFaceConfig } from '../types/watchface';
import { resolveGlyphFontFamily } from '../utils/customFontManager';

export const GLYPH_CHARSET = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  ':',
  '%',
  '-',
  '/',
  '°',
  'C',
  'A',
  'P',
  'M',
  'S',
  'U',
  'N',
  'O',
  'T',
  'E',
  'W',
  'D',
  'H',
  'F',
  'R',
  'I',
];

export type GlyphRole =
  | 'default'
  | 'hours'
  | 'minutes'
  | 'seconds'
  | 'ampm'
  | 'date'
  | 'metrics';

export interface GlyphRenderOptions {
  role?: GlyphRole;
}

export function getFontDimensions(
  fontSet: 'time' | 'metrics' | 'small',
  minWatchDim: number
): { width: number; height: number; fontSize: number } {
  const scale = minWatchDim / 466;
  if (fontSet === 'time') {
    const h = Math.max(36, Math.round(74 * scale));
    const w = Math.max(24, Math.round(48 * scale));
    return { width: w, height: h, fontSize: Math.round(h * 0.84) };
  }
  if (fontSet === 'metrics') {
    const h = Math.max(20, Math.round(36 * scale));
    const w = Math.max(14, Math.round(24 * scale));
    return { width: w, height: h, fontSize: Math.round(h * 0.82) };
  }
  const h = Math.max(14, Math.round(22 * scale));
  const w = Math.max(10, Math.round(15 * scale));
  return { width: w, height: h, fontSize: Math.round(h * 0.8) };
}

export function resolveGlyphColors(
  config: WatchFaceConfig,
  role: GlyphRole = 'default'
): {
  mode: 'solid' | 'gradient';
  topColor: string;
  bottomColor: string;
  glowColor: string;
} {
  const d = config.digital;
  const fallbackPrimary = d.primaryColor;
  const fallbackGlow = d.glowColor;

  if (role === 'hours') {
    if (d.hoursColorMode === 'gradient') {
      return {
        mode: 'gradient',
        topColor: d.hoursGradientTop ?? '#ffffff',
        bottomColor: d.hoursGradientBottom ?? d.hoursColor ?? fallbackPrimary,
        glowColor: fallbackGlow,
      };
    }
    const solidHour = d.hoursColor ?? fallbackPrimary;
    return {
      mode: 'solid',
      topColor: solidHour,
      bottomColor: solidHour,
      glowColor: fallbackGlow,
    };
  }
  if (role === 'minutes') {
    const minCol = d.minutesColor ?? fallbackPrimary;
    return {
      mode: 'solid',
      topColor: minCol,
      bottomColor: minCol,
      glowColor: fallbackGlow,
    };
  }
  if (role === 'seconds') {
    const secCol = d.secondsColor ?? config.hands.secondHandColor ?? fallbackGlow;
    return {
      mode: 'solid',
      topColor: secCol,
      bottomColor: secCol,
      glowColor: secCol,
    };
  }
  if (role === 'ampm') {
    const ampmCol = d.ampmColor ?? d.secondsColor ?? fallbackGlow;
    return {
      mode: 'solid',
      topColor: ampmCol,
      bottomColor: ampmCol,
      glowColor: ampmCol,
    };
  }
  if (role === 'date') {
    const dateCol = d.dateColor ?? fallbackPrimary;
    return {
      mode: 'solid',
      topColor: dateCol,
      bottomColor: dateCol,
      glowColor: fallbackGlow,
    };
  }
  if (role === 'metrics') {
    const metCol = d.metricsValueColor ?? fallbackPrimary;
    return {
      mode: 'solid',
      topColor: metCol,
      bottomColor: metCol,
      glowColor: fallbackGlow,
    };
  }

  return {
    mode: d.fontStyle === 'tacticalStencil' ? 'solid' : 'gradient',
    topColor: fallbackPrimary,
    bottomColor: fallbackGlow,
    glowColor: fallbackGlow,
  };
}

export function renderGlyphCanvas(
  char: string,
  fontSet: 'time' | 'metrics' | 'small',
  config: WatchFaceConfig,
  options?: GlyphRenderOptions
): HTMLCanvasElement {
  const minDim = Math.min(config.resolution.width, config.resolution.height);
  const { width, height, fontSize } = getFontDimensions(fontSet, minDim);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const role = options?.role ?? 'default';
  const resolved = resolveGlyphColors(config, role);

  ctx.save();
  const family = resolveGlyphFontFamily(config);
  ctx.font = `700 ${fontSize}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = width / 2;
  const cy = height / 2 + 1;

  // Drop shadow for crisp contrast against textured or photo dials
  ctx.fillStyle = 'rgba(8, 8, 8, 0.78)';
  ctx.fillText(char, cx + 1, cy + 1.5);

  if (resolved.mode === 'gradient' && role === 'hours') {
    ctx.shadowColor = resolved.glowColor;
    ctx.shadowBlur = fontSet === 'time' ? 7 : 3;
    const grad = ctx.createLinearGradient(0, 2, 0, height - 2);
    grad.addColorStop(0, resolved.topColor);
    grad.addColorStop(1, resolved.bottomColor);
    ctx.fillStyle = grad;
    ctx.fillText(char, cx, cy);
  } else if (config.digital.fontStyle === 'oledGlow') {
    ctx.shadowColor = resolved.glowColor;
    ctx.shadowBlur = fontSet === 'time' ? 6 : 3;
    if (role !== 'default') {
      ctx.fillStyle = resolved.topColor;
    } else {
      const grad = ctx.createLinearGradient(0, 2, 0, height - 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.55, resolved.topColor);
      grad.addColorStop(1, resolved.glowColor);
      ctx.fillStyle = grad;
    }
    ctx.fillText(char, cx, cy);
  } else if (config.digital.fontStyle === 'metallic') {
    const grad = ctx.createLinearGradient(0, 2, 0, height - 2);
    if (role !== 'default') {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, resolved.topColor);
      grad.addColorStop(1, resolved.bottomColor);
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.46, resolved.topColor);
      grad.addColorStop(0.54, '#94a3b8');
      grad.addColorStop(1, '#cbd5e1');
    }
    ctx.fillStyle = grad;
    ctx.fillText(char, cx, cy);
  } else {
    ctx.fillStyle = resolved.topColor;
    ctx.fillText(char, cx, cy);
  }

  ctx.restore();
  return canvas;
}
