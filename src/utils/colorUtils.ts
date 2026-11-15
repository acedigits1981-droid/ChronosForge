export interface HslColor {
  /** Hue in degrees [0, 360) */
  h: number;
  /** Saturation percentage [0, 100] */
  s: number;
  /** Lightness percentage [0, 100] */
  l: number;
}

export interface HorologySwatch {
  name: string;
  hex: string;
}

export const HOROLOGY_COLOR_SWATCHES: HorologySwatch[] = [
  { name: 'Titanium Silver', hex: '#cbd5e1' },
  { name: '18K Gold', hex: '#d4af37' },
  { name: 'Rose Gold', hex: '#f4af9d' },
  { name: 'Tactical Orange', hex: '#f97316' },
  { name: 'Super-LumiNova Green', hex: '#4ade80' },
  { name: 'Ice Blue', hex: '#7dd3fc' },
  { name: 'Neon Cyan', hex: '#22d3ee' },
  { name: 'Crimson Red', hex: '#e11d48' },
  { name: 'OLED White', hex: '#f8fafc' },
  { name: 'Stealth Black', hex: '#141824' },
];

export function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

/**
 * Normalizes a hex string (#rgb, rgb, #rrggbb, rrggbb) into lowercase #rrggbb.
 * Returns null when the input is not a valid hex color.
 */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const expanded = trimmed
      .split('')
      .map((ch) => ch + ch)
      .join('')
      .toLowerCase();
    return `#${expanded}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return null;
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const norm = normalizeHex(hex) ?? '#000000';
  const num = parseInt(norm.slice(1), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const rr = Math.round(clamp(r, 0, 255))
    .toString(16)
    .padStart(2, '0');
  const gg = Math.round(clamp(g, 0, 255))
    .toString(16)
    .padStart(2, '0');
  const bb = Math.round(clamp(b, 0, 255))
    .toString(16)
    .padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

export function hexToHsl(hex: string): HslColor {
  const [r8, g8, b8] = hexToRgbTuple(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta > 1e-6) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h) % 360,
    s: Math.round(clamp(s * 100, 0, 100)),
    l: Math.round(clamp(l * 100, 0, 100)),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return rgbToHex((rPrime + m) * 255, (gPrime + m) * 255, (bPrime + m) * 255);
}

export function formatHslSummary(hsl: HslColor): string {
  return `${Math.round(hsl.h)}° · ${Math.round(hsl.s)}% · ${Math.round(hsl.l)}%`;
}

export function getContrastTextColor(hex: string): '#0f172a' | '#f8fafc' {
  const [r, g, b] = hexToRgbTuple(hex);
  // Relative sRGB perceived luminance (ITU-R BT.709)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.56 ? '#0f172a' : '#f8fafc';
}
