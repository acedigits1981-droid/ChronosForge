import {
  CustomDialImageConfig,
  HandStyle,
  LayerState,
  MetallicFinish,
  PresetCategory,
  ResolutionSpec,
  WatchDisplayMode,
  WatchFaceConfig,
  WatchShape,
} from '../types/watchface';
import { ExtractedWatchUiColors } from '../utils/paletteExtractor';

export const RESOLUTION_SPECS: ResolutionSpec[] = [
  {
    id: '1080x1080',
    label: '1080×1080 Full HD Master Round (Ultra-Realistic SuperSampled)',
    width: 1080,
    height: 1080,
    shape: 'round',
    cornerRadius: 540,
    isFullHdMaster: true,
  },
  {
    id: '1080x1080-square',
    label: '1080×1080 Full HD Master Square (Ultra-Realistic Squircle)',
    width: 1080,
    height: 1080,
    shape: 'squircle',
    cornerRadius: 216,
    isFullHdMaster: true,
  },
  {
    id: '466x466',
    label: '466×466 Round (Galaxy Ultra / AMOLED)',
    width: 466,
    height: 466,
    shape: 'round',
    cornerRadius: 233,
  },
  {
    id: '454x454',
    label: '454×454 Round (Galaxy Classic)',
    width: 454,
    height: 454,
    shape: 'round',
    cornerRadius: 227,
  },
  {
    id: '360x360',
    label: '360×360 Round (Standard)',
    width: 360,
    height: 360,
    shape: 'round',
    cornerRadius: 180,
  },
  {
    id: '240x240',
    label: '240×240 Round (Compact)',
    width: 240,
    height: 240,
    shape: 'round',
    cornerRadius: 120,
  },
  {
    id: '368x448',
    label: '368×448 Squircle (Apple / Square HD)',
    width: 368,
    height: 448,
    shape: 'squircle',
    cornerRadius: 82,
  },
  {
    id: '320x385',
    label: '320×385 Squircle (Mid OLED)',
    width: 320,
    height: 385,
    shape: 'squircle',
    cornerRadius: 68,
  },
  {
    id: '240x284',
    label: '240×284 Squircle (IDW19 / FitCloud)',
    width: 240,
    height: 284,
    shape: 'squircle',
    cornerRadius: 48,
  },
];

export const HARDWARE_EXPORT_TARGETS: ResolutionSpec[] = RESOLUTION_SPECS.filter(
  (spec) => !spec.isFullHdMaster && spec.width <= 600 && spec.height <= 600
);

/**
 * Clamps any designer resolution (e.g. 1080x1080 studio master) down to true
 * smartwatch hardware dimensions (466x466, 454x454, 360x360, 368x448, 240x284)
 * or the connected device's exact HardwareResolutionLock.
 */
export function clampWatchExportResolution(
  resolution: ResolutionSpec,
  hardwareLock?: {
    lcdWidth: number;
    lcdHeight: number;
    isRound: boolean;
  } | null
): ResolutionSpec {
  if (hardwareLock && hardwareLock.lcdWidth > 0 && hardwareLock.lcdHeight > 0) {
    const width = Math.max(120, Math.round(hardwareLock.lcdWidth));
    const height = Math.max(120, Math.round(hardwareLock.lcdHeight));
    const shape: WatchShape = hardwareLock.isRound ? 'round' : 'squircle';
    return {
      id: `${width}x${height}${hardwareLock.isRound ? '' : '-square'}`,
      label: `Hardware Locked: ${width}×${height} (${hardwareLock.isRound ? 'Round' : 'Squircle'})`,
      width,
      height,
      shape,
      cornerRadius: hardwareLock.isRound
        ? Math.round(Math.min(width, height) / 2)
        : Math.round(Math.min(width, height) * 0.2),
      isFullHdMaster: false,
    };
  }

  if (
    !resolution.isFullHdMaster &&
    resolution.width <= 600 &&
    resolution.height <= 600
  ) {
    return { ...resolution, isFullHdMaster: false };
  }

  const fallbackId = resolution.shape === 'round' ? '466x466' : '368x448';
  const target =
    RESOLUTION_SPECS.find((r) => r.id === fallbackId) ?? RESOLUTION_SPECS[2];
  return { ...target, isFullHdMaster: false };
}

