import { hexToHsl, hslToHex, rgbToHex } from './colorUtils';

interface ColorBucket {
  pixels: Array<[number, number, number]>;
}

export interface ExtractedWatchUiColors {
  /** Standout UI indicator / border / neon accent color extracted from the watch artwork */
  accentColor: string;
  /** Secondary highlight or luminous accent tone */
  secondaryColor: string;
  /** Metallic alloy tone suited for watch hands and bezel accents */
  metalToneColor: string;
  /** Dominant dial backdrop / plate tone */
  dialBaseColor: string;
  /** Up to 5 representative quantized colors */
  palette: string[];
}

/**
 * Pure median-cut + chroma-aware palette extractor that takes any RGBA buffer
 * and yields up to `targetCount` (default 5) dominant and accent hex colors.
 */
export function quantizePaletteFromRgba(
  rgba: Uint8ClampedArray,
  targetCount = 5
): string[] {
  const samples: Array<[number, number, number]> = [];
  const totalPixels = Math.floor(rgba.length / 4);
  const stride = Math.max(1, Math.floor(totalPixels / 2400));

  for (let i = 0; i < totalPixels; i += stride) {
    const idx = i * 4;
    const a = rgba[idx + 3];
    if (a < 96) continue;
    samples.push([rgba[idx], rgba[idx + 1], rgba[idx + 2]]);
  }

  if (samples.length === 0) {
    return ['#f4af9d', '#38bdf8', '#f8fafc', '#1e293b', '#f97316'].slice(
      0,
      targetCount
    );
  }

  let buckets: ColorBucket[] = [{ pixels: samples }];
  const desiredBuckets = Math.max(targetCount * 2, 10);

  while (buckets.length < desiredBuckets) {
    let bestIdx = -1;
    let bestRange = -1;
    let bestChannel: 0 | 1 | 2 = 0;

    for (let b = 0; b < buckets.length; b++) {
      const px = buckets[b].pixels;
      if (px.length < 4) continue;
      let minR = 255,
        maxR = 0,
        minG = 255,
        maxG = 0,
        minB = 255,
        maxB = 0;
      for (const [r, g, bCh] of px) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (g < minG) minG = g;
        if (g > maxG) maxG = g;
        if (bCh < minB) minB = bCh;
        if (bCh > maxB) maxB = bCh;
      }
      const rangeR = maxR - minR;
      const rangeG = maxG - minG;
      const rangeB = maxB - minB;
      const maxRange = Math.max(rangeR, rangeG, rangeB);
      if (maxRange > bestRange) {
        bestRange = maxRange;
        bestIdx = b;
        bestChannel =
          rangeR >= rangeG && rangeR >= rangeB
            ? 0
            : rangeG >= rangeB
            ? 1
            : 2;
      }
    }

    if (bestIdx === -1 || bestRange < 8) break;

    const chosen = buckets.splice(bestIdx, 1)[0];
    chosen.pixels.sort((p1, p2) => p1[bestChannel] - p2[bestChannel]);
    const mid = Math.floor(chosen.pixels.length / 2);
    buckets.push({ pixels: chosen.pixels.slice(0, mid) });
    buckets.push({ pixels: chosen.pixels.slice(mid) });
  }

  // Score buckets by population + chroma vibrancy so accents aren't drowned out by dark neutrals
  const candidates = buckets
    .map((bucket) => {
      const count = bucket.pixels.length;
      let sr = 0,
        sg = 0,
        sb = 0;
      for (const [r, g, b] of bucket.pixels) {
        sr += r;
        sg += g;
        sb += b;
      }
      const r = Math.round(sr / count);
      const g = Math.round(sg / count);
      const b = Math.round(sb / count);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const hex = rgbToHex(r, g, b);
      return {
        rgb: [r, g, b] as [number, number, number],
        hex,
        score: count * (1 + chroma / 140),
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ rgb: [number, number, number]; hex: string }> = [];
  for (const cand of candidates) {
    const tooClose = selected.some((s) => {
      const dr = s.rgb[0] - cand.rgb[0];
      const dg = s.rgb[1] - cand.rgb[1];
      const db = s.rgb[2] - cand.rgb[2];
      return Math.hypot(dr, dg, db) < 42;
    });
    if (!tooClose) {
      selected.push(cand);
      if (selected.length >= targetCount) break;
    }
  }

  for (const cand of candidates) {
    if (selected.length >= targetCount) break;
    if (!selected.some((s) => s.hex === cand.hex)) {
      selected.push(cand);
    }
  }

  return selected.slice(0, targetCount).map((s) => s.hex);
}

/**
 * Pure watch-UI accent color analyzer.
 * Even when 90%+ of a watch face is pitch-black/dark gunmetal, this isolates the bright
 * hour markers, rings, neon glow, or border colors (e.g., pink, red, cyan, gold, orange)
 * so hands and dial accents automatically match the artwork's true UI color.
 */
export function extractWatchUiAccentColorsFromRgba(
  rgba: Uint8ClampedArray
): ExtractedWatchUiColors {
  const totalPixels = Math.floor(rgba.length / 4);
  const stride = Math.max(1, Math.floor(totalPixels / 4800));

  // Histogram over quantized chromatic hue/sat/lum bins + neutral brightness bins
  interface BinAccum {
    count: number;
    sumR: number;
    sumG: number;
    sumB: number;
    avgChroma: number;
    avgLum: number;
  }

  const chromaBins = new Map<string, BinAccum>();
  const brightNeutralBins = new Map<string, BinAccum>();
  const darkBaseBins = new Map<string, BinAccum>();

  for (let i = 0; i < totalPixels; i += stride) {
    const idx = i * 4;
    const a = rgba[idx + 3];
    if (a < 110) continue;

    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b);

    // Track dial background base pixels (dominant matte region)
    if (lum < 78) {
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const prev = darkBaseBins.get(key) ?? {
        count: 0,
        sumR: 0,
        sumG: 0,
        sumB: 0,
        avgChroma: 0,
        avgLum: 0,
      };
      prev.count++;
      prev.sumR += r;
      prev.sumG += g;
      prev.sumB += b;
      chromaBins;
      darkBaseBins.set(key, prev);
    }

    // Track bright metallic / silver / white indicators (in case face is monochrome silver/white on black)
    if (lum >= 105 && chroma < 28) {
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const prev = brightNeutralBins.get(key) ?? {
        count: 0,
        sumR: 0,
        sumG: 0,
        sumB: 0,
        avgChroma: 0,
        avgLum: 0,
      };
      prev.count++;
      prev.sumR += r;
      prev.sumG += g;
      prev.sumB += b;
      brightNeutralBins.set(key, prev);
    }

    // Chromatic accent foreground indicators (hour markers, neon rings, colored borders)
    if (chroma >= 24 && lum >= 36) {
      const qr = r >> 4;
      const qg = g >> 4;
      const qb = b >> 4;
      const key = `${qr}-${qg}-${qb}`;
      const prev = chromaBins.get(key) ?? {
        count: 0,
        sumR: 0,
        sumG: 0,
        sumB: 0,
        avgChroma: 0,
        avgLum: 0,
      };
      prev.count++;
      prev.sumR += r;
      prev.sumG += g;
      prev.sumB += b;
      chromaBins.set(key, prev);
    }
  }

  const finalize = (bins: Map<string, BinAccum>) =>
    Array.from(bins.values()).map((b) => {
      const r = Math.round(b.sumR / b.count);
      const g = Math.round(b.sumG / b.count);
      const bb = Math.round(b.sumB / b.count);
      const max = Math.max(r, g, bb);
      const min = Math.min(r, g, bb);
      const chroma = max - min;
      const lum = 0.299 * r + 0.587 * g + 0.114 * bb;
      return {
        rgb: [r, g, bb] as [number, number, number],
        hex: rgbToHex(r, g, bb),
        count: b.count,
        chroma,
        lum,
        // Favor saturated, clear UI highlights without letting 1 stray hot pixel dominate
        accentScore:
          Math.pow(b.count, 0.72) *
          Math.pow(chroma / 255, 1.55) *
          (0.45 + lum / 255),
      };
    });

  const chromaRanked = finalize(chromaBins).sort(
    (a, b) => b.accentScore - a.accentScore
  );
  const brightRanked = finalize(brightNeutralBins).sort(
    (a, b) => b.count * (b.lum / 255) - a.count * (a.lum / 255)
  );
  const darkRanked = finalize(darkBaseBins).sort((a, b) => b.count - a.count);

  const palette = quantizePaletteFromRgba(rgba, 5);

  const topChroma = chromaRanked[0];
  const accentColor =
    topChroma && (topChroma.count >= 6 || topChroma.chroma >= 45)
      ? topChroma.hex
      : brightRanked[0]?.hex ?? palette[0] ?? '#e2e8f0';

  const secondDistinctChroma = chromaRanked.find((c) => {
    if (!topChroma) return false;
    const dist = Math.hypot(
      c.rgb[0] - topChroma.rgb[0],
      c.rgb[1] - topChroma.rgb[1],
      c.rgb[2] - topChroma.rgb[2]
    );
    return dist >= 48;
  });

  const accentHsl = hexToHsl(accentColor);
  const secondaryColor =
    secondDistinctChroma?.hex ??
    hslToHex(
      accentHsl.h,
      Math.min(100, Math.max(accentHsl.s, 45)),
      Math.min(86, accentHsl.l + 14)
    );

  // Metal tone for hour/minute hands: match vibrant accent if warm/pastel/metallic, else crisp lightened highlight
  const metalToneColor =
    topChroma && topChroma.chroma >= 28
      ? hslToHex(
          accentHsl.h,
          Math.min(88, Math.max(28, accentHsl.s)),
          Math.min(84, Math.max(54, accentHsl.l + 8))
        )
      : brightRanked[0]?.hex ?? '#e2e8f0';

  const dialBaseColor = darkRanked[0]?.hex ?? '#0f131b';

  // Put accentColor first inside palette so Match Photo swatches always feature it prominently
  const mergedPalette = [
    accentColor,
    ...palette.filter((p) => p.toLowerCase() !== accentColor.toLowerCase()),
  ].slice(0, 5);

  return {
    accentColor,
    secondaryColor,
    metalToneColor,
    dialBaseColor,
    palette: mergedPalette,
  };
}

