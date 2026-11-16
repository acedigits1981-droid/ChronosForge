export type WatchShape = 'round' | 'squircle';

export interface ResolutionSpec {
  id: string;
  label: string;
  width: number;
  height: number;
  shape: WatchShape;
  cornerRadius: number;
  isFullHdMaster?: boolean;
}

export type LayerId =
  | 'bezel'
  | 'dial'
  | 'complications'
  | 'digital'
  | 'hands'
  | 'glassCap';

export interface LayerState {
  id: LayerId;
  name: string;
  visible: boolean;
}

export type DialMaterial =
  | 'sunburst'
  | 'forgedCarbon'
  | 'matteCeramic'
  | 'pitchOled'
  | 'motherOfPearl'
  | 'iridescentRoseNacre'
  | 'iridescentTahitianPearl'
  | 'roseGoldGuilloche'
  | 'celestialAventurine'
  | 'silkBlushEnamel';

export type BezelStyle =
  | 'tachymeter'
  | 'compass'
  | 'minuteTrack'
  | 'minimal'
  | 'diamondPave'
  | 'doubleRowDiamondPave'
  | 'flutedRoseGold';

export type HandStyle =
  | 'skeleton'
  | 'sword'
  | 'dauphine'
  | 'wayfinder'
  | 'feuilleLeaf';

export type MetallicFinish =
  | 'brushedTitanium'
  | 'polishedSteel'
  | 'obsidianBlack'
  | 'champagneGold'
  | 'roseGold18k';

export type SubDialType = 'battery' | 'steps' | 'heartRate' | 'seconds24h';

export interface SubDialConfig {
  id: string;
  enabled: boolean;
  label: string;
  type: SubDialType;
  /** Normalized position relative to center (-0.5 .. 0.5 of min(width, height)) */
  relX: number;
  relY: number;
  /** Normalized radius relative to min(width, height) */
  relRadius: number;
  accentColor: string;
}

export interface ComplicationArcConfig {
  id: string;
  enabled: boolean;
  label: string;
  metric: 'battery' | 'steps' | 'heartRate';
  relX: number;
  relY: number;
  relRadius: number;
  startAngleDeg: number;
  endAngleDeg: number;
  thickness: number;
  color: string;
  trackColor: string;
  frameCount: number;
}

export type DigitalWidgetType =
  | 'timeDigital'
  | 'date'
  | 'day'
  | 'steps'
  | 'bpm'
  | 'battery'
  | 'weather';

export interface DigitalWidgetConfig {
  id: string;
  enabled: boolean;
  type: DigitalWidgetType;
  label: string;
  relX: number;
  relY: number;
  fontSet: 'time' | 'metrics' | 'small';
  scale: number;
  align: 'left' | 'center' | 'right';
  /** 'inline' = HH:MM, 'stacked' = HH over MM (vertical), 'hourOnly' = single hour number (1, 10, 19) */
  layout?: 'inline' | 'stacked' | 'hourOnly';
}

export type PresetCategory =
  | 'round-analog'
  | 'round-digital'
  | 'square-analog'
  | 'square-digital';

export type WatchDisplayMode = 'analog' | 'hybrid' | 'digital';

export interface CustomDialImageConfig {
  enabled: boolean;
  dataUrl: string;
  fileName: string;
  zoom: number; // 0.5 .. 2.5
  panX: number; // -1 .. 1
  panY: number; // -1 .. 1
  rotationDeg: number; // -180 .. 180
  brightness: number; // 0.4 .. 1.8
  contrast: number; // 0.4 .. 1.8
  vignette: number; // 0 .. 1
  tintColor: string;
  tintOpacity: number; // 0 .. 0.85
  extractedPalette: string[];
}

export interface BackdropPillConfig {
  enabled: boolean;
  color: string;
  opacity: number; // 0.1 .. 0.95
}

export interface CustomFontAsset {
  id: string;
  name: string;
  fileName: string;
  format: 'ttf' | 'otf';
  familyName: string;
  dataUrl: string;
  byteSize: number;
}

export interface WatchFaceConfig {
  presetId: string;
  category?: PresetCategory;
  name: string;
  author: string;
  displayMode?: WatchDisplayMode;
  resolution: ResolutionSpec;
  layers: LayerState[];

  bezel: {
    style: BezelStyle;
    primaryColor: string;
    accentColor: string;
    tickColor: string;
    lumePips: boolean;
    numeralStyle?: 'none' | 'roman' | 'cardinal' | 'arabic12';
    caseTintColor?: string;
    markerMetalColor?: string;
    markerLumeColor?: string;
  };