interface IntactFaceSeed {
  slug: string;
  name: string;
  styleGroup: 'analog' | 'digital';
  displayMode: WatchDisplayMode;
  baseColor: string;
  secondaryColor: string;
  accentColor: string;
  bezelColor: string;
  handStyle?: HandStyle;
  handFinish?: MetallicFinish;
  handMetalColor?: string;
  handLumeColor?: string;
  secondHandColor?: string;
}

const INTACT_FACE_SEEDS: IntactFaceSeed[] = [
  {
    slug: 'architectural-tourbillon',
    name: 'Architectural Skeleton Tourbillon',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#d9dde3',
    secondaryColor: '#d4af37',
    accentColor: '#1e3a8a',
    bezelColor: '#9ca3af',
    handStyle: 'dauphine',
    handFinish: 'champagneGold',
    handMetalColor: '#25449c',
    handLumeColor: '#f1f5f9',
    secondHandColor: '#d4af37',
  },
  {
    slug: 'royal-marble-tourbillon',
    name: 'Royal Blue Marble Tourbillon',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#254266',
    secondaryColor: '#d4af37',
    accentColor: '#eab308',
    bezelColor: '#b89446',
    handStyle: 'feuilleLeaf',
    handFinish: 'champagneGold',
    handMetalColor: '#d4af37',
    handLumeColor: '#fef3c7',
    secondHandColor: '#f59e0b',
  },
  {
    slug: 'bronze-roman-baroque',
    name: 'Antique Bronze Roman Baroque',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#4c3824',
    secondaryColor: '#a67c4e',
    accentColor: '#d4a96a',
    bezelColor: '#7a5c3a',
    handStyle: 'feuilleLeaf',
    handFinish: 'champagneGold',
    handMetalColor: '#d4a96a',
    handLumeColor: '#fef3c7',
    secondHandColor: '#e6b87d',
  },
  {
    slug: 'diver-gold-blue',
    name: 'O&O Navy & 18K Gold Diver',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#10294a',
    secondaryColor: '#d4af37',
    accentColor: '#f5cf6b',
    bezelColor: '#173761',
    handStyle: 'sword',
    handFinish: 'champagneGold',
    handMetalColor: '#f5cf6b',
    handLumeColor: '#fef9c3',
    secondHandColor: '#facc15',
  },
  {
    slug: 'stealth-amber-skeleton',
    name: 'Stealth Black & Amber Skeleton',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#17191d',
    secondaryColor: '#f97316',
    accentColor: '#fb923c',
    bezelColor: '#24272d',
    handStyle: 'skeleton',
    handFinish: 'obsidianBlack',
    handMetalColor: '#3b404c',
    handLumeColor: '#fb923c',
    secondHandColor: '#f97316',
  },
  {
    slug: 'oyster-blue-plasma',
    name: 'Oyster Perpetual Blue Plasma',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#08090c',
    secondaryColor: '#0ea5e9',
    accentColor: '#38bdf8',
    bezelColor: '#1c2432',
    handStyle: 'dauphine',
    handFinish: 'polishedSteel',
    handMetalColor: '#e2e8f0',
    handLumeColor: '#38bdf8',
    secondHandColor: '#0ea5e9',
  },
  {
    slug: 'obsidian-infinity-8',
    name: 'Obsidian Glass Infinity 8',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#08080a',
    secondaryColor: '#e2e8f0',
    accentColor: '#ffffff',
    bezelColor: '#181a20',
    handStyle: 'dauphine',
    handFinish: 'polishedSteel',
    handMetalColor: '#f8fafc',
    handLumeColor: '#ffffff',
    secondHandColor: '#cbd5e1',
  },
  {
    slug: 'blush-oled-minimal',
    name: 'Rose-Blush OLED Minimal',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#09090b',
    secondaryColor: '#f4af9d',
    accentColor: '#fbcfe8',
    bezelColor: '#1c191c',
    handStyle: 'feuilleLeaf',
    handFinish: 'roseGold18k',
    handMetalColor: '#f4af9d',
    handLumeColor: '#fbcfe8',
    secondHandColor: '#f472b6',
  },
  {
    slug: 'oo-classic-gold',
    name: 'O&O Matte Black & Gold',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#16181c',
    secondaryColor: '#d4af37',
    accentColor: '#e6c265',
    bezelColor: '#25282e',
    handStyle: 'wayfinder',
    handFinish: 'champagneGold',
    handMetalColor: '#e6c265',
    handLumeColor: '#fef08a',
    secondHandColor: '#d4af37',
  },
  {
    slug: 'oo-classic-silver',
    name: 'O&O Matte Black & Silver',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#181a1f',
    secondaryColor: '#cbd5e1',
    accentColor: '#f8fafc',
    bezelColor: '#292d35',
    handStyle: 'wayfinder',
    handFinish: 'polishedSteel',
    handMetalColor: '#e2e8f0',
    handLumeColor: '#ffffff',
    secondHandColor: '#cbd5e1',
  },
  {
    slug: 'oo-classic-rosegold',
    name: 'O&O Matte Black & Rose Gold',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#18191d',
    secondaryColor: '#e5a495',
    accentColor: '#f4af9d',
    bezelColor: '#282a30',
    handStyle: 'wayfinder',
    handFinish: 'roseGold18k',
    handMetalColor: '#f4af9d',
    handLumeColor: '#ffe4e6',
    secondHandColor: '#e5a495',
  },
  {
    slug: 'oo-neon-blue',
    name: 'O&O Neon Blue Lume',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#11151b',
    secondaryColor: '#22d3ee',
    accentColor: '#38bdf8',
    bezelColor: '#1f2630',
    handStyle: 'wayfinder',
    handFinish: 'brushedTitanium',
    handMetalColor: '#22d3ee',
    handLumeColor: '#67e8f9',
    secondHandColor: '#06b6d4',
  },
  {
    slug: 'oo-neon-red',
    name: 'O&O Neon Red Lume',
    styleGroup: 'analog',
    displayMode: 'analog',
    baseColor: '#141216',
    secondaryColor: '#ef4444',
    accentColor: '#f87171',
    bezelColor: '#262025',
    handStyle: 'wayfinder',
    handFinish: 'obsidianBlack',
    handMetalColor: '#ef4444',
    handLumeColor: '#fca5a5',
    secondHandColor: '#dc2626',
  },
  {
    slug: 'titanium-xbridge-hybrid',
    name: 'Titanium X-Bridge Hybrid HUD',
    styleGroup: 'digital',
    displayMode: 'hybrid',
    baseColor: '#121417',
    secondaryColor: '#c9b17e',
    accentColor: '#f8fafc',
    bezelColor: '#302f2b',
    handStyle: 'skeleton',
    handFinish: 'polishedSteel',
    handMetalColor: '#e2e8f0',
    handLumeColor: '#fef3c7',
    secondHandColor: '#c9b17e',
  },
  {
    slug: 'concentric-blue-date',
    name: 'Concentric Wheel & Date',
    styleGroup: 'digital',
    displayMode: 'digital',
    baseColor: '#090b10',
    secondaryColor: '#3b82f6',
    accentColor: '#38bdf8',
    bezelColor: '#1f2937',
  },
  {
    slug: 'gunmetal-tactical-hud',
    name: 'Gunmetal Tactical Digital HUD',
    styleGroup: 'digital',
    displayMode: 'digital',
    baseColor: '#1a1e24',
    secondaryColor: '#38bdf8',
    accentColor: '#f8fafc',
    bezelColor: '#47505c',
  },
  {
    slug: 'tactical-orange-hud',
    name: 'Stealth Orange Vertical HUD',
    styleGroup: 'digital',
    displayMode: 'digital',
    baseColor: '#14161a',
    secondaryColor: '#f97316',
    accentColor: '#fb923c',
    bezelColor: '#282c33',
  },
];

