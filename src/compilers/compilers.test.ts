import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compressIwfLz4,
  crc16Ccitt,
  crc32,
  fastlz1Compress,
  fastlz1Decompress,
  lz4CompressBlock,
  lz4DecompressBlock,
} from './compression';
import {
  applyFitCloudBlackGuardBuffer,
  computeTightBoundingBox,
  floydSteinbergRGB565Buffer,
} from '../engine/quantizer';

test('LZ4 block compression and decompression roundtrip', () => {
  const input = new Uint8Array(1024);
  for (let i = 0; i < input.length; i++) {
    input[i] = (i % 32) + 65;
  }
  const compressed = lz4CompressBlock(input);
  assert.ok(compressed.byteLength < input.byteLength);
  const decompressed = lz4DecompressBlock(compressed, input.byteLength);
  assert.deepEqual(decompressed, input);
});

test('IWF LZ4 container header stores magic, uncompressed size, and CRC32', () => {
  const payload = new TextEncoder().encode(
    'ChronosForge-VeryFit-IWF-Test-Payload-'.repeat(20)
  );
  const framed = compressIwfLz4(payload);
  const view = new DataView(framed.buffer);
  assert.equal(view.getUint32(0, true), 0x184d2204);
  assert.equal(view.getUint32(4, true), payload.byteLength);
  assert.equal(view.getUint32(12, true), crc32(payload));
});

test('FastLZ Level-1 compression and decompression roundtrip', () => {
  const input = new TextEncoder().encode(
    'GalaxyWatchUltraTactical_466x466_RGB565_Sprite_'.repeat(30)
  );
  const framed = fastlz1Compress(input);
  assert.equal(framed[0], 0x46); // 'F'
  assert.equal(framed[1], 0x4c); // 'L'
  assert.equal(framed[2], 0x5a); // 'Z'
  assert.equal(framed[3], 0x31); // '1'
  const uncompLen = new DataView(framed.buffer).getUint32(4, true);
  assert.equal(uncompLen, input.byteLength);
  const restored = fastlz1Decompress(framed.subarray(8), uncompLen);
  assert.deepEqual(restored, input);
});

test('FitCloudPro pure-black (#000000) guard clamps opaque pixels < 8 to #080808', () => {
  const rgba = new Uint8ClampedArray([
    0, 0, 0, 255, // opaque pure black -> clamped to 8,8,8,255
    4, 5, 7, 200, // opaque near black -> clamped to 8,8,8,200
    0, 0, 0, 0, // transparent pixel -> untouched
    12, 20, 30, 255, // normal dark pixel -> untouched
  ]);
  applyFitCloudBlackGuardBuffer(rgba, 2, 2);
  assert.deepEqual(Array.from(rgba.slice(0, 4)), [8, 8, 8, 255]);
  assert.deepEqual(Array.from(rgba.slice(4, 8)), [8, 8, 8, 200]);
  assert.deepEqual(Array.from(rgba.slice(8, 12)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(rgba.slice(12, 16)), [12, 20, 30, 255]);
});

test('Floyd-Steinberg RGB565 quantizer outputs 2 bytes per pixel and avoids 0x0000 on opaque pixels', () => {
  const width = 4;
  const height = 4;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 0] = i * 8;
    rgba[i * 4 + 1] = i * 4;
    rgba[i * 4 + 2] = i * 2;
    rgba[i * 4 + 3] = 255;
  }
  const rgb565 = floydSteinbergRGB565Buffer(rgba, width, height, true);
  assert.equal(rgb565.byteLength, width * height * 2);
  const view = new DataView(rgb565.buffer);
  for (let i = 0; i < width * height; i++) {
    assert.notEqual(view.getUint16(i * 2, true), 0x0000);
  }
});

test('Tight bounding box trims transparent borders and keeps even dimensions', () => {
  const width = 10;
  const height = 10;
  const rgba = new Uint8ClampedArray(width * height * 4);
  // Set opaque pixel at (4, 5)
  const idx = (5 * width + 4) * 4;
  rgba[idx] = 255;
  rgba[idx + 3] = 255;

  const bbox = computeTightBoundingBox(rgba, width, height);
  assert.ok(bbox.x <= 4 && bbox.x >= 3);
  assert.ok(bbox.y <= 5 && bbox.y >= 4);
  assert.equal(bbox.width % 2, 0);
  assert.equal(bbox.height % 2, 0);
});

