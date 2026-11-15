import { CroppedSprite } from '../types/watchface';

/**
 * Pure RGBA buffer helper for FitCloudPro Pure-Black (#000000) Transparency Guard:
 * On FitCloudPro (TBUI) firmware, RGB (0, 0, 0) in non-alpha layers is interpreted
 * by the watch GPU as 100% transparent.
 * Clamps all pixels with alpha > 16 and (R < 8 && G < 8 && B < 8) to rgb(8, 8, 8) (#080808).
 */
export function applyFitCloudBlackGuardBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number
): void {
  const total = width * height * 4;
  for (let i = 0; i < total; i += 4) {
    const a = data[i + 3];
    if (a > 16) {
      if (data[i] < 8 && data[i + 1] < 8 && data[i + 2] < 8) {
        data[i] = 8;
        data[i + 1] = 8;
        data[i + 2] = 8;
      }
    }
  }
}

export function applyFitCloudBlackGuard(imageData: ImageData): void {
  applyFitCloudBlackGuardBuffer(imageData.data, imageData.width, imageData.height);
}

/**
 * Pure RGBA buffer Floyd-Steinberg error-diffusion dithering into 16-bit RGB565 space.
 * Returns little-endian packed RGB565 bytes (width * height * 2) and mutates `data` in place
 * with the quantized 8-bit equivalents.
 */
export function floydSteinbergRGB565Buffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clampBlackGuard = true
): Uint8Array {
  const errR = new Float32Array(width * height);
  const errG = new Float32Array(width * height);
  const errB = new Float32Array(width * height);

  const rgb565Out = new Uint8Array(width * height * 2);
  const view = new DataView(rgb565Out.buffer);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const idx = pIdx * 4;
      const a = data[idx + 3];

      if (a < 16) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        view.setUint16(pIdx * 2, 0x0000, true);
        continue;
      }

      let oldR = Math.max(0, Math.min(255, data[idx] + errR[pIdx]));
      let oldG = Math.max(0, Math.min(255, data[idx + 1] + errG[pIdx]));
      let oldB = Math.max(0, Math.min(255, data[idx + 2] + errB[pIdx]));

      if (clampBlackGuard && oldR < 8 && oldG < 8 && oldB < 8) {
        oldR = 8;
        oldG = 8;
        oldB = 8;
      }

      let r5 = Math.round((oldR * 31) / 255);
      let g6 = Math.round((oldG * 63) / 255);
      let b5 = Math.round((oldB * 31) / 255);

      if (clampBlackGuard && r5 === 0 && g6 === 0 && b5 === 0) {
        r5 = 1;
        g6 = 2;
        b5 = 1;
      }

      const newR = (r5 << 3) | (r5 >> 2);
      const newG = (g6 << 2) | (g6 >> 4);
      const newB = (b5 << 3) | (b5 >> 2);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;

      const packed565 = ((r5 & 0x1f) << 11) | ((g6 & 0x3f) << 5) | (b5 & 0x1f);
      view.setUint16(pIdx * 2, packed565, true);

      const quantErrR = oldR - newR;
      const quantErrG = oldG - newG;
      const quantErrB = oldB - newB;

      if (x + 1 < width) {
        const n = pIdx + 1;
        errR[n] += (quantErrR * 7) / 16;
        errG[n] += (quantErrG * 7) / 16;
        errB[n] += (quantErrB * 7) / 16;
      }
      if (x - 1 >= 0 && y + 1 < height) {
        const n = pIdx + width - 1;
        errR[n] += (quantErrR * 3) / 16;
        errG[n] += (quantErrG * 3) / 16;
        errB[n] += (quantErrB * 3) / 16;
      }
      if (y + 1 < height) {
        const n = pIdx + width;
        errR[n] += (quantErrR * 5) / 16;
        errG[n] += (quantErrG * 5) / 16;
        errB[n] += (quantErrB * 5) / 16;
      }
      if (x + 1 < width && y + 1 < height) {
        const n = pIdx + width + 1;
        errR[n] += (quantErrR * 1) / 16;
        errG[n] += (quantErrG * 1) / 16;
        errB[n] += (quantErrB * 1) / 16;
      }
    }
  }

  return rgb565Out;
}

export function floydSteinbergRGB565(
  imageData: ImageData,
  clampBlackGuard = true
): Uint8Array {
  return floydSteinbergRGB565Buffer(
    imageData.data,
    imageData.width,
    imageData.height,
    clampBlackGuard
  );
}

export function computeTightBoundingBox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8
): { x: number; y: number; width: number; height: number } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: Math.floor(width / 2), y: Math.floor(height / 2), width: 2, height: 2 };
  }

  const cropX = Math.max(0, minX - 1);
  const cropY = Math.max(0, minY - 1);
  const cropW = Math.min(width - cropX, maxX - minX + 3);
  const cropH = Math.min(height - cropY, maxY - minY + 3);

  const evenW = cropW % 2 === 0 ? cropW : Math.min(width - cropX, cropW + 1);
  const evenH = cropH % 2 === 0 ? cropH : Math.min(height - cropY, cropH + 1);

  return { x: cropX, y: cropY, width: Math.max(2, evenW), height: Math.max(2, evenH) };
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function buildQuantizedSprite(params: {
  id: string;
  category: CroppedSprite['category'];
  label: string;
  sourceCanvas: HTMLCanvasElement;
  centerX: number;
  centerY: number;
  crop: boolean;
  ditherRgb565: boolean;
  fitCloudBlackGuard: boolean;
}): CroppedSprite {
  const {
    id,
    category,
    label,
    sourceCanvas,
    centerX,
    centerY,
    crop,
    ditherRgb565,
    fitCloudBlackGuard,
  } = params;

  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  const fullData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const bbox = crop
    ? computeTightBoundingBox(fullData.data, sourceCanvas.width, sourceCanvas.height)
    : { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height };

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = bbox.width;
  croppedCanvas.height = bbox.height;
  const cropCtx = croppedCanvas.getContext('2d', { willReadFrequently: true })!;
  cropCtx.drawImage(
    sourceCanvas,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    0,
    0,
    bbox.width,
    bbox.height
  );

  const croppedImg = cropCtx.getImageData(0, 0, bbox.width, bbox.height);
  if (fitCloudBlackGuard) {
    applyFitCloudBlackGuard(croppedImg);
  }

  let rgb565Bytes: Uint8Array;
  if (ditherRgb565) {
    rgb565Bytes = floydSteinbergRGB565(croppedImg, fitCloudBlackGuard);
    cropCtx.putImageData(croppedImg, 0, 0);
  } else {
    const clone = new ImageData(
      new Uint8ClampedArray(croppedImg.data),
      croppedImg.width,
      croppedImg.height
    );
    rgb565Bytes = floydSteinbergRGB565(clone, fitCloudBlackGuard);
    if (fitCloudBlackGuard) {
      cropCtx.putImageData(croppedImg, 0, 0);
    }
  }

  const dataUrl = croppedCanvas.toDataURL('image/png');
  const pngBytes = dataUrlToBytes(dataUrl);
  const rgba8888Bytes = new Uint8Array(croppedImg.data.buffer.slice(0));

  return {
    id,
    category,
    label,
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    pivotX: Math.round(centerX - bbox.x),
    pivotY: Math.round(centerY - bbox.y),
    centerX,
    centerY,
    canvas: croppedCanvas,
    imageData: croppedImg,
    pngBytes,
    rgb565Bytes,
    rgba8888Bytes,
    dataUrl,
  };
}