function buildPresetDigitalConfig(
  seed: IntactFaceSeed
): {
  digitalLayerVisible: boolean;
  fontStyle: 'metallic' | 'oledGlow' | 'tacticalStencil';
  hoursColor: string;
  minutesColor: string;
  secondsColor: string;
  dateColor: string;
  widgets: WatchFaceConfig['digital']['widgets'];
} {
  if (seed.slug === 'obsidian-infinity-8') {
    return {
      digitalLayerVisible: true,
      fontStyle: 'metallic',
      hoursColor: '#f8fafc',
      minutesColor: '#cbd5e1',
      secondsColor: '#94a3b8',
      dateColor: '#e2e8f0',
      widgets: [
        {
          id: 'w-time',
          enabled: true,
          type: 'timeDigital',
          label: 'Live Hour Number',
          relX: 0,
          relY: 0,
          fontSet: 'time',
          scale: 2.55,
          align: 'center',
          layout: 'hourOnly',
        },
      ],
    };
  }

  if (seed.slug === 'titanium-xbridge-hybrid') {
    return {
      digitalLayerVisible: true,
      fontStyle: 'oledGlow',
      hoursColor: '#f8fafc',
      minutesColor: '#f8fafc',
      secondsColor: '#c9b17e',
      dateColor: '#e2e8f0',
      widgets: [
        {
          id: 'w-time',
          enabled: true,
          type: 'timeDigital',
          label: 'Digital Time',
          relX: 0,
          relY: -0.222,
          fontSet: 'time',
          scale: 0.72,
          align: 'center',
          layout: 'inline',
        },
      ],
    };
  }

  if (seed.slug === 'concentric-blue-date') {
    return {
      digitalLayerVisible: true,
      fontStyle: 'oledGlow',
      hoursColor: '#ffffff',
      minutesColor: '#ffffff',
      secondsColor: '#38bdf8',
      dateColor: '#f8fafc',
      widgets: [
        {
          id: 'w-time',
          enabled: true,
          type: 'timeDigital',
          label: 'Digital Time',
          relX: 0,
          relY: -0.292,
          fontSet: 'metrics',
          scale: 0.86,
          align: 'center',
          layout: 'stacked',
        },
        {
          id: 'w-day',
          enabled: true,
          type: 'day',
          label: 'Weekday',
          relX: 0,
          relY: -0.045,
          fontSet: 'small',
          scale: 0.92,
          align: 'center',
        },
        {
          id: 'w-date',
          enabled: true,
          type: 'date',
          label: 'Date',
          relX: 0,
          relY: 0.045,
          fontSet: 'metrics',
          scale: 0.84,
          align: 'center',
        },
      ],
    };
  }

  if (seed.slug === 'gunmetal-tactical-hud') {
    return {
      digitalLayerVisible: true,
      fontStyle: 'tacticalStencil',
      hoursColor: '#dbe2ea',
      minutesColor: '#dbe2ea',
      secondsColor: '#f8fafc',
      dateColor: '#93c5fd',
      widgets: [
        {
          id: 'w-time',
          enabled: true,
          type: 'timeDigital',
          label: 'Digital Time',
          relX: -0.02,
          relY: -0.095,
          fontSet: 'time',
          scale: 1.18,
          align: 'center',
          layout: 'inline',
        },
      ],
    };
  }

  if (seed.slug === 'tactical-orange-hud') {
    return {
      digitalLayerVisible: true,
      fontStyle: 'oledGlow',
      hoursColor: '#f8fafc',
      minutesColor: '#f97316',
      secondsColor: '#f8fafc',
      dateColor: '#f8fafc',
      widgets: [
        {
          id: 'w-time',
          enabled: true,
          type: 'timeDigital',
          label: 'Digital Time',
          relX: -0.035,
          relY: -0.02,
          fontSet: 'time',
          scale: 1.15,
          align: 'center',
          layout: 'stacked',
        },
      ],
    };
  }

  return {
    digitalLayerVisible: false,
    fontStyle: seed.styleGroup === 'digital' ? 'oledGlow' : 'metallic',
    hoursColor: '#f8fafc',
    minutesColor: seed.accentColor,
    secondsColor: seed.secondaryColor,
    dateColor: '#e2e8f0',
    widgets: [],
  };
}