test('CRC16-CCITT and CRC32 produce deterministic values', () => {
  const sample = new TextEncoder().encode('123456789');
  assert.equal(crc16Ccitt(sample), 0x29b1);
  assert.equal(crc32(sample), 0xcbf43926);
});

test('Intact Round and Square preset libraries strictly separate form factors and back every face with an existing high-res asset', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ROUND_WATCH_PRESETS, SQUARE_WATCH_PRESETS, WATCH_PRESETS } =
    await import('../presets/watchPresets');

  assert.equal(ROUND_WATCH_PRESETS.length, 17);
  assert.equal(SQUARE_WATCH_PRESETS.length, 17);
  assert.equal(WATCH_PRESETS.length, 34);

  for (const preset of ROUND_WATCH_PRESETS) {
    assert.equal(preset.resolution.shape, 'round');
    assert.ok(preset.resolution.width >= 1080);
    assert.ok(
      preset.category === 'round-analog' || preset.category === 'round-digital',
      `Unexpected round category: ${preset.category}`
    );
    if (preset.displayMode !== 'digital') {
      assert.equal(preset.hands.enabled, true, `Expected live hands on ${preset.presetId}`);
      assert.equal(preset.layers.find((l) => l.id === 'hands')?.visible, true);
    }
    const artworkUrl = preset.dial.intactArtworkUrl;
    assert.ok(artworkUrl && artworkUrl.startsWith('/assets/faces/round/'));
    const diskPath = path.join(process.cwd(), 'public', artworkUrl.slice(1));
    assert.ok(fs.existsSync(diskPath), `Missing round asset file: ${diskPath}`);
  }

  for (const preset of SQUARE_WATCH_PRESETS) {
    assert.equal(preset.resolution.shape, 'squircle');
    assert.ok(preset.resolution.width >= 1080);
    assert.ok(
      preset.category === 'square-analog' || preset.category === 'square-digital',
      `Unexpected square category: ${preset.category}`
    );
    if (preset.displayMode !== 'digital') {
      assert.equal(preset.hands.enabled, true, `Expected live hands on ${preset.presetId}`);
      assert.equal(preset.layers.find((l) => l.id === 'hands')?.visible, true);
    }
    const artworkUrl = preset.dial.intactArtworkUrl;
    assert.ok(artworkUrl && artworkUrl.startsWith('/assets/faces/square/'));
    const diskPath = path.join(process.cwd(), 'public', artworkUrl.slice(1));
    assert.ok(
      fs.existsSync(diskPath),
      `Missing square asset file: ${diskPath}`
    );
  }
});

test('Texture Engine iridescent shader evaluates thin-film RGB interference and enforces #080808 floor', async () => {
  const { evaluateIridescentSpectrum, sampleIridescentNacrePixel } =
    await import('../engine/textureEngine');

  const roseSpec = evaluateIridescentSpectrum(1.2, 0.25, 1.25, 'roseChampagne');
  const tahitianSpec = evaluateIridescentSpectrum(
    2.4,
    0.1,
    1.3,
    'tahitianPeacock'
  );
  assert.notDeepEqual(roseSpec, tahitianSpec);
  assert.ok(roseSpec.fresnelSheen > 0.5);

  const [r, g, b] = sampleIridescentNacrePixel(
    0.15,
    -0.25,
    [247, 223, 229],
    [245, 204, 184],
    5.5,
    1.25,
    'roseChampagne'
  );
  assert.ok(r >= 8 && r <= 255);
  assert.ok(g >= 8 && g <= 255);
  assert.ok(b >= 8 && b <= 255);

  // Zero-intensity black input still respects #080808 guard floor
  const [dr, dg, db] = sampleIridescentNacrePixel(
    0,
    0,
    [0, 0, 0],
    [0, 0, 0],
    0,
    0,
    'tahitianPeacock'
  );
  assert.ok(dr >= 8 && dg >= 8 && db >= 8);
});

