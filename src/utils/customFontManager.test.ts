import test from 'node:test';
import assert from 'node:assert/strict';
import { WATCH_PRESETS, cloneConfig } from '../presets/watchPresets';
import { CustomFontAsset } from '../types/watchface';
import {
  addCustomFontToConfig,
  MAX_CUSTOM_FONT_BYTES,
  removeCustomFontFromConfig,
  resolveActiveCustomFont,
  resolveGlyphFontFamily,
  sanitizeFontFamilyName,
  selectCustomFontInConfig,
  validateCustomFontFile,
} from './customFontManager';

function makeDummyFont(overrides: Partial<CustomFontAsset> = {}): CustomFontAsset {
  return {
    id: 'font_abc123',
    name: 'Chrono Display',
    fileName: 'Chrono_Display.ttf',
    format: 'ttf',
    familyName: sanitizeFontFamilyName('font_abc123'),
    dataUrl: 'data:font/ttf;base64,AAEAAAA=',
    byteSize: 24576,
    ...overrides,
  };
}

test('validateCustomFontFile accepts .ttf and .otf and rejects invalid extensions or sizes', () => {
  const ttf = validateCustomFontFile('My-Watch_Font.TTF', 4096);
  assert.equal(ttf.ok, true);
  if (ttf.ok) {
    assert.equal(ttf.format, 'ttf');
    assert.equal(ttf.displayName, 'My Watch Font');
  }

  const otf = validateCustomFontFile('Geometric.otf', 8192);
  assert.equal(otf.ok, true);
  if (otf.ok) {
    assert.equal(otf.format, 'otf');
    assert.equal(otf.displayName, 'Geometric');
  }

  assert.equal(validateCustomFontFile('font.woff2', 4096).ok, false);
  assert.equal(validateCustomFontFile('empty.ttf', 0).ok, false);
  assert.equal(
    validateCustomFontFile('huge.otf', MAX_CUSTOM_FONT_BYTES + 1).ok,
    false
  );
});

test('addCustomFontToConfig, selectCustomFontInConfig, and removeCustomFontFromConfig manage font state cleanly', () => {
  const base = cloneConfig(WATCH_PRESETS[0]);
  const font1 = makeDummyFont({ id: 'f1', name: 'Font One', familyName: 'CFCustom_f1' });
  const font2 = makeDummyFont({
    id: 'f2',
    name: 'Font Two',
    format: 'otf',
    fileName: 'FontTwo.otf',
    familyName: 'CFCustom_f2',
  });

  let cfg = addCustomFontToConfig(base, font1, true);
  assert.equal(cfg.digital.customFonts?.length, 1);
  assert.equal(cfg.digital.activeCustomFontId, 'f1');
  assert.equal(resolveActiveCustomFont(cfg.digital)?.name, 'Font One');
  assert.equal(
    resolveGlyphFontFamily(cfg),
    '"CFCustom_f1", "Outfit", sans-serif'
  );

  cfg = addCustomFontToConfig(cfg, font2, true);
  assert.equal(cfg.digital.customFonts?.length, 2);
  assert.equal(cfg.digital.activeCustomFontId, 'f2');
  assert.equal(
    resolveGlyphFontFamily(cfg),
    '"CFCustom_f2", "Outfit", sans-serif'
  );

  // Switch back to built-in default
  cfg = selectCustomFontInConfig(cfg, null);
  assert.equal(cfg.digital.activeCustomFontId, null);
  assert.equal(resolveActiveCustomFont(cfg.digital), null);
  assert.ok(resolveGlyphFontFamily(cfg).includes('Outfit'));

  // Re-select f2 and then remove it -> falls back to remaining font f1
  cfg = selectCustomFontInConfig(cfg, 'f2');
  cfg = removeCustomFontFromConfig(cfg, 'f2');
  assert.equal(cfg.digital.customFonts?.length, 1);
  assert.equal(cfg.digital.activeCustomFontId, 'f1');

  // Remove last font -> activeCustomFontId becomes null
  cfg = removeCustomFontFromConfig(cfg, 'f1');
  assert.equal(cfg.digital.customFonts?.length, 0);
  assert.equal(cfg.digital.activeCustomFontId, null);
});