function createIntactPreset(
  seed: IntactFaceSeed,
  shape: WatchShape
): WatchFaceConfig {
  const isRound = shape === 'round';
  const category: PresetCategory = isRound
    ? seed.styleGroup === 'analog'
      ? 'round-analog'
      : 'round-digital'
    : seed.styleGroup === 'analog'
    ? 'square-analog'
    : 'square-digital';
  const prefix = isRound ? 'rd' : 'sq';
  const folder = isRound ? 'round' : 'square';
  const resolution = isRound ? RESOLUTION_SPECS[0] : RESOLUTION_SPECS[1];
  const hasHands = seed.displayMode !== 'digital';
  const digitalPreset = buildPresetDigitalConfig(seed);

  const layers: LayerState[] = [
    { id: 'bezel', name: 'Bezel & Outer Ring', visible: false },
    { id: 'dial', name: 'Dial Plate & Artwork', visible: true },
    { id: 'complications', name: 'Complication Arcs & Gauges', visible: false },
    { id: 'digital', name: 'Digital Readouts & Fonts', visible: digitalPreset.digitalLayerVisible },
    { id: 'hands', name: 'Analog Hands Overlay', visible: hasHands },
    { id: 'glassCap', name: 'Center Cap & Sapphire Glare', visible: true },
  ];

  return {
    presetId: `${prefix}-${seed.slug}`,
    category,
    name: `${seed.name} (${isRound ? 'Round' : 'Square'})`,
    author: 'ChronosForge Studio',
    displayMode: seed.displayMode,
    resolution,
    layers,
    bezel: {
      style: 'minimal',
      primaryColor: seed.bezelColor,
      accentColor: seed.accentColor,
      tickColor: seed.secondaryColor,
      lumePips: false,
      numeralStyle: 'none',
    },
    dial: {
      intactArtworkUrl: `/assets/faces/${folder}/${seed.slug}.png`,
      material: 'pitchOled',
      baseColor: seed.baseColor,
      secondaryColor: seed.secondaryColor,
      lightAngleDeg: 315,
      recessedAoDepth: 0.4,
      overlayTintColor: seed.accentColor,
      overlayTintOpacity: 0,
      motif: 'none',
      subDials: [],
    },
    complications: {
      arcs: [],
    },
    digital: {
      fontStyle: digitalPreset.fontStyle,
      primaryColor: seed.accentColor,
      glowColor: seed.secondaryColor,
      hoursColor: digitalPreset.hoursColor,
      minutesColor: digitalPreset.minutesColor,
      secondsColor: digitalPreset.secondsColor,
      dateColor: digitalPreset.dateColor,
      metricsIconColor: seed.accentColor,
      metricsValueColor: '#f8fafc',
      widgets: digitalPreset.widgets,
    },
    hands: {
      enabled: hasHands,
      style: seed.handStyle ?? 'dauphine',
      finish: seed.handFinish ?? 'polishedSteel',
      hourMinuteMetalColor: seed.handMetalColor ?? seed.secondaryColor,
      lumeColor: seed.handLumeColor ?? '#f8fafc',
      secondHandColor: seed.secondHandColor ?? seed.accentColor,
      shadowOffsetX: 4,
      shadowOffsetY: 6,
      shadowBlur: 7,
    },
    glassCap: {
      capFinish: seed.handFinish ?? 'obsidianBlack',
      capRadiusRatio: 0.036,
      sapphireGlare: false,
      glareIntensity: 0.14,
    },
  };
}