test('HSL color utilities normalize hex, convert RGB/HSL roundtrips, and pick high-contrast foregrounds', async () => {
  const { normalizeHex, hexToHsl, hslToHex, getContrastTextColor } =
    await import('../utils/colorUtils');

  assert.equal(normalizeHex('f90'), '#ff9900');
  assert.equal(normalizeHex('  #ABC  '), '#aabbcc');
  assert.equal(normalizeHex('invalid-hex'), null);

  const roseHsl = hexToHsl('#f4af9d');
  assert.ok(roseHsl.h >= 5 && roseHsl.h <= 20);
  const backToHex = hslToHex(roseHsl.h, roseHsl.s, roseHsl.l);
  assert.ok(normalizeHex(backToHex) !== null);

  assert.equal(getContrastTextColor('#fbf1ec'), '#0f172a');
  assert.equal(getContrastTextColor('#10131a'), '#f8fafc');
});

test('Round and Square counterparts keep matching intact design styles across 1080x1080 Round and Squircle specs', async () => {
  const {
    ROUND_WATCH_PRESETS,
    RESOLUTION_SPECS,
    adaptWatchFaceToResolution,
    findCounterpartShapePreset,
  } = await import('../presets/watchPresets');

  const squircleSpec = RESOLUTION_SPECS[1]; // 1080x1080 squircle
  const roundSpec = RESOLUTION_SPECS[0]; // 1080x1080 round
  assert.equal(squircleSpec.shape, 'squircle');
  assert.equal(squircleSpec.width, 1080);
  assert.equal(squircleSpec.height, 1080);

  const roundFace = ROUND_WATCH_PRESETS[0];
  const squareCounterpart = findCounterpartShapePreset(roundFace, 'squircle');
  assert.ok(squareCounterpart);
  assert.equal(squareCounterpart.resolution.shape, 'squircle');
  assert.ok(squareCounterpart.dial.intactArtworkUrl?.includes('/assets/faces/square/'));

  const adaptedSquare = adaptWatchFaceToResolution(roundFace, squircleSpec);
  assert.equal(adaptedSquare.presetId, squareCounterpart.presetId);
  assert.equal(adaptedSquare.resolution.shape, 'squircle');
  assert.equal(adaptedSquare.resolution.width, 1080);
  assert.equal(adaptedSquare.resolution.height, 1080);
  assert.equal(
    adaptedSquare.dial.intactArtworkUrl,
    squareCounterpart.dial.intactArtworkUrl
  );

  const roundBack = adaptWatchFaceToResolution(adaptedSquare, roundSpec);
  assert.equal(roundBack.resolution.shape, 'round');
  assert.equal(roundBack.presetId, roundFace.presetId);
  assert.equal(roundBack.dial.intactArtworkUrl, roundFace.dial.intactArtworkUrl);
});

test('sampleRoundedRectPerimeter samples points inside bounds with unit outward normals', async () => {
  const { sampleRoundedRectPerimeter } = await import('../engine/textureEngine');
  const pts = sampleRoundedRectPerimeter(1080, 1312, 240, 20, 60, 0);
  assert.equal(pts.length, 60);
  for (const pt of pts) {
    assert.ok(pt.x >= 19 && pt.x <= 1061);
    assert.ok(pt.y >= 19 && pt.y <= 1293);
    const normMag = Math.hypot(pt.nx, pt.ny);
    assert.ok(Math.abs(normMag - 1) < 0.02);
  }
});

test('Easy Mode multilingual dictionary covers all 10 languages (including Farsi RTL) completely with valid swatches', async () => {
  const {
    SUPPORTED_LANGUAGES,
    TRANSLATIONS,
    EASY_COLOR_PALETTE,
    getLanguageDir,
    classifyEasyPreset,
  } = await import('../i18n/translations');
  const { normalizeHex } = await import('../utils/colorUtils');
  const { WATCH_PRESETS } = await import('../presets/watchPresets');

  assert.equal(SUPPORTED_LANGUAGES.length, 10);
  assert.ok(SUPPORTED_LANGUAGES.some((l) => l.code === 'fa' && l.nativeName === 'فارسی'));
  const enKeys = Object.keys(TRANSLATIONS.en) as Array<keyof typeof TRANSLATIONS.en>;

  for (const lang of SUPPORTED_LANGUAGES) {
    const dict = TRANSLATIONS[lang.code];
    assert.ok(dict, `Missing translation dictionary for ${lang.code}`);
    for (const key of enKeys) {
      assert.ok(
        typeof dict[key] === 'string' && dict[key].trim().length > 0,
        `Empty key ${String(key)} for ${lang.code}`
      );
    }
  }

  assert.equal(getLanguageDir('ar'), 'rtl');
  assert.equal(getLanguageDir('fa'), 'rtl');
  assert.equal(getLanguageDir('en'), 'ltr');

  for (const swatch of EASY_COLOR_PALETTE) {
    assert.ok(normalizeHex(swatch.hex) !== null);
    assert.ok(normalizeHex(swatch.secondaryHex) !== null);
    assert.ok(swatch.labels.fa.trim().length > 0);
  }

  for (const p of WATCH_PRESETS) {
    const cat = classifyEasyPreset(p);
    assert.ok(
      ['round-analog', 'round-digital', 'square-analog', 'square-digital'].includes(
        cat
      )
    );
    if (p.resolution.shape === 'round') {
      assert.ok(cat.startsWith('round-'));
    } else {
      assert.ok(cat.startsWith('square-'));
    }
  }
});