// Runtime HTMLImageElement cache keyed by Data URL or Asset URL for synchronous Canvas rendering
const CUSTOM_IMAGE_CACHE = new Map<string, HTMLImageElement>();
const LOADING_IMAGE_PROMISES = new Map<string, Promise<HTMLImageElement>>();

export function getCachedCustomImageSync(dataUrl?: string): HTMLImageElement | null {
  if (!dataUrl) return null;
  const cached = CUSTOM_IMAGE_CACHE.get(dataUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  return null;
}

export function loadCustomImageAndPalette(
  dataUrl: string
): Promise<{ img: HTMLImageElement; palette: string[] }> {
  const existing = CUSTOM_IMAGE_CACHE.get(dataUrl);
  const loadPromise =
    existing && existing.complete && existing.naturalWidth > 0
      ? Promise.resolve(existing)
      : LOADING_IMAGE_PROMISES.get(dataUrl) ??
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            CUSTOM_IMAGE_CACHE.set(dataUrl, img);
            LOADING_IMAGE_PROMISES.delete(dataUrl);
            resolve(img);
          };
          img.onerror = (err) => {
            LOADING_IMAGE_PROMISES.delete(dataUrl);
            reject(err);
          };
          img.src = dataUrl;
        });

  if (!existing) {
    LOADING_IMAGE_PROMISES.set(dataUrl, loadPromise);
  }

  return loadPromise.then((img) => {
    const sampleSize = 64;
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { img, palette: ['#f4af9d', '#38bdf8', '#f8fafc', '#1e293b', '#f97316'] };
    }
    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
    const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const uiColors = extractWatchUiAccentColorsFromRgba(imgData.data);
    return { img, palette: uiColors.palette };
  });
}

/**
 * Loads any watch image (custom upload dataUrl or preset intactArtworkUrl)
 * and extracts its standout UI indicator / border accent colors for 1-click color matching.
 */
export async function autoPickWatchUiColorsFromImageUrl(
  imageUrl: string
): Promise<ExtractedWatchUiColors> {
  const { img } = await loadCustomImageAndPalette(imageUrl);
  const sampleSize = 96;
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      accentColor: '#f4af9d',
      secondaryColor: '#f97316',
      metalToneColor: '#e2e8f0',
      dialBaseColor: '#0f131b',
      palette: ['#f4af9d', '#38bdf8', '#f8fafc', '#1e293b', '#f97316'],
    };
  }
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize);
  return extractWatchUiAccentColorsFromRgba(imgData.data);
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to decode image file'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Image read error'));
    reader.readAsDataURL(file);
  });
}