export const ROUND_WATCH_PRESETS: WatchFaceConfig[] = INTACT_FACE_SEEDS.map(
  (seed) => createIntactPreset(seed, 'round')
);

export const SQUARE_WATCH_PRESETS: WatchFaceConfig[] = INTACT_FACE_SEEDS.map(
  (seed) => createIntactPreset(seed, 'squircle')
);

export const WATCH_PRESETS: WatchFaceConfig[] = [
  ...ROUND_WATCH_PRESETS,
  ...SQUARE_WATCH_PRESETS,
];

export function cloneConfig(cfg: WatchFaceConfig): WatchFaceConfig {
  return JSON.parse(JSON.stringify(cfg)) as WatchFaceConfig;
}

/**
 * Finds the matching Round or Square counterpart of the current watch preset
 * when switching watch shape, keeping the exact same style on the target form factor.
 */
export function findCounterpartShapePreset(
  current: WatchFaceConfig,
  targetShape: WatchShape
): WatchFaceConfig | null {
  const targetPrefix = targetShape === 'round' ? 'rd-' : 'sq-';
  const stripped = current.presetId.replace(/^(rd|sq)-/, '');
  const match = WATCH_PRESETS.find(
    (p) => p.presetId === `${targetPrefix}${stripped}`
  );
  if (match) return match;
  return (
    WATCH_PRESETS.find((p) => p.resolution.shape === targetShape) ?? null
  );
}