test('quantizePaletteFromRgba extracts 5 distinct valid hex swatches from multi-hue RGBA buffer', async () => {
  const { quantizePaletteFromRgba } = await import('../utils/paletteExtractor');
  const { normalizeHex } = await import('../utils/colorUtils');
  const width = 40;
  const height = 40;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const bands: Array<[number, number, number]> = [
    [220, 48, 72],
    [32, 168, 240],
    [245, 196, 64],
    [36, 185, 118],
    [30, 34, 48],
  ];
  for (let y = 0; y < height; y++) {
    const band = bands[Math.floor((y / height) * bands.length)];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rgba[idx] = band[0];
      rgba[idx + 1] = band[1];
      rgba[idx + 2] = band[2];
      rgba[idx + 3] = 255;
    }
  }
  const palette = quantizePaletteFromRgba(rgba, 5);
  assert.equal(palette.length, 5);
  const unique = new Set(palette);
  assert.equal(unique.size, 5);
  for (const hex of palette) {
    assert.ok(normalizeHex(hex) !== null, `Invalid hex swatch: ${hex}`);
  }
});

test('getSystemClockState formats 12h/24h, AM/PM, weekday/date, and timezone from Date', async () => {
  const { getSystemClockState } = await import('../utils/systemClock');
  const sampleDate = new Date(2026, 10, 14, 15, 7, 9, 500);

  const state12 = getSystemClockState(sampleDate, {
    is24HourOverride: false,
    timezoneOverride: 'America/Los_Angeles',
  });
  assert.equal(state12.displayHourStr, '03');
  assert.equal(state12.minuteStr, '07');
  assert.equal(state12.secondStr, '09');
  assert.equal(state12.ampm, 'PM');
  assert.equal(state12.weekdayShort, 'SAT');
  assert.equal(state12.dateMMDD, '11/14');
  assert.equal(state12.timezone, 'America/Los_Angeles');

  const state24 = getSystemClockState(sampleDate, {
    is24HourOverride: true,
    timezoneOverride: 'UTC',
  });
  assert.equal(state24.displayHourStr, '15');
  assert.equal(state24.ampm, null);
  assert.equal(state24.formattedHMS, '15:07:09');
});

test('applyDisplayMode switches Analog, Hybrid, and Pure Digital cleanly and preserves customImage across Round/Square', async () => {
  const {
    WATCH_PRESETS,
    RESOLUTION_SPECS,
    applyDisplayMode,
    getDisplayMode,
    adaptWatchFaceToResolution,
    createDefaultCustomImageConfig,
  } = await import('../presets/watchPresets');

  const base = {
    ...WATCH_PRESETS[0],
    dial: {
      ...WATCH_PRESETS[0].dial,
      customImage: {
        ...createDefaultCustomImageConfig(),
        enabled: true,
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        fileName: 'portrait.png',
        zoom: 1.45,
        panX: 0.15,
        panY: -0.1,
        extractedPalette: ['#ff5c1b', '#38bdf8', '#f8fafc', '#1e293b', '#f4af9d'],
      },
    },
  };

  const digital = applyDisplayMode(base, 'digital');
  assert.equal(getDisplayMode(digital), 'digital');
  assert.equal(digital.hands.enabled, false);
  assert.equal(digital.layers.find((l) => l.id === 'hands')?.visible, false);
  assert.ok(digital.digital.widgets.some((w) => w.type === 'timeDigital' && w.enabled));
  assert.equal(digital.digital.backdropPill?.enabled, true);

  const square = adaptWatchFaceToResolution(digital, RESOLUTION_SPECS[1]);
  assert.equal(square.resolution.shape, 'squircle');
  assert.equal(square.dial.customImage?.zoom, 1.45);
  assert.equal(square.dial.customImage?.fileName, 'portrait.png');
  assert.equal(getDisplayMode(square), 'digital');

  const hybrid = applyDisplayMode(square, 'hybrid');
  assert.equal(getDisplayMode(hybrid), 'hybrid');
  assert.equal(hybrid.hands.enabled, true);
  assert.ok(hybrid.digital.widgets.some((w) => w.type === 'timeDigital' && w.enabled));

  const analog = applyDisplayMode(hybrid, 'analog');
  assert.equal(getDisplayMode(analog), 'analog');
  assert.equal(analog.hands.enabled, true);
  assert.equal(
    analog.digital.widgets.some((w) => w.type === 'timeDigital' && w.enabled),
    false
  );
});