  dial: {
    intactArtworkUrl?: string;
    material: DialMaterial;
    baseColor: string;
    secondaryColor: string;
    lightAngleDeg: number;
    recessedAoDepth: number;
    iridescenceIntensity?: number;
    overlayTintColor?: string;
    overlayTintOpacity?: number;
    customImage?: CustomDialImageConfig;
    motif?:
      | 'none'
      | 'floralRoseGold'
      | 'diamondStardust'
      | 'goldenDice'
      | 'diamondHeartPulse'
      | 'innerDiamondRing'
      | 'pyramidStuds'
      | 'brushedMinimal';
    dateWindow?: {
      enabled: boolean;
      position: '3oclock' | '6oclock';
      shape: 'circle' | 'rect';
    };
    subDials: SubDialConfig[];
  };

  complications: {
    arcs: ComplicationArcConfig[];
  };

  digital: {
    fontStyle: 'metallic' | 'oledGlow' | 'tacticalStencil';
    customFonts?: CustomFontAsset[];
    activeCustomFontId?: string | null;
    primaryColor: string;
    glowColor: string;
    hoursColorMode?: 'solid' | 'gradient';
    hoursColor?: string;
    hoursGradientTop?: string;
    hoursGradientBottom?: string;
    minutesColor?: string;
    secondsColor?: string;
    ampmColor?: string;
    dateColor?: string;
    metricsIconColor?: string;
    metricsValueColor?: string;
    backdropPill?: BackdropPillConfig;
    widgets: DigitalWidgetConfig[];
  };

  hands: {
    enabled: boolean;
    style: HandStyle;
    finish: MetallicFinish;
    hourMinuteMetalColor?: string;
    lumeColor: string;
    secondHandColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowBlur: number;
  };

  glassCap: {
    capFinish: MetallicFinish;
    capRadiusRatio: number;
    sapphireGlare: boolean;
    glareIntensity: number;
  };
}

export interface SimulationState {
  timeSeconds: number;
  realTime: boolean;
  sweep60fps: boolean;
  battery: number;
  steps: number;
  heartRate: number;
  temperature: number;
  hardwareRgb565Preview: boolean;
  fitCloudBlackGuard: boolean;
  fullHdMasterMode: boolean;
}

export interface CroppedSprite {
  id: string;
  category: 'background' | 'hand' | 'cap' | 'arc' | 'glyph';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  centerX: number;
  centerY: number;
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  pngBytes: Uint8Array;
  rgb565Bytes: Uint8Array;
  rgba8888Bytes: Uint8Array;
  dataUrl: string;
}

export interface GlyphSpriteEntry {
  char: string;
  fontSet: 'time' | 'metrics' | 'small';
  sprite: CroppedSprite;
}

export interface MemoryBudgetStats {
  uncompressedRgbaBytes: number;
  rgb565PayloadBytes: number;
  veryfitIwfBytes: number;
  veryfitLzBytes: number;
  fitcloudBinBytes: number;
  spriteCount: number;
  flashBudgetMinKb: number;
  flashBudgetMaxKb: number;
}

export interface CompiledWatchAssets {
  width: number;
  height: number;
  background: CroppedSprite;
  previewBytes: Uint8Array;
  centerCap: CroppedSprite;
  handHour: CroppedSprite;
  handMinute: CroppedSprite;
  handSecond: CroppedSprite;
  arcFrames: Record<string, CroppedSprite[]>;
  glyphs: GlyphSpriteEntry[];
  allSprites: CroppedSprite[];
  budget: MemoryBudgetStats;
}

export interface ParsedTemplateInfo {
  fileName: string;
  format: 'fitcloud-tbui' | 'veryfit-iwf' | 'veryfit-iwf-lz';
  width: number;
  height: number;
  version: string;
  magicSignature: string;
  elementCount: number;
  spriteCount: number;
  compressionType: 'none' | 'zip' | 'lz4' | 'fastlz';
  tbuiOffset?: number;
  modelId?: string;
  rawBytes: Uint8Array;
  iwfJson?: Record<string, unknown>;
  fontJson?: Record<string, unknown>;
  zipEntries?: string[];
  tbuiElements?: Array<{
    index: number;
    typeCode: number;
    typeLabel: string;
    x: number;
    y: number;
    width: number;
    height: number;
    pixelFormat: string;
    dataOffset: number;
    dataLength: number;
  }>;
}