/**
 * Adapts a watch configuration cleanly to a target resolution while preserving
 * user customization (custom photos, tints, colors, widgets, and hardware modes).
 */
export function adaptWatchFaceToResolution(
  source: WatchFaceConfig,
  targetResolution: ResolutionSpec
): WatchFaceConfig {
  const next = cloneConfig(source);
  const prevShape = source.resolution.shape;
  next.resolution = { ...targetResolution };

  if (prevShape === targetResolution.shape) {
    return next;
  }

  // If user is on an intact artwork preset without a custom uploaded photo,
  // also switch to the matching intact Round/Square artwork asset if available.
  if (source.dial.intactArtworkUrl && !source.dial.customImage?.enabled) {
    const counterpart = findCounterpartShapePreset(
      source,
      targetResolution.shape
    );
    if (counterpart) {
      next.presetId = counterpart.presetId;
      next.category = counterpart.category;
      next.name = counterpart.name;
      next.dial.intactArtworkUrl = counterpart.dial.intactArtworkUrl;
    }
  }

  if (targetResolution.shape === 'squircle') {
    next.dial.subDials = next.dial.subDials.map((sub) => ({
      ...sub,
      relX: Number((sub.relX * 0.96).toFixed(3)),
      relY: Number(Math.max(-0.42, Math.min(0.42, sub.relY * 1.1)).toFixed(3)),
      relRadius: Number(Math.min(sub.relRadius, 0.13).toFixed(3)),
    }));
    next.complications.arcs = next.complications.arcs.map((arc) => ({
      ...arc,
      relRadius: Number(Math.min(arc.relRadius, 0.345).toFixed(3)),
      relY: Number(Math.max(-0.38, Math.min(0.38, arc.relY * 1.06)).toFixed(3)),
    }));
    next.digital.widgets = next.digital.widgets.map((w) => ({
      ...w,
      relX: Number((w.relX * 0.96).toFixed(3)),
      relY: Number(Math.max(-0.44, Math.min(0.44, w.relY * 1.08)).toFixed(3)),
    }));
  } else {
    next.dial.subDials = next.dial.subDials.map((sub) => {
      let rx = sub.relX;
      let ry = Math.abs(sub.relY) > 0.25 ? sub.relY * 0.88 : sub.relY;
      const dist = Math.hypot(rx, ry);
      const maxCenter = Math.max(0.1, 0.365 - sub.relRadius);
      if (dist > maxCenter && dist > 1e-5) {
        const s = maxCenter / dist;
        rx *= s;
        ry *= s;
      }
      return {
        ...sub,
        relX: Number(rx.toFixed(3)),
        relY: Number(ry.toFixed(3)),
      };
    });
    next.complications.arcs = next.complications.arcs.map((arc) => ({
      ...arc,
      relY: Number(
        (Math.abs(arc.relY) > 0.26 ? arc.relY * 0.84 : arc.relY).toFixed(3)
      ),
      relRadius: Number(Math.min(arc.relRadius, 0.39).toFixed(3)),
    }));
    next.digital.widgets = next.digital.widgets.map((w) => ({
      ...w,
      relY: Number(
        (Math.abs(w.relY) > 0.28 ? w.relY * 0.86 : w.relY).toFixed(3)
      ),
    }));
  }

  return next;
}

