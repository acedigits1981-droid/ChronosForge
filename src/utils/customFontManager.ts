import { CustomFontAsset, WatchFaceConfig } from '../types/watchface';

export const MAX_CUSTOM_FONT_BYTES = 10 * 1024 * 1024; // 10 MB

export type FontValidationResult =
  | { ok: true; format: 'ttf' | 'otf'; displayName: string }
  | { ok: false; error: string };

export function validateCustomFontFile(
  fileName: string,
  byteSize: number
): FontValidationResult {
  const trimmed = fileName.trim();
  const extMatch = /\.(ttf|otf)$/i.exec(trimmed);
  if (!extMatch) {
    return {
      ok: false,
      error: 'Unsupported file type. Please upload a .ttf or .otf font file.',
    };
  }
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return {
      ok: false,
      error: 'The selected font file is empty.',
    };
  }
  if (byteSize > MAX_CUSTOM_FONT_BYTES) {
    return {
      ok: false,
      error: 'Font file exceeds the 10 MB size limit.',
    };
  }
  const format = extMatch[1].toLowerCase() as 'ttf' | 'otf';
  const baseName = trimmed.replace(/\.(ttf|otf)$/i, '').replace(/[_-]+/g, ' ').trim();
  return {
    ok: true,
    format,
    displayName: baseName || 'Custom Font',
  };
}

export function sanitizeFontFamilyName(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_]/g, '');
  return `CFCustom_${safe || 'font'}`;
}

export function resolveActiveCustomFont(
  digital: WatchFaceConfig['digital']
): CustomFontAsset | null {
  const activeId = digital.activeCustomFontId;
  if (!activeId || !digital.customFonts || digital.customFonts.length === 0) {
    return null;
  }
  return digital.customFonts.find((f) => f.id === activeId) ?? null;
}

export function resolveGlyphFontFamily(config: WatchFaceConfig): string {
  const activeCustom = resolveActiveCustomFont(config.digital);
  if (activeCustom) {
    return `"${activeCustom.familyName}", "Outfit", sans-serif`;
  }
  return config.digital.fontStyle === 'tacticalStencil'
    ? '"JetBrains Mono", monospace'
    : '"Outfit", "Plus Jakarta Sans", sans-serif';
}

export function addCustomFontToConfig(
  config: WatchFaceConfig,
  asset: CustomFontAsset,
  activate = true
): WatchFaceConfig {
  const existing = config.digital.customFonts ?? [];
  const filtered = existing.filter((f) => f.id !== asset.id);
  const nextFonts = [...filtered, asset];
  return {
    ...config,
    digital: {
      ...config.digital,
      customFonts: nextFonts,
      activeCustomFontId: activate ? asset.id : config.digital.activeCustomFontId ?? null,
    },
  };
}

export function selectCustomFontInConfig(
  config: WatchFaceConfig,
  fontId: string | null
): WatchFaceConfig {
  if (!fontId) {
    return {
      ...config,
      digital: {
        ...config.digital,
        activeCustomFontId: null,
      },
    };
  }
  const exists = (config.digital.customFonts ?? []).some((f) => f.id === fontId);
  if (!exists) return config;
  return {
    ...config,
    digital: {
      ...config.digital,
      activeCustomFontId: fontId,
    },
  };
}

export function removeCustomFontFromConfig(
  config: WatchFaceConfig,
  fontId: string
): WatchFaceConfig {
  const existing = config.digital.customFonts ?? [];
  const nextFonts = existing.filter((f) => f.id !== fontId);
  const wasActive = config.digital.activeCustomFontId === fontId;
  return {
    ...config,
    digital: {
      ...config.digital,
      customFonts: nextFonts,
      activeCustomFontId: wasActive
        ? nextFonts[nextFonts.length - 1]?.id ?? null
        : config.digital.activeCustomFontId ?? null,
    },
  };
}

const loadedFontPromises = new Map<string, Promise<void>>();

export async function registerCustomFontFace(
  asset: CustomFontAsset,
  sourceBuffer?: ArrayBuffer
): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return;
  }
  const existing = loadedFontPromises.get(asset.familyName);
  if (existing) return existing;

  const task = (async () => {
    try {
      const source: string | BufferSource = sourceBuffer
        ? sourceBuffer
        : `url("${asset.dataUrl}")`;
      const face = new FontFace(asset.familyName, source);
      const loaded = await face.load();
      document.fonts.add(loaded);
      await document.fonts.ready;
    } catch (err) {
      loadedFontPromises.delete(asset.familyName);
      throw err;
    }
  })();

  loadedFontPromises.set(asset.familyName, task);
  return task;
}

export async function ensureConfigFontsRegistered(
  config: WatchFaceConfig
): Promise<boolean> {
  const fonts = config.digital.customFonts ?? [];
  if (fonts.length === 0) return false;
  let loadedAny = false;
  for (const font of fonts) {
    if (!loadedFontPromises.has(font.familyName)) {
      await registerCustomFontFace(font);
      loadedAny = true;
    } else {
      await loadedFontPromises.get(font.familyName);
    }
  }
  return loadedAny;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function loadCustomFontFromFile(
  file: File
): Promise<CustomFontAsset> {
  const validation = validateCustomFontFile(file.name, file.size);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const buffer = await file.arrayBuffer();
  const mime =
    validation.format === 'otf' ? 'font/otf' : 'font/ttf';
  const base64 = arrayBufferToBase64(buffer);
  const dataUrl = `data:${mime};base64,${base64}`;
  const uniqueId = `font_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  const asset: CustomFontAsset = {
    id: uniqueId,
    name: validation.displayName,
    fileName: file.name,
    format: validation.format,
    familyName: sanitizeFontFamilyName(uniqueId),
    dataUrl,
    byteSize: file.size,
  };

  await registerCustomFontFace(asset, buffer);
  return asset;
}