test('buildFitCloudClockBindingDescriptor enforces BLE/RTC dynamic binding and never bakes clock graphics', async () => {
  const { buildFitCloudClockBindingDescriptor, FITCLOUD_DYNAMIC_CLOCK_TAGS } =
    await import('./fitcloudCompiler');
  const { WATCH_PRESETS, applyDisplayMode } = await import('../presets/watchPresets');

  const hybrid = applyDisplayMode(WATCH_PRESETS[0], 'hybrid');
  const hybridDesc = buildFitCloudClockBindingDescriptor(hybrid);
  assert.equal(hybridDesc.clockSync, 'ble_phone_rtc');
  assert.equal(hybridDesc.bakedHandsInBackground, false);
  assert.equal(hybridDesc.bakedTimeInBackground, false);
  assert.equal(hybridDesc.analogBindings?.hourTag, FITCLOUD_DYNAMIC_CLOCK_TAGS.hour);
  assert.equal(hybridDesc.analogBindings?.minuteTag, FITCLOUD_DYNAMIC_CLOCK_TAGS.minute);
  assert.equal(hybridDesc.analogBindings?.secondTag, FITCLOUD_DYNAMIC_CLOCK_TAGS.second);
  assert.ok(
    hybridDesc.digitalBindings.some(
      (b) => b.rtcTag === FITCLOUD_DYNAMIC_CLOCK_TAGS.digitalTime
    )
  );

  const pureDigital = applyDisplayMode(WATCH_PRESETS[0], 'digital');
  const digitalDesc = buildFitCloudClockBindingDescriptor(pureDigital);
  assert.equal(digitalDesc.analogBindings, null);
  assert.equal(digitalDesc.displayMode, 'digital');
});

test('extractWatchUiAccentColorsFromRgba isolates pink/red markers off pitch-black dials and applyAutoPickedWatchUiColors updates hands & dial', async () => {
  const { extractWatchUiAccentColorsFromRgba } = await import('../utils/paletteExtractor');
  const { WATCH_PRESETS, applyAutoPickedWatchUiColors } = await import('../presets/watchPresets');
  const { hexToHsl } = await import('../utils/colorUtils');

  const w = 48;
  const h = 48;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // 92% dark black dial background, ~8% vivid pink hour indicator ring pixels
      const isMarker = (x === 8 || x === 39) && y >= 10 && y <= 38;
      if (isMarker) {
        rgba[idx] = 244;
        rgba[idx + 1] = 114;
        rgba[idx + 2] = 182;
        rgba[idx + 3] = 255;
      } else {
        rgba[idx] = 10;
        rgba[idx + 1] = 12;
        rgba[idx + 2] = 16;
        rgba[idx + 3] = 255;
      }
    }
  }

  const colors = extractWatchUiAccentColorsFromRgba(rgba);
  const accentHsl = hexToHsl(colors.accentColor);
  assert.ok(accentHsl.l > 35, `Expected bright accent from markers, got ${colors.accentColor}`);
  assert.ok(accentHsl.s > 40, `Expected vivid pink accent, got ${colors.accentColor}`);

  const updated = applyAutoPickedWatchUiColors(WATCH_PRESETS[0], colors, 'hands');
  assert.equal(updated.hands.secondHandColor, colors.accentColor);
  assert.equal(updated.hands.hourMinuteMetalColor, colors.metalToneColor);
  assert.equal(updated.hands.lumeColor, colors.secondaryColor);
});