export function createDefaultCustomImageConfig(): CustomDialImageConfig {
  return {
    enabled: false,
    dataUrl: '',
    fileName: '',
    zoom: 1.0,
    panX: 0,
    panY: 0,
    rotationDeg: 0,
    brightness: 1.0,
    contrast: 1.0,
    vignette: 0.35,
    tintColor: '#090b0f',
    tintOpacity: 0,
    extractedPalette: [],
  };
}

export function getDisplayMode(config: WatchFaceConfig): WatchDisplayMode {
  if (config.displayMode) return config.displayMode;
  if (!config.hands.enabled) return 'digital';
  const hasDigitalTime = config.digital.widgets.some(
    (w) => w.type === 'timeDigital' && w.enabled
  );
  return hasDigitalTime ? 'hybrid' : 'analog';
}

export function applyDisplayMode(
  source: WatchFaceConfig,
  mode: WatchDisplayMode
): WatchFaceConfig {
  const next = cloneConfig(source);
  next.displayMode = mode;

  const digitalLayerVisible = mode !== 'analog';
  const handsVisible = mode !== 'digital';

  next.layers = next.layers.map((l) => {
    if (l.id === 'hands') return { ...l, visible: handsVisible };
    if (l.id === 'digital') return { ...l, visible: true };
    if (l.id === 'complications') return { ...l, visible: true };
    return l;
  });

  if (mode === 'analog') {
    next.hands.enabled = true;
    next.digital.widgets = next.digital.widgets.map((w) =>
      w.type === 'timeDigital' ? { ...w, enabled: false } : w
    );
  } else if (mode === 'hybrid') {
    next.hands.enabled = true;
    const hasTime = next.digital.widgets.some((w) => w.type === 'timeDigital');
    if (hasTime) {
      next.digital.widgets = next.digital.widgets.map((w) =>
        w.type === 'timeDigital'
          ? {
              ...w,
              enabled: true,
              relX: 0,
              relY: Math.abs(w.relY) < 0.12 ? -0.19 : w.relY,
              fontSet: 'metrics',
              scale: Math.min(w.scale, 0.9),
            }
          : w
      );
    } else {
      next.digital.widgets = [
        {
          id: 'w-time',
          enabled: true,
          type: 'timeDigital',
          label: 'Digital Time',
          relX: 0,
          relY: -0.19,
          fontSet: 'metrics',
          scale: 0.85,
          align: 'center',
        },
        ...next.digital.widgets,
      ];
    }
  } else {
    // Pure Digital (Modular Ultra layout)
    next.hands.enabled = false;
    const isSquircle = next.resolution.shape === 'squircle';
    next.digital.widgets = [
      {
        id: 'w-day',
        enabled: true,
        type: 'day',
        label: 'Weekday',
        relX: -0.12,
        relY: isSquircle ? -0.33 : -0.29,
        fontSet: 'small',
        scale: 0.9,
        align: 'center',
      },
      {
        id: 'w-date',
        enabled: true,
        type: 'date',
        label: 'Date',
        relX: 0.11,
        relY: isSquircle ? -0.33 : -0.29,
        fontSet: 'small',
        scale: 0.9,
        align: 'center',
      },
      {
        id: 'w-time',
        enabled: true,
        type: 'timeDigital',
        label: 'Hero Time',
        relX: 0,
        relY: -0.04,
        fontSet: 'time',
        scale: isSquircle ? 1.12 : 1.04,
        align: 'center',
      },
      {
        id: 'w-weather',
        enabled: true,
        type: 'weather',
        label: 'Weather',
        relX: -0.21,
        relY: isSquircle ? 0.25 : 0.22,
        fontSet: 'small',
        scale: 0.78,
        align: 'center',
      },
      {
        id: 'w-bpm',
        enabled: true,
        type: 'bpm',
        label: 'BPM',
        relX: 0,
        relY: isSquircle ? 0.25 : 0.22,
        fontSet: 'small',
        scale: 0.78,
        align: 'center',
      },
      {
        id: 'w-steps',
        enabled: true,
        type: 'steps',
        label: 'Steps',
        relX: 0.22,
        relY: isSquircle ? 0.25 : 0.22,
        fontSet: 'small',
        scale: 0.78,
        align: 'center',
      },
      {
        id: 'w-bat',
        enabled: true,
        type: 'battery',
        label: 'Battery %',
        relX: 0,
        relY: isSquircle ? 0.36 : 0.32,
        fontSet: 'small',
        scale: 0.76,
        align: 'center',
      },
    ];

    if (
      (next.dial.customImage?.enabled || next.dial.intactArtworkUrl) &&
      !next.digital.backdropPill
    ) {
      next.digital.backdropPill = {
        enabled: true,
        color: '#090b0f',
        opacity: 0.56,
      };
    }

    if (next.digital.backdropPill?.enabled) {
      const hex = (next.digital.primaryColor || '#ffffff').replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.45) {
        next.digital.hoursColor = next.digital.hoursColor ?? '#f8fafc';
        next.digital.hoursGradientTop =
          next.digital.hoursGradientTop ?? '#f8fafc';
        next.digital.minutesColor = next.digital.minutesColor ?? '#f1f5f9';
        next.digital.dateColor = next.digital.dateColor ?? '#e2e8f0';
        next.digital.metricsValueColor =
          next.digital.metricsValueColor ?? '#f8fafc';
      }
    }
  }

  if (!digitalLayerVisible) {
    const anyOtherEnabled = next.digital.widgets.some((w) => w.enabled);
    next.layers = next.layers.map((l) =>
      l.id === 'digital' ? { ...l, visible: anyOtherEnabled } : l
    );
  }

  return next;
}

