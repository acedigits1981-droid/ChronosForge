import JSZip from 'jszip';
import {
  ParsedTemplateInfo,
  SimulationState,
  WatchFaceConfig,
} from '../types/watchface';
import { compileWatchSprites } from '../engine/renderer';
import {
  compressIwfLz4,
  crc32,
  fastlz1Compress,
  fastlz1Decompress,
  lz4DecompressBlock,
} from './compression';
import { buildFitCloudBin, TBUI_ELEMENT_TYPES } from './fitcloudCompiler';
import { buildVeryFitPackage } from './veryfitCompiler';

function findAsciiSequence(data: Uint8Array, needle: string): number {
  const codes = needle.split('').map((c) => c.charCodeAt(0));
  for (let i = 0; i <= data.length - codes.length; i++) {
    let match = true;
    for (let j = 0; j < codes.length; j++) {
      if (data[i + j] !== codes[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * Inspects an uploaded official `.bin`, `.iwf`, or `.iwf.lz` reference watch face file.
 */
export async function inspectReferenceWatchFace(
  fileName: string,
  rawBytes: Uint8Array
): Promise<ParsedTemplateInfo> {
  const view = new DataView(
    rawBytes.buffer,
    rawBytes.byteOffset,
    rawBytes.byteLength
  );

  // Case 1: ZIP container (.iwf) — starts with 'PK\x03\x04' (0x04034b50)
  if (rawBytes.length >= 4 && view.getUint32(0, true) === 0x04034b50) {
    const zip = await JSZip.loadAsync(rawBytes);
    const zipEntries = Object.keys(zip.files);
    let iwfJson: Record<string, unknown> = {};
    let fontJson: Record<string, unknown> = {};

    if (zip.files['iwf.json']) {
      const txt = await zip.files['iwf.json'].async('string');
      try {
        iwfJson = JSON.parse(txt);
      } catch {
        iwfJson = { raw: txt };
      }
    }
    if (zip.files['font.json']) {
      const txt = await zip.files['font.json'].async('string');
      try {
        fontJson = JSON.parse(txt);
      } catch {
        fontJson = { raw: txt };
      }
    }

    const items = Array.isArray(iwfJson.item) ? iwfJson.item : [];
    const width = typeof iwfJson.width === 'number' ? iwfJson.width : 466;
    const height = typeof iwfJson.height === 'number' ? iwfJson.height : 466;

    return {
      fileName,
      format: 'veryfit-iwf',
      width,
      height,
      version: `IWF v${iwfJson.version ?? 2}`,
      magicSignature: 'PK\\x03\\x04 (ZIP/IWF)',
      elementCount: items.length,
      spriteCount: zipEntries.filter((e) => e.endsWith('.png')).length,
      compressionType: 'zip',
      modelId: String(iwfJson.clib ?? 'veryfit_ido_v2'),
      rawBytes,
      iwfJson,
      fontJson,
      zipEntries,
    };
  }

  // Case 2: LZ4 or FastLZ compressed (.iwf.lz)
  const magic32 = rawBytes.length >= 4 ? view.getUint32(0, true) : 0;
  if (magic32 === 0x184d2204 || findAsciiSequence(rawBytes.subarray(0, 8), 'FLZ1') === 0) {
    const isFlz = findAsciiSequence(rawBytes.subarray(0, 8), 'FLZ1') === 0;
    const uncompSize = view.getUint32(4, true);
    const payload = isFlz ? rawBytes.subarray(8) : rawBytes.subarray(16);
    const decompressed = isFlz
      ? fastlz1Decompress(payload, uncompSize)
      : lz4DecompressBlock(payload, uncompSize);

    const inner = await inspectReferenceWatchFace(fileName, decompressed);
    return {
      ...inner,
      format: 'veryfit-iwf-lz',
      compressionType: isFlz ? 'fastlz' : 'lz4',
      magicSignature: isFlz ? 'FLZ1 (FastLZ IWF)' : '0x184D2204 (LZ4 IWF)',
      rawBytes,
    };
  }

  // Case 3: FitCloudPro (.bin) with TBUI signature
  const tbuiPos = findAsciiSequence(rawBytes, 'TBUI');
  const isChronosTbui =
    rawBytes.length >= 64 &&
    rawBytes[0] === 0x54 &&
    rawBytes[1] === 0x42 &&
    rawBytes[2] === 0x55 &&
    rawBytes[3] === 0x49;

  if (isChronosTbui) {
    const verMajor = rawBytes[5];
    const verMinor = rawBytes[4];
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    const elemCount = view.getUint16(10, true);
    const descTableOffset = view.getUint32(16, true);

    let modelStr = '';
    for (let i = 32; i < 48; i++) {
      if (rawBytes[i] >= 32 && rawBytes[i] <= 126) {
        modelStr += String.fromCharCode(rawBytes[i]);
      }
    }

    const tbuiElements: NonNullable<ParsedTemplateInfo['tbuiElements']> = [];
    for (let i = 0; i < elemCount; i++) {
      const off = descTableOffset + i * 24;
      if (off + 24 > rawBytes.length) break;
      const typeCode = view.getUint8(off + 0);
      const pixFmt = view.getUint8(off + 1);
      tbuiElements.push({
        index: i,
        typeCode,
        typeLabel: TBUI_ELEMENT_TYPES[typeCode] ?? `ELEMENT_0x${typeCode.toString(16)}`,
        x: view.getUint16(off + 2, true),
        y: view.getUint16(off + 4, true),
        width: view.getUint16(off + 6, true),
        height: view.getUint16(off + 8, true),
        pixelFormat: pixFmt === 1 ? 'RGB565' : 'RGBA8888',
        dataOffset: view.getUint32(off + 16, true),
        dataLength: view.getUint32(off + 20, true),
      });
    }

    return {
      fileName,
      format: 'fitcloud-tbui',
      width: width || 466,
      height: height || 466,
      version: `TBUI v${verMajor}.${verMinor}`,
      magicSignature: `TBUI @ 0x0000`,
      elementCount: elemCount,
      spriteCount: elemCount,
      compressionType: 'none',
      tbuiOffset: tbuiPos >= 0 ? tbuiPos : 0,
      modelId: modelStr || 'FitCloudPro_TBUI',
      rawBytes,
      tbuiElements,
    };
  }

  // Generic third-party FitCloudPro .bin scan for common watch dimensions
  let detectedW = 466;
  let detectedH = 466;
  const knownDims: Array<[number, number]> = [
    [466, 466],
    [454, 454],
    [360, 360],
    [240, 240],
    [368, 448],
    [320, 385],
    [240, 284],
  ];

  for (let i = 0; i < Math.min(256, rawBytes.length - 4); i += 2) {
    const w = view.getUint16(i, true);
    const h = view.getUint16(i + 2, true);
    const match = knownDims.find(([kw, kh]) => kw === w && kh === h);
    if (match) {
      detectedW = match[0];
      detectedH = match[1];
      break;
    }
  }

  return {
    fileName,
    format: 'fitcloud-tbui',
    width: detectedW,
    height: detectedH,
    version: 'TBUI Native Container',
    magicSignature:
      tbuiPos >= 0
        ? `TBUI @ 0x${tbuiPos.toString(16).toUpperCase()}`
        : `BIN Header 0x${view.getUint32(0, false).toString(16).toUpperCase()}`,
    elementCount: 8,
    spriteCount: 14,
    compressionType: 'none',
    tbuiOffset: tbuiPos >= 0 ? tbuiPos : rawBytes.length - 16,
    modelId: 'FitCloudPro_OEM',
    rawBytes,
    tbuiElements: [
      {
        index: 0,
        typeCode: 0x01,
        typeLabel: 'BACKGROUND_PLATE (RGB565)',
        x: 0,
        y: 0,
        width: detectedW,
        height: detectedH,
        pixelFormat: 'RGB565',
        dataOffset: 64,
        dataLength: detectedW * detectedH * 2,
      },
    ],
  };
}

/**
 * Clones the newly designed photorealistic ChronosForge dial into the uploaded
 * reference `.bin`, `.iwf`, or `.iwf.lz` hardware container.
 */
export async function cloneIntoReferenceTemplate(
  template: ParsedTemplateInfo,
  config: WatchFaceConfig,
  sim: SimulationState
): Promise<{ bytes: Uint8Array; outputFileName: string; summary: string }> {
  const clonedConfig: WatchFaceConfig = {
    ...config,
    resolution: {
      ...config.resolution,
      width: template.width,
      height: template.height,
      shape: template.width === template.height ? 'round' : 'squircle',
      cornerRadius:
        template.width === template.height
          ? Math.round(template.width / 2)
          : Math.round(Math.min(template.width, template.height) * 0.2),
    },
  };

  const assets = compileWatchSprites(clonedConfig, sim);

  if (template.format === 'veryfit-iwf' || template.format === 'veryfit-iwf-lz') {
    const pkg = await buildVeryFitPackage(
      clonedConfig,
      sim,
      template.compressionType === 'fastlz' ? 'fastlz' : 'lz4',
      assets
    );

    if (template.iwfJson && typeof template.iwfJson.clib === 'string') {
      const zip = await JSZip.loadAsync(pkg.iwfBytes);
      const currentManifest = JSON.parse(pkg.iwfJsonString);
      currentManifest.clib = template.iwfJson.clib;
      if (template.iwfJson.id !== undefined) {
        currentManifest.id = template.iwfJson.id;
      }
      zip.file('iwf.json', JSON.stringify(currentManifest, null, 2));
      const updatedZipBytes = await zip.generateAsync({ type: 'uint8array' });

      if (template.format === 'veryfit-iwf-lz') {
        const lzBytes =
          template.compressionType === 'fastlz'
            ? fastlz1Compress(updatedZipBytes)
            : compressIwfLz4(updatedZipBytes);
        return {
          bytes: lzBytes,
          outputFileName: `cloned_${template.fileName.replace(/\.iwf(\.lz)?$/i, '')}.iwf.lz`,
          summary: `Cloned ${assets.allSprites.length} quantized sprites into VeryFit ${template.compressionType.toUpperCase()} container (${template.width}×${template.height}, clib=${currentManifest.clib}).`,
        };
      }

      return {
        bytes: updatedZipBytes,
        outputFileName: `cloned_${template.fileName.replace(/\.iwf$/i, '')}.iwf`,
        summary: `Cloned ${assets.allSprites.length} quantized sprites into VeryFit IWF container (${template.width}×${template.height}, clib=${currentManifest.clib}).`,
      };
    }

    return {
      bytes: template.format === 'veryfit-iwf-lz' ? pkg.iwfLzBytes : pkg.iwfBytes,
      outputFileName:
        template.format === 'veryfit-iwf-lz'
          ? `cloned_${template.fileName}`
          : `cloned_${template.fileName}`,
      summary: `Cloned ${assets.allSprites.length} sprites into VeryFit ${template.width}×${template.height} package.`,
    };
  }

  // FitCloudPro (.bin) cloning
  const binBytes = buildFitCloudBin(
    clonedConfig,
    sim,
    assets,
    template.modelId || 'TBUI_CLONE'
  );

  if (
    template.rawBytes.length >= 64 &&
    template.rawBytes[0] === 0x54 &&
    template.rawBytes[1] === 0x42
  ) {
    binBytes[4] = template.rawBytes[4];
    binBytes[5] = template.rawBytes[5];
    for (let i = 32; i < 48; i++) {
      binBytes[i] = template.rawBytes[i];
    }
    const footerOffset = binBytes.length - 16;
    const newCrc = crc32(binBytes.subarray(0, footerOffset));
    const dv = new DataView(binBytes.buffer);
    dv.setUint32(28, newCrc, true);
    dv.setUint32(footerOffset + 4, newCrc, true);
  }

  return {
    bytes: binBytes,
    outputFileName: `cloned_${template.fileName.replace(/\.bin$/i, '')}.bin`,
    summary: `Injected RGB565 background (#080808 clamped), 3D hands, and ${assets.glyphs.length} numeral glyphs into FitCloudPro TBUI (${template.width}×${template.height}) container.`,
  };
}