/**
 * Applies automatically extracted watch UI accent/border/indicator colors
 * onto the watch hands, dial tint/accents, digital numerals, or bezel frame.
 */
export function applyAutoPickedWatchUiColors(
  source: WatchFaceConfig,
  colors: ExtractedWatchUiColors,
  scope: 'all' | 'hands' | 'dial' | 'bezel' = 'all'
): WatchFaceConfig {
  const next = cloneConfig(source);

  if (scope === 'hands' || scope === 'all') {
    next.hands = {
      ...next.hands,
      hourMinuteMetalColor: colors.metalToneColor,
      lumeColor: colors.secondaryColor,
      secondHandColor: colors.accentColor,
    };
    next.digital = {
      ...next.digital,
      primaryColor: colors.accentColor,
      glowColor: colors.secondaryColor,
      hoursColor: '#f8fafc',
      hoursGradientTop: '#f8fafc',
      hoursGradientBottom: colors.accentColor,
      minutesColor: colors.accentColor,
      secondsColor: colors.secondaryColor,
      metricsIconColor: colors.accentColor,
    };
  }

  if (scope === 'dial' || scope === 'all') {
    const usesArtwork = Boolean(
      next.dial.intactArtworkUrl || next.dial.customImage?.enabled
    );
    next.dial = {
      ...next.dial,
      baseColor: usesArtwork ? colors.accentColor : colors.dialBaseColor,
      secondaryColor: colors.secondaryColor,
      overlayTintColor: colors.accentColor,
      ...(scope === 'dial' && usesArtwork ? { overlayTintOpacity: 0.24 } : {}),
    };
    next.dial.subDials = next.dial.subDials.map((sub) => ({
      ...sub,
      accentColor: colors.accentColor,
    }));
  }

  if (scope === 'bezel' || scope === 'all') {
    next.bezel = {
      ...next.bezel,
      accentColor: colors.accentColor,
      tickColor: colors.secondaryColor,
      caseTintColor: colors.accentColor,
      markerMetalColor: colors.metalToneColor,
      markerLumeColor: colors.secondaryColor,
    };
  }

  return next;
}

