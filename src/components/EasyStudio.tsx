import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  Check,
  Clock,
  Download,
  Eye,
  Gem,
  Globe,
  Lock,
  Moon,
  Palette,
  Pipette,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Watch,
} from 'lucide-react';
import { drawDialMotifLayer } from '../engine/dialMotifs';
import {
  drawBezelAndOuterRing,
  drawDialPlate,
  isUsingIntactArtwork,
} from '../engine/materials';
import {
  renderLiveWatchFrame,
  renderSupersampledWatchFrame,
  scaleConfigToMaxDim,
  SUPERSAMPLE_TARGET_DIM,
} from '../engine/renderer';
import {
  classifyEasyPreset,
  EASY_COLOR_PALETTE,
  EasyPresetFilter,
  getLanguageDir,
  getTranslations,
  LanguageCode,
  simplifyPresetDisplayName,
  SUPPORTED_LANGUAGES,
} from '../i18n/translations';
import {
  adaptWatchFaceToResolution,
  applyAutoPickedWatchUiColors,
  applyDisplayMode,
  getDisplayMode,
  RESOLUTION_SPECS,
  WATCH_PRESETS,
} from '../presets/watchPresets';
import {
  HandStyle,
  ResolutionSpec,
  SimulationState,
  WatchDisplayMode,
  WatchFaceConfig,
} from '../types/watchface';
import { hexToHsl, hslToHex } from '../utils/colorUtils';
import { ensureConfigFontsRegistered } from '../utils/customFontManager';
import {
  autoPickWatchUiColorsFromImageUrl,
  ExtractedWatchUiColors,
  getCachedCustomImageSync,
  loadCustomImageAndPalette,
} from '../utils/paletteExtractor';
import { getSystemClockState } from '../utils/systemClock';
import {
  clientDeltaToWatchRelDelta,
  DigitalClockLayout,
  getPrimaryTimeWidget,
  updatePrimaryTimeWidget,
} from '../utils/digitalPlacement';
import {
  CustomImageUploadControls,
  processUploadedDialImageFile,
} from './CustomImageUploadControls';
import { HslColorPicker } from './HslColorPicker';

import {
  formatHardwareLockBadgeText,
  HardwareResolutionLock,
} from '../types/nativeBridge';

export type EasyStepId = 1 | 2 | 3 | 4 | 5;
type ColorZone = 'face' | 'border' | 'hands';

interface EasyStudioProps {
  config: WatchFaceConfig;
  sim: SimulationState;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  onSwitchToPro: () => void;
  onChangeConfig: (next: WatchFaceConfig) => void;
  onChangeSim: (next: SimulationState) => void;
  onSelectPreset: (preset: WatchFaceConfig) => void;
  onSelectResolution: (res: ResolutionSpec) => void;
  onOpenLadiesCollection: () => void;
  onOpenWebBle: () => void;
  onExportFitCloud: () => void;
  onExportVeryFit: (compressedLz: boolean) => void;
  isExporting: boolean;
  lastExportBanner: string | null;
  onDismissBanner: () => void;
  pauseRender?: boolean;
  hardwareLock?: HardwareResolutionLock | null;
}

const THUMB_DATA_URL_CACHE = new Map<string, string>();

const THUMB_SIM_STATE: SimulationState = {
  timeSeconds: 10 * 3600 + 9 * 60 + 30,
  realTime: false,
  sweep60fps: false,
  battery: 92,
  steps: 8420,
  heartRate: 72,
  temperature: 22,
  hardwareRgb565Preview: false,
  fitCloudBlackGuard: true,
  fullHdMasterMode: false,
};

function renderPresetThumbDataUrl(
  preset: WatchFaceConfig,
  shape: 'round' | 'squircle'
): string {
  const key = `${preset.presetId}:${shape}`;
  const cached = THUMB_DATA_URL_CACHE.get(key);
  if (cached) return cached;

  const targetSpec: ResolutionSpec =
    shape === 'round'
      ? {
          id: 'thumb-round',
          label: 'Thumb',
          width: 84,
          height: 84,
          shape: 'round',
          cornerRadius: 42,
        }
      : {
          id: 'thumb-squircle',
          label: 'Thumb',
          width: 78,
          height: 94,
          shape: 'squircle',
          cornerRadius: 18,
        };

  const adapted = adaptWatchFaceToResolution(preset, targetSpec);
  const canvas = document.createElement('canvas');
  canvas.width = targetSpec.width;
  canvas.height = targetSpec.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    renderLiveWatchFrame(ctx, adapted, THUMB_SIM_STATE);
  }
  const url = canvas.toDataURL('image/png');
  THUMB_DATA_URL_CACHE.set(key, url);
  return url;
}

const PresetThumbnail: React.FC<{
  preset: WatchFaceConfig;
  alt: string;
  staggerIndex?: number;
}> = ({ preset, alt, staggerIndex = 0 }) => {
  const thumbShape = preset.resolution.shape;
  const intactUrl = preset.dial.intactArtworkUrl;

  const [src, setSrc] = useState<string>(
    () =>
      intactUrl ??
      THUMB_DATA_URL_CACHE.get(`${preset.presetId}:${thumbShape}`) ??
      ''
  );

  useEffect(() => {
    if (intactUrl) {
      setSrc(intactUrl);
      return;
    }
    const key = `${preset.presetId}:${thumbShape}`;
    const existing = THUMB_DATA_URL_CACHE.get(key);
    if (existing) {
      setSrc(existing);
      return;
    }
    const delayMs = 20 + staggerIndex * 28;
    const timer = window.setTimeout(() => {
      setSrc(renderPresetThumbDataUrl(preset, thumbShape));
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [preset, thumbShape, intactUrl, staggerIndex]);

  if (!src) {
    return (
      <div
        className={`w-20 h-20 flex items-center justify-center border border-slate-700/80 ${
          thumbShape === 'round' ? 'rounded-full' : 'rounded-2xl'
        }`}
        style={{
          background: `radial-gradient(circle at 35% 30%, ${preset.dial.secondaryColor}, ${preset.dial.baseColor})`,
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`block w-24 h-24 object-contain select-none ${
        thumbShape === 'round' ? 'rounded-full' : 'rounded-2xl'
      }`}
    />
  );
};

function HandShapeGraphic({ style }: { style: HandStyle }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="w-9 h-9"
      aria-hidden="true"
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      {style === 'feuilleLeaf' && (
        <>
          <path d="M24 24 Q20 16 24 8 Q28 16 24 24 Z" fill="currentColor" />
          <path d="M24 24 Q31 21 37 25 Q31 28 24 24 Z" fill="currentColor" opacity="0.85" />
        </>
      )}
      {style === 'dauphine' && (
        <>
          <polygon points="24,7 27.5,24 24,26 20.5,24" fill="currentColor" />
          <polygon points="38,24 24,27 22,24 24,21" fill="currentColor" opacity="0.85" />
        </>
      )}
      {style === 'wayfinder' && (
        <>
          <rect x="22" y="7" width="4" height="17" rx="2" fill="currentColor" />
          <rect x="24" y="22.5" width="14" height="3.2" rx="1.6" fill="currentColor" opacity="0.85" />
        </>
      )}
      {(style === 'skeleton' || style === 'sword') && (
        <>
          <polygon points="24,6 28,22 24,26 20,22" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <line x1="24" y1="24" x2="38" y2="24" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        </>
      )}
      <circle cx="24" cy="24" r="2.8" fill="#f97316" />
    </svg>
  );
}

export const EasyStudio: React.FC<EasyStudioProps> = ({
  config,
  sim,
  language,
  onChangeLanguage,
  onSwitchToPro,
  onChangeConfig,
  onChangeSim,
  onSelectPreset,
  onSelectResolution,
  onOpenLadiesCollection,
  onOpenWebBle,
  onExportFitCloud,
  onExportVeryFit,
  isExporting,
  lastExportBanner,
  onDismissBanner,
  pauseRender = false,
  hardwareLock = null,
}) => {
  const t = getTranslations(language);
  const dir = getLanguageDir(language);

  const [step, setStep] = useState<EasyStepId>(2);
  const [presetFilter, setPresetFilter] = useState<EasyPresetFilter>(() =>
    config.resolution.shape === 'squircle' ? 'square-all' : 'round-all'
  );
  const [colorZone, setColorZone] = useState<ColorZone>('face');
  const [showCustomHsl, setShowCustomHsl] = useState(false);
  const [activePhotoColorId, setActivePhotoColorId] = useState<string | null>(null);

  // Watch Canvas Refs & Caches (2048px internal supersampling + pooled scratch buffer)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cachedDialPlateRef = useRef<HTMLCanvasElement | null>(null);
  const cachedStaticDialRef = useRef<HTMLCanvasElement | null>(null);
  const liveHighResCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glyphCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const simRef = useRef<SimulationState>(sim);
  simRef.current = sim;
  const configRef = useRef<WatchFaceConfig>(config);
  configRef.current = config;
  const [dialPlateRevision, setDialPlateRevision] = useState(0);
  const [imageLoadRev, setImageLoadRev] = useState(0);
  const [fontLoadRev, setFontLoadRev] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDraggingClock, setIsDraggingClock] = useState(false);
  const dragClockRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origRelX: number;
    origRelY: number;
  } | null>(null);
  const [autoPickedHex, setAutoPickedHex] = useState<string | null>(null);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [clockSnapshot, setClockSnapshot] = useState(() =>
    getSystemClockState(new Date())
  );

  useEffect(() => {
    setClockSnapshot(getSystemClockState(new Date()));
    if (pauseRender) return;
    const interval = window.setInterval(() => {
      setClockSnapshot(getSystemClockState(new Date()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [pauseRender]);

  useEffect(() => {
    const customImg = config.dial.customImage;
    if (customImg?.enabled && customImg.dataUrl && !getCachedCustomImageSync(customImg.dataUrl)) {
      loadCustomImageAndPalette(customImg.dataUrl)
        .then(() => setImageLoadRev((r) => r + 1))
        .catch(() => {});
    }
    const intactUrl = config.dial.intactArtworkUrl;
    if (intactUrl && !getCachedCustomImageSync(intactUrl)) {
      loadCustomImageAndPalette(intactUrl)
        .then(() => setImageLoadRev((r) => r + 1))
        .catch(() => {});
    }
  }, [
    config.dial.customImage?.enabled,
    config.dial.customImage?.dataUrl,
    config.dial.intactArtworkUrl,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!config.digital.customFonts?.length) return;
    ensureConfigFontsRegistered(config)
      .then((didLoad) => {
        if (!cancelled && didLoad) {
          glyphCacheRef.current.clear();
          setFontLoadRev((r) => r + 1);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config.digital.customFonts, config.digital.activeCustomFontId]);

  const dialVisible = config.layers.find((l) => l.id === 'dial')?.visible ?? true;
  const bezelVisible = config.layers.find((l) => l.id === 'bezel')?.visible ?? true;

  const previewConfig = useMemo<WatchFaceConfig>(() => {
    const maxDim = Math.max(config.resolution.width, config.resolution.height);
    if (maxDim <= 540) return config;
    const scale = 540 / maxDim;
    return {
      ...config,
      resolution: {
        ...config.resolution,
        width: Math.round(config.resolution.width * scale),
        height: Math.round(config.resolution.height * scale),
        cornerRadius: Math.round(config.resolution.cornerRadius * scale),
      },
    };
  }, [config]);
  const previewConfigRef = useRef<WatchFaceConfig>(previewConfig);
  previewConfigRef.current = previewConfig;

  const highResConfig = useMemo<WatchFaceConfig>(
    () => scaleConfigToMaxDim(previewConfig, SUPERSAMPLE_TARGET_DIM),
    [previewConfig]
  );
  const highResConfigRef = useRef<WatchFaceConfig>(highResConfig);
  highResConfigRef.current = highResConfig;

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const hCfg = highResConfigRef.current;
      const { width: hw, height: hh } = hCfg.resolution;
      const plateCanvas =
        cachedDialPlateRef.current ?? document.createElement('canvas');
      if (plateCanvas.width !== hw) plateCanvas.width = hw;
      if (plateCanvas.height !== hh) plateCanvas.height = hh;
      const pctx = plateCanvas.getContext('2d', { willReadFrequently: true })!;
      pctx.clearRect(0, 0, hw, hh);
      if (dialVisible) {
        drawDialPlate(pctx, hCfg);
      } else {
        pctx.fillStyle = '#090b0f';
        pctx.fillRect(0, 0, hw, hh);
      }
      cachedDialPlateRef.current = plateCanvas;
      setDialPlateRevision((r) => r + 1);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [
    highResConfig.resolution,
    highResConfig.dial.intactArtworkUrl,
    highResConfig.dial.material,
    highResConfig.dial.baseColor,
    highResConfig.dial.secondaryColor,
    highResConfig.dial.lightAngleDeg,
    highResConfig.dial.iridescenceIntensity,
    highResConfig.dial.overlayTintColor,
    highResConfig.dial.overlayTintOpacity,
    highResConfig.dial.customImage,
    dialVisible,
    imageLoadRev,
  ]);

  useEffect(() => {
    if (!cachedDialPlateRef.current) return;
    const hCfg = highResConfigRef.current;
    const { width: hw, height: hh } = hCfg.resolution;
    const compositeCanvas =
      cachedStaticDialRef.current ?? document.createElement('canvas');
    if (compositeCanvas.width !== hw) compositeCanvas.width = hw;
    if (compositeCanvas.height !== hh) compositeCanvas.height = hh;
    const cctx = compositeCanvas.getContext('2d', { willReadFrequently: true })!;
    cctx.clearRect(0, 0, hw, hh);

    if (
      cachedDialPlateRef.current.width === hw &&
      cachedDialPlateRef.current.height === hh
    ) {
      cctx.drawImage(cachedDialPlateRef.current, 0, 0);
    }

    const intactMode = isUsingIntactArtwork(hCfg);
    if (bezelVisible && !intactMode) {
      drawBezelAndOuterRing(cctx, hCfg);
    }
    if (dialVisible && !intactMode) {
      drawDialMotifLayer(cctx, hCfg);
    }
    cachedStaticDialRef.current = compositeCanvas;

    // Immediate synchronous draw so initial/paused frames never wait on RAF
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        if (!liveHighResCanvasRef.current) {
          liveHighResCanvasRef.current = document.createElement('canvas');
        }
        const sysClock = getSystemClockState(new Date());
        renderSupersampledWatchFrame(
          ctx,
          previewConfigRef.current,
          {
            ...simRef.current,
            realTime: true,
            timeSeconds: sysClock.timeSeconds,
          },
          compositeCanvas,
          liveHighResCanvasRef.current,
          glyphCacheRef.current
        );
      }
    }
  }, [
    dialPlateRevision,
    highResConfig.resolution,
    highResConfig.dial.intactArtworkUrl,
    highResConfig.dial.customImage?.enabled,
    highResConfig.bezel,
    highResConfig.dial.motif,
    highResConfig.dial.lightAngleDeg,
    highResConfig.dial.recessedAoDepth,
    highResConfig.displayMode,
    highResConfig.hands.enabled,
    bezelVisible,
    dialVisible,
  ]);

  useEffect(() => {
    glyphCacheRef.current.clear();
  }, [
    highResConfig.resolution,
    highResConfig.digital.fontStyle,
    highResConfig.digital.activeCustomFontId,
    highResConfig.digital.customFonts,
    highResConfig.digital.primaryColor,
    highResConfig.digital.glowColor,
    highResConfig.digital.hoursColorMode,
    highResConfig.digital.hoursColor,
    highResConfig.digital.hoursGradientTop,
    highResConfig.digital.hoursGradientBottom,
    highResConfig.digital.minutesColor,
    highResConfig.digital.secondsColor,
    highResConfig.digital.ampmColor,
    highResConfig.digital.dateColor,
    highResConfig.digital.metricsValueColor,
    highResConfig.digital.metricsIconColor,
    fontLoadRev,
  ]);

  useEffect(() => {
    let rafId = 0;
    let cancelled = false;
    let lastDrawMs = 0;
    let lastRenderCostMs = 0;
    let lastSecDrawn = -1;

    const renderLoop = (nowMs: number) => {
      if (cancelled) return;
      const currentSim = simRef.current;
      const currentConfig = previewConfigRef.current;
      const staticBg = cachedStaticDialRef.current;
      const canvas = canvasRef.current;

      const sysClock = getSystemClockState(new Date());
      const sweepIntervalMs = Math.max(50, Math.min(350, lastRenderCostMs * 3));
      const shouldDraw =
        lastDrawMs === 0 ||
        (currentSim.sweep60fps
          ? nowMs - lastDrawMs >= sweepIntervalMs
          : sysClock.seconds !== lastSecDrawn);

      if (shouldDraw && staticBg && canvas) {
        const t0 = performance.now();
        lastDrawMs = nowMs;
        lastSecDrawn = sysClock.seconds;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          if (!liveHighResCanvasRef.current) {
            liveHighResCanvasRef.current = document.createElement('canvas');
          }
          renderSupersampledWatchFrame(
            ctx,
            currentConfig,
            {
              ...currentSim,
              realTime: true,
              timeSeconds: sysClock.timeSeconds,
            },
            staticBg,
            liveHighResCanvasRef.current,
            glyphCacheRef.current
          );
        }
        lastRenderCostMs = performance.now() - t0;
      }

      if (!cancelled && !pauseRender) {
        rafId = window.requestAnimationFrame(renderLoop);
      }
    };

    rafId = window.requestAnimationFrame(renderLoop);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [dialPlateRevision, previewConfig, sim, pauseRender, fontLoadRev]);

  const handleEasyFileInput = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processUploadedDialImageFile(file, config, onChangeConfig);
  };

  const handleEasyDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUploadedDialImageFile(file, config, onChangeConfig);
    }
  };

  const { width, height, shape } = config.resolution;
  const { width: previewW, height: previewH } = previewConfig.resolution;
  const isFullHd = width >= 1080 || height >= 1080;

  const isLadiesLuxury =
    config.dial.secondaryColor.toLowerCase() === '#f4af9d' ||
    config.bezel.style === 'diamondPave' ||
    config.bezel.style === 'doubleRowDiamondPave' ||
    config.bezel.style === 'flutedRoseGold';

  const filteredPresets = useMemo(() => {
    if (presetFilter === 'round-all') {
      return WATCH_PRESETS.filter((p) => p.resolution.shape === 'round');
    }
    if (presetFilter === 'square-all') {
      return WATCH_PRESETS.filter((p) => p.resolution.shape === 'squircle');
    }
    return WATCH_PRESETS.filter(
      (p) => classifyEasyPreset(p) === presetFilter
    );
  }, [presetFilter]);

  const activeZoneHex =
    colorZone === 'face'
      ? config.dial.baseColor
      : colorZone === 'border'
      ? config.bezel.primaryColor
      : config.hands.enabled
      ? config.hands.secondHandColor
      : config.digital.primaryColor;

  const activeZoneLightness = hexToHsl(activeZoneHex).l;

  const applyZoneColor = (primaryHex: string, secondaryHex?: string) => {
    const intactActive = isUsingIntactArtwork(config);
    if (colorZone === 'face') {
      onChangeConfig({
        ...config,
        dial: {
          ...config.dial,
          baseColor: primaryHex,
          secondaryColor: secondaryHex ?? config.dial.secondaryColor,
          ...(intactActive
            ? { overlayTintColor: primaryHex, overlayTintOpacity: 0.28 }
            : {}),
        },
      });
    } else if (colorZone === 'border') {
      onChangeConfig({
        ...config,
        bezel: {
          ...config.bezel,
          primaryColor: primaryHex,
          accentColor: secondaryHex ?? config.bezel.accentColor,
          caseTintColor: primaryHex,
        },
      });
    } else {
      onChangeConfig({
        ...config,
        hands: {
          ...config.hands,
          secondHandColor: primaryHex,
          lumeColor: secondaryHex ?? primaryHex,
        },
        digital: {
          ...config.digital,
          primaryColor: secondaryHex ?? primaryHex,
          hoursColor: secondaryHex ?? primaryHex,
          hoursGradientTop: secondaryHex ?? primaryHex,
          minutesColor: secondaryHex ?? primaryHex,
          glowColor: primaryHex,
        },
      });
    }
  };

  const applyZoneLightness = (nextL: number) => {
    const hsl = hexToHsl(activeZoneHex);
    const updatedHex = hslToHex(hsl.h, hsl.s, nextL);
    if (colorZone === 'face') {
      const secHsl = hexToHsl(config.dial.secondaryColor);
      const secHex = hslToHex(
        secHsl.h,
        secHsl.s,
        Math.min(96, Math.max(12, nextL + 12))
      );
      applyZoneColor(updatedHex, secHex);
    } else if (colorZone === 'border') {
      applyZoneColor(updatedHex);
    } else {
      applyZoneColor(updatedHex, updatedHex);
    }
  };

  const handleAutoPickWatchUiColor = async (
    scope: 'all' | 'hands' | 'dial' | 'bezel'
  ) => {
    setIsPickingColor(true);
    try {
      const sourceUrl =
        config.dial.customImage?.enabled && config.dial.customImage.dataUrl
          ? config.dial.customImage.dataUrl
          : config.dial.intactArtworkUrl;
      let extracted: ExtractedWatchUiColors;
      if (sourceUrl) {
        extracted = await autoPickWatchUiColorsFromImageUrl(sourceUrl);
      } else {
        extracted = {
          accentColor: config.bezel.accentColor || config.dial.secondaryColor,
          secondaryColor: config.dial.secondaryColor || config.bezel.accentColor,
          metalToneColor:
            config.hands.hourMinuteMetalColor ?? config.dial.secondaryColor,
          dialBaseColor: config.dial.baseColor,
          palette: [
            config.bezel.accentColor,
            config.dial.secondaryColor,
            config.dial.baseColor,
          ],
        };
      }
      setAutoPickedHex(extracted.accentColor);
      onChangeConfig(applyAutoPickedWatchUiColors(config, extracted, scope));
    } finally {
      setIsPickingColor(false);
    }
  };

  const stepsMeta: Array<{
    id: EasyStepId;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 1, label: t.step1Shape, icon: <Watch className="w-4 h-4" /> },
    { id: 2, label: t.step2Style, icon: <Gem className="w-4 h-4" /> },
    { id: 3, label: t.step3Colors, icon: <Palette className="w-4 h-4" /> },
    { id: 4, label: t.step4Details, icon: <Clock className="w-4 h-4" /> },
    { id: 5, label: t.step5Save, icon: <Download className="w-4 h-4" /> },
  ];

  const handleToggleRoundSquare = (targetShape: 'round' | 'squircle') => {
    if (hardwareLock) return;
    setPresetFilter(targetShape === 'round' ? 'round-all' : 'square-all');
    if (targetShape === 'round') {
      onSelectResolution(isFullHd ? RESOLUTION_SPECS[0] : RESOLUTION_SPECS[2]);
    } else {
      onSelectResolution(isFullHd ? RESOLUTION_SPECS[1] : RESOLUTION_SPECS[6]);
    }
  };

  const handleToggleHd = (enableHd: boolean) => {
    if (hardwareLock) return;
    onChangeSim({ ...sim, fullHdMasterMode: enableHd });
    if (enableHd) {
      onSelectResolution(
        shape === 'round' ? RESOLUTION_SPECS[0] : RESOLUTION_SPECS[1]
      );
    } else {
      onSelectResolution(
        shape === 'round' ? RESOLUTION_SPECS[2] : RESOLUTION_SPECS[6]
      );
    }
  };

  const hasVisibleReadouts =
    config.digital.widgets.some((w) => w.enabled) ||
    config.dial.subDials.some((s) => s.enabled);

  const handleToggleReadouts = (nextVal: boolean) => {
    onChangeConfig({
      ...config,
      layers: config.layers.map((l) =>
        l.id === 'complications' ? { ...l, visible: nextVal } : l
      ),
      dial: {
        ...config.dial,
        subDials: config.dial.subDials.map((s) => ({ ...s, enabled: nextVal })),
      },
      digital: {
        ...config.digital,
        widgets: config.digital.widgets.map((w) => ({
          ...w,
          enabled: w.type === 'timeDigital' ? true : nextVal,
        })),
      },
    });
  };

  const displayMode = getDisplayMode(config);
  const primaryTimeWidget = getPrimaryTimeWidget(config);
  const isDigitalLayerActive =
    (config.layers.find((l) => l.id === 'digital')?.visible ?? true) &&
    Boolean(primaryTimeWidget?.enabled);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDigitalLayerActive || !primaryTimeWidget || !canvasRef.current) return;
    canvasRef.current.setPointerCapture?.(e.pointerId);
    dragClockRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origRelX: primaryTimeWidget.relX,
      origRelY: primaryTimeWidget.relY,
    };
    setIsDraggingClock(true);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragClockRef.current;
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { dRelX, dRelY } = clientDeltaToWatchRelDelta(
      e.clientX - drag.startX,
      e.clientY - drag.startY,
      rect.width,
      rect.height
    );
    onChangeConfig(
      updatePrimaryTimeWidget(configRef.current, {
        relX: drag.origRelX + dRelX,
        relY: drag.origRelY + dRelY,
      })
    );
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragClockRef.current?.pointerId === e.pointerId) {
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
      dragClockRef.current = null;
      setIsDraggingClock(false);
    }
  };

  return (
    <div
      dir={dir}
      className="min-h-screen flex flex-col bg-[#090b10] text-slate-100 overflow-x-hidden"
    >
      {/* Clean 3-Zone Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-800/90 bg-[#0d111a]">
        <div className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0 order-1">
          {t.appName}
        </div>

        {/* Mode Switcher + Language Picker */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 order-3 lg:order-2 w-full lg:w-auto justify-between lg:justify-center">
          <div
            role="group"
            aria-label="Interface Mode"
            className="flex items-center p-1 rounded-xl bg-[#141a26] border border-slate-700/80"
          >
            <button
              type="button"
              aria-pressed="true"
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold bg-orange-600 text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.easyMode}
            </button>
            <button
              type="button"
              onClick={onSwitchToPro}
              aria-pressed="false"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {t.proMode}
            </button>
          </div>

          <label className="flex items-center gap-1.5 rounded-xl bg-[#141a26] border border-slate-700/80 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm">
            <Globe className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="sr-only">{t.languageLabel}</span>
            <select
              aria-label={t.languageLabel}
              value={language}
              onChange={(e) =>
                onChangeLanguage(e.target.value as LanguageCode)
              }
              className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                  className="bg-[#121722] text-slate-100"
                >
                  {lang.flag} {lang.nativeName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 order-2 lg:order-3 w-full sm:w-auto justify-start sm:justify-end min-w-0">
          {hardwareLock && (
            <span
              data-testid="easy-hardware-lock-badge"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-950/75 border border-emerald-500/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              {formatHardwareLockBadgeText(
                hardwareLock.lcdWidth,
                hardwareLock.lcdHeight,
                hardwareLock.isRound
              )}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenWebBle}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] sm:min-h-[44px]"
          >
            <Bluetooth className="w-4 h-4" />
            {t.sendBluetooth}
          </button>
          <button
            type="button"
            onClick={() => setStep(5)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] sm:min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            {t.saveNowBtn}
          </button>
        </div>
      </header>

      {lastExportBanner && (
        <div className="flex items-center justify-between px-5 py-2.5 bg-emerald-950/80 border-b border-emerald-700/60 text-sm text-emerald-100">
          <span>{lastExportBanner}</span>
          <button
            type="button"
            onClick={onDismissBanner}
            className="text-emerald-300 hover:text-white font-semibold cursor-pointer px-3 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Accessible 2-Column Studio */}
      <main className="flex-1 w-full max-w-[1380px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Big Clear Watch Preview + Quick Time Buttons */}
        <section
          aria-label="Live Watch Preview"
          className="lg:col-span-5 flex flex-col items-center justify-center rounded-2xl bg-[#0e131e] border border-slate-800/90 p-6 space-y-5"
        >
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-white font-display">
              {simplifyPresetDisplayName(config.name)}
            </h1>
            <p className="text-sm text-slate-400">
              {shape === 'round' ? t.roundWatch : t.squareWatch} ·{' '}
              <span dir="ltr" className="font-mono inline-block">
                {width}×{height}
              </span>
            </p>
          </div>

          {/* Watch Casing with Drag-and-Drop Photo Zone & Floating + Upload Button */}
          <div className="py-2 flex items-center justify-center">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleEasyDrop}
              className="relative"
            >
              <div
                style={
                  config.bezel.caseTintColor
                    ? { borderColor: config.bezel.caseTintColor }
                    : undefined
                }
                className={`relative p-5 border-2 shadow-2xl transition-all ${
                  isDragOver ? 'ring-4 ring-orange-500/70 scale-[1.01]' : ''
                } ${
                  isLadiesLuxury
                    ? 'bg-gradient-to-br from-[#5e383d] via-[#2c191d] to-[#140b0e] border-[#c48b7d]/70'
                    : 'bg-gradient-to-br from-[#2a3242] via-[#141923] to-[#0a0d14] border-slate-700/80'
                } ${shape === 'round' ? 'rounded-full' : 'rounded-[64px]'}`}
              >
                <div
                  className={`absolute -right-3 top-1/3 w-2.5 h-14 rounded-r-md border ${
                    isLadiesLuxury
                      ? 'bg-gradient-to-b from-[#fff1f2] via-[#f4af9d] to-[#783f42] border-[#f4af9d]'
                      : 'bg-gradient-to-b from-slate-400 via-slate-600 to-slate-800 border-slate-600'
                  }`}
                />
                <div
                  className={`relative overflow-hidden bg-[#05070a] border border-slate-800 ${
                    shape === 'round' ? 'rounded-full' : 'rounded-[48px]'
                  }`}
                >
                  <canvas
                    ref={canvasRef}
                    data-testid="easy-watch-canvas"
                    width={previewW}
                    height={previewH}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    onPointerCancel={handleCanvasPointerUp}
                    title={
                      isDigitalLayerActive
                        ? 'Drag anywhere on watch to move digital clock position'
                        : undefined
                    }
                    className={`block max-w-[300px] sm:max-w-[340px] max-h-[370px] w-auto h-auto select-none ${
                      isDigitalLayerActive
                        ? isDraggingClock
                          ? 'cursor-grabbing touch-none'
                          : 'cursor-grab touch-none'
                        : ''
                    }`}
                  />
                  {isDragOver && (
                    <div className="absolute inset-0 bg-slate-950/75 flex items-center justify-center text-xs font-semibold text-orange-300 pointer-events-none">
                      Drop Photo Here
                    </div>
                  )}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleEasyFileInput}
                className="sr-only"
                data-testid="easy-photo-upload-input"
                aria-label={t.uploadPhotoBtn}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={t.uploadPhotoBtn}
                aria-label={t.uploadPhotoBtn}
                data-testid="easy-upload-plus-btn"
                className="absolute -bottom-1 -right-1 w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-500 border-2 border-[#0e131e] text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* 100% Automatic Phone/Device Clock Sync (Zero Manual Time Controls) */}
          <div className="w-full pt-1 space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm text-slate-300">
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium text-emerald-300">
                {t.autoSyncedClock}
              </span>
              <span className="text-slate-500">·</span>
              <span
                data-testid="easy-device-clock-hms"
                dir="ltr"
                className="font-mono tabular-nums font-semibold text-white inline-block"
              >
                {clockSnapshot.formattedHMS}
              </span>
              <span className="text-slate-500">·</span>
              <span dir="ltr" className="font-mono text-slate-400 inline-block">
                {clockSnapshot.timezone} ({clockSnapshot.is24Hour ? '24h' : '12h'})
              </span>
            </div>

            <div className="flex items-center justify-center">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sim.sweep60fps}
                  onChange={(e) =>
                    onChangeSim({
                      ...sim,
                      realTime: true,
                      sweep60fps: e.target.checked,
                    })
                  }
                  className="accent-orange-500"
                />
                Sweep Second Hand (60fps vs 1Hz Tick)
              </label>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: 5-Step Big Visual Customizer */}
        <section
          aria-label="Easy Watch Face Customizer"
          className="lg:col-span-7 rounded-2xl bg-[#0e131e] border border-slate-800/90 flex flex-col overflow-hidden"
        >
          {/* 5 Step Navigation Buttons */}
          <nav
            aria-label="Customizer Steps"
            className="grid grid-cols-5 gap-1.5 p-3 bg-[#121826] border-b border-slate-800"
          >
            {stepsMeta.map((s) => {
              const active = step === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[48px] whitespace-nowrap ${
                    active
                      ? 'bg-orange-600 text-white shadow'
                      : 'bg-[#171f30] text-slate-300 hover:bg-[#1e283d] hover:text-white'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      active
                        ? 'bg-white text-orange-700'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {s.id}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Active Step Body */}
          <div className="p-5 sm:p-6 flex-1 space-y-5">
            {/* STEP 1: WATCH SHAPE */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-white font-display">
                    1. {t.shapeQuestion}
                  </h2>
                  {hardwareLock && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-950/75 border border-emerald-500/60 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      {formatHardwareLockBadgeText(
                        hardwareLock.lcdWidth,
                        hardwareLock.lcdHeight,
                        hardwareLock.isRound
                      )}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    disabled={Boolean(hardwareLock)}
                    onClick={() => handleToggleRoundSquare('round')}
                    className={`relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-colors min-h-[168px] ${
                      hardwareLock ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      shape === 'round'
                        ? 'bg-orange-600/15 border-orange-500 text-white'
                        : 'bg-[#131926] border-slate-700/80 text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    {shape === 'round' && (
                      <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center">
                        <Check className="w-4 h-4" />
                      </span>
                    )}
                    <div className="w-16 h-16 rounded-full border-4 border-current flex items-center justify-center">
                      <Clock className="w-7 h-7" />
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">{t.roundWatch}</div>
                      <div className="text-sm text-slate-300 mt-0.5">
                        {t.roundHint}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(hardwareLock)}
                    onClick={() => handleToggleRoundSquare('squircle')}
                    className={`relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-colors min-h-[168px] ${
                      hardwareLock ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      shape === 'squircle'
                        ? 'bg-orange-600/15 border-orange-500 text-white'
                        : 'bg-[#131926] border-slate-700/80 text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    {shape === 'squircle' && (
                      <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center">
                        <Check className="w-4 h-4" />
                      </span>
                    )}
                    <div className="w-14 h-16 rounded-2xl border-4 border-current flex items-center justify-center">
                      <Clock className="w-7 h-7" />
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">{t.squareWatch}</div>
                      <div className="text-sm text-slate-300 mt-0.5">
                        {t.squareHint}
                      </div>
                    </div>
                  </button>
                </div>

                {/* Big Friendly HD Quality Switch */}
                <button
                  type="button"
                  disabled={Boolean(hardwareLock)}
                  onClick={() => handleToggleHd(!isFullHd)}
                  className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border-2 text-left transition-colors min-h-[72px] ${
                    hardwareLock ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    isFullHd
                      ? 'bg-pink-600/15 border-pink-500/80 text-white'
                      : 'bg-[#131926] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-pink-500/20 text-pink-300 flex items-center justify-center shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-base font-bold">
                        {t.hdQualityTitle}
                      </div>
                      <div className="text-sm text-slate-300">
                        {t.hdQualityHint}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 flex items-center ${
                      isFullHd ? 'bg-pink-500 justify-end' : 'bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow" />
                  </div>
                </button>
              </div>
            )}

            {/* STEP 2: PICK A STYLE (REAL MINI WATCH THUMBNAILS) */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-white font-display">
                    2. {t.step2Style}
                  </h2>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/50 px-4 py-2 text-sm font-semibold text-orange-200 cursor-pointer min-h-[44px]"
                    >
                      <Plus className="w-4 h-4 text-orange-400" />
                      {t.uploadPhotoBtn}
                    </button>
                    <button
                      type="button"
                      onClick={onOpenLadiesCollection}
                      className="inline-flex items-center gap-2 rounded-xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/50 px-4 py-2 text-sm font-semibold text-pink-200 cursor-pointer min-h-[44px]"
                    >
                      <Gem className="w-4 h-4 text-pink-400" />
                      {t.moreDesignsBtn}
                    </button>
                  </div>
                </div>

                {/* Separated Round & Square Category Filter Tabs */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ['round-all', t.catRoundAll],
                        ['round-analog', t.catRoundAnalog],
                        ['round-digital', t.catRoundDigital],
                      ] as Array<[EasyPresetFilter, string]>
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPresetFilter(key)}
                        className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[42px] whitespace-nowrap ${
                          presetFilter === key
                            ? 'bg-orange-600 text-white'
                            : 'bg-[#141a26] border border-slate-700/80 text-slate-300 hover:text-white'
                        }`}
                      >
                        ● {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ['square-all', t.catSquareAll],
                        ['square-analog', t.catSquareAnalog],
                        ['square-digital', t.catSquareDigital],
                      ] as Array<[EasyPresetFilter, string]>
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPresetFilter(key)}
                        className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[42px] whitespace-nowrap ${
                          presetFilter === key
                            ? 'bg-sky-600 text-white'
                            : 'bg-[#141a26] border border-slate-700/80 text-slate-300 hover:text-white'
                        }`}
                      >
                        ■ {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visual Watch Card Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[370px] overflow-y-auto pr-1">
                  {filteredPresets.map((preset, idx) => {
                    const active = config.presetId === preset.presetId;
                    const friendlyName = simplifyPresetDisplayName(preset.name);
                    return (
                      <button
                        key={preset.presetId}
                        type="button"
                        onClick={() => onSelectPreset(preset)}
                        className={`relative flex flex-col items-center gap-2.5 p-3 rounded-2xl border-2 text-center transition-colors cursor-pointer ${
                          active
                            ? 'bg-orange-600/15 border-orange-500 text-white'
                            : 'bg-[#131926] border-slate-800 text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        {active && (
                          <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <PresetThumbnail
                          preset={preset}
                          alt={friendlyName}
                          staggerIndex={idx}
                        />
                        <span className="text-xs sm:text-sm font-semibold leading-tight line-clamp-2">
                          {friendlyName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 3: PICK COLORS & CUSTOM PHOTO */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold text-white font-display">
                  3. {t.step3Colors}
                </h2>

                <CustomImageUploadControls
                  config={config}
                  onChangeConfig={onChangeConfig}
                  activeColorId={activePhotoColorId}
                  onToggleColorPicker={(id) =>
                    setActivePhotoColorId((prev) => (prev === id ? null : id))
                  }
                />

                {/* 1-Click Auto-Pick Color From Watch Image */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#131926] border border-pink-500/40 p-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <Pipette className="w-4 h-4 text-pink-400 shrink-0" />
                      <span>{t.autoPickColorBtn}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t.autoPickColorHint}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {autoPickedHex && (
                      <span
                        data-testid="easy-autopicked-hex"
                        dir="ltr"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d111a] border border-slate-700 px-2.5 py-1 text-xs font-mono text-slate-200 uppercase"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/40"
                          style={{ backgroundColor: autoPickedHex }}
                        />
                        {autoPickedHex}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isPickingColor}
                      data-testid="easy-autopick-colors-btn"
                      onClick={() =>
                        handleAutoPickWatchUiColor(
                          colorZone === 'hands'
                            ? 'hands'
                            : colorZone === 'border'
                            ? 'bezel'
                            : 'all'
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-pink-600 hover:bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50 min-h-[44px]"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{t.autoPickColorBtn}</span>
                    </button>
                  </div>
                </div>

                {/* What part to recolor */}
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ['face', t.colorTargetFace, config.dial.baseColor],
                      ['border', t.colorTargetBorder, config.bezel.primaryColor],
                      [
                        'hands',
                        t.colorTargetHands,
                        config.hands.enabled
                          ? config.hands.secondHandColor
                          : config.digital.primaryColor,
                      ],
                    ] as Array<[ColorZone, string, string]>
                  ).map(([zone, label, hex]) => {
                    const active = colorZone === zone;
                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => setColorZone(zone)}
                        className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border-2 text-sm font-semibold cursor-pointer min-h-[52px] ${
                          active
                            ? 'bg-orange-600/15 border-orange-500 text-white'
                            : 'bg-[#131926] border-slate-700/80 text-slate-300 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full border border-white/40 shrink-0"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Big Tactile Color Circles */}
                <div className="grid grid-cols-5 sm:grid-cols-7 gap-3">
                  {EASY_COLOR_PALETTE.map((swatch) => {
                    const selected =
                      activeZoneHex.toLowerCase() === swatch.hex.toLowerCase();
                    const swatchName = swatch.labels[language] ?? swatch.labels.en;
                    return (
                      <button
                        key={swatch.id}
                        type="button"
                        title={swatchName}
                        aria-label={swatchName}
                        onClick={() =>
                          applyZoneColor(swatch.hex, swatch.secondaryHex)
                        }
                        className="flex flex-col items-center gap-1.5 p-1.5 rounded-xl hover:bg-[#171f30] cursor-pointer"
                      >
                        <span
                          className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-transform ${
                            selected
                              ? 'border-white ring-2 ring-orange-500 scale-105'
                              : 'border-white/25'
                          }`}
                          style={{
                            background: `linear-gradient(135deg, ${swatch.secondaryHex}, ${swatch.hex})`,
                          }}
                        >
                          {selected && (
                            <Check className="w-5 h-5 text-white drop-shadow" />
                          )}
                        </span>
                        <span className="text-[11px] font-medium text-slate-300 text-center leading-tight line-clamp-1">
                          {swatchName}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Simple Lighter / Darker Slider */}
                <div className="rounded-xl bg-[#131926] border border-slate-800 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-200">
                    <span className="flex items-center gap-2">
                      <Moon className="w-4 h-4 text-slate-400" />
                      {t.darkerLabel}
                    </span>
                    <span>{t.brightnessLabel}</span>
                    <span className="flex items-center gap-2">
                      {t.lighterLabel}
                      <Sun className="w-4 h-4 text-amber-400" />
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={t.brightnessLabel}
                    min={8}
                    max={94}
                    value={activeZoneLightness}
                    onChange={(e) =>
                      applyZoneLightness(Number(e.target.value))
                    }
                    className="w-full h-3 accent-orange-500 cursor-pointer"
                  />
                </div>

                {/* Optional Custom HSL Picker Toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowCustomHsl((v) => !v)}
                    className="text-sm font-semibold text-sky-400 hover:text-sky-300 cursor-pointer py-1"
                  >
                    {t.moreColorsBtn} {showCustomHsl ? '▲' : '▼'}
                  </button>
                  {showCustomHsl && (
                    <div className="mt-2">
                      <HslColorPicker
                        id={`easy-${colorZone}`}
                        label={
                          colorZone === 'face'
                            ? t.colorTargetFace
                            : colorZone === 'border'
                            ? t.colorTargetBorder
                            : t.colorTargetHands
                        }
                        value={activeZoneHex}
                        isOpen
                        onChange={(hex) => applyZoneColor(hex)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: DISPLAY MODE, HANDS & EXTRAS */}
            {step === 4 && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold text-white font-display">
                  4. {t.step4Details}
                </h2>

                {/* 3-Way Watch Display Mode Switcher */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-300">
                    {t.watchTypeTitle}
                  </div>
                  <div
                    role="group"
                    aria-label={t.watchTypeTitle}
                    className="grid grid-cols-3 gap-2.5"
                  >
                    {(
                      [
                        ['analog', t.modeAnalog],
                        ['hybrid', t.modeHybrid],
                        ['digital', t.modeDigital],
                      ] as Array<[WatchDisplayMode, string]>
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={displayMode === mode}
                        onClick={() =>
                          onChangeConfig(applyDisplayMode(config, mode))
                        }
                        className={`py-3 px-3 rounded-xl border-2 text-sm font-bold transition-colors cursor-pointer min-h-[52px] ${
                          displayMode === mode
                            ? 'bg-sky-600/20 border-sky-500 text-white'
                            : 'bg-[#131926] border-slate-700/80 text-slate-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Digital Clock Position, Size & Style (Drag on Watch or Fine-Tune) */}
                {isDigitalLayerActive && primaryTimeWidget && (
                  <div className="rounded-2xl bg-[#131926] border border-sky-500/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-white">
                          Digital Clock Position &amp; Style
                        </div>
                        <p className="text-xs text-slate-400">
                          Drag directly on the watch preview or move sliders to place the clock in any empty spot.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig(
                            updatePrimaryTimeWidget(config, { relX: 0, relY: 0 })
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#0d111a] border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
                      >
                        Center (0, 0)
                      </button>
                    </div>

                    <div
                      role="group"
                      aria-label="Digital Clock Format"
                      className="grid grid-cols-3 gap-2"
                    >
                      {(
                        [
                          ['inline', 'HH:MM'],
                          ['stacked', 'Stacked'],
                          ['hourOnly', 'Hour (1, 10, 19)'],
                        ] as Array<[DigitalClockLayout, string]>
                      ).map(([layoutKey, label]) => {
                        const active =
                          (primaryTimeWidget.layout ?? 'inline') === layoutKey;
                        return (
                          <button
                            key={layoutKey}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              onChangeConfig(
                                updatePrimaryTimeWidget(config, {
                                  layout: layoutKey,
                                })
                              )
                            }
                            className={`py-2 px-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                              active
                                ? 'bg-sky-600/25 border-sky-500 text-white'
                                : 'bg-[#0d111a] border-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <label className="space-y-1">
                        <div className="flex justify-between text-slate-300">
                          <span>Left / Right (X)</span>
                          <span dir="ltr" className="font-mono text-sky-300">
                            {Math.round(primaryTimeWidget.relX * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="Digital Clock X Position"
                          min={-0.42}
                          max={0.42}
                          step={0.01}
                          value={primaryTimeWidget.relX}
                          onChange={(e) =>
                            onChangeConfig(
                              updatePrimaryTimeWidget(config, {
                                relX: Number(e.target.value),
                              })
                            )
                          }
                          className="w-full accent-sky-500"
                        />
                      </label>

                      <label className="space-y-1">
                        <div className="flex justify-between text-slate-300">
                          <span>Up / Down (Y)</span>
                          <span dir="ltr" className="font-mono text-sky-300">
                            {Math.round(primaryTimeWidget.relY * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="Digital Clock Y Position"
                          min={-0.42}
                          max={0.42}
                          step={0.01}
                          value={primaryTimeWidget.relY}
                          onChange={(e) =>
                            onChangeConfig(
                              updatePrimaryTimeWidget(config, {
                                relY: Number(e.target.value),
                              })
                            )
                          }
                          className="w-full accent-sky-500"
                        />
                      </label>

                      <label className="space-y-1">
                        <div className="flex justify-between text-slate-300">
                          <span>Clock Size</span>
                          <span dir="ltr" className="font-mono text-sky-300">
                            {primaryTimeWidget.scale.toFixed(2)}×
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="Digital Clock Size"
                          min={0.45}
                          max={3.2}
                          step={0.05}
                          value={primaryTimeWidget.scale}
                          onChange={(e) =>
                            onChangeConfig(
                              updatePrimaryTimeWidget(config, {
                                scale: Number(e.target.value),
                              })
                            )
                          }
                          className="w-full accent-sky-500"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Hand Color Auto-Pick + Show Hands Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        hands: {
                          ...config.hands,
                          enabled: !config.hands.enabled,
                        },
                        layers: config.layers.map((l) =>
                          l.id === 'hands'
                            ? { ...l, visible: !config.hands.enabled }
                            : l
                        ),
                      })
                    }
                    className={`flex items-center justify-between gap-3 p-4 rounded-2xl border-2 cursor-pointer min-h-[64px] ${
                      config.hands.enabled
                        ? 'bg-orange-600/15 border-orange-500 text-white'
                        : 'bg-[#131926] border-slate-700/80 text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-sm font-bold text-left">
                      <Clock className="w-5 h-5 text-orange-400 shrink-0" />
                      {t.showHandsLabel}
                    </span>
                    <div
                      className={`w-11 h-6 rounded-full p-0.5 shrink-0 flex items-center ${
                        config.hands.enabled
                          ? 'bg-orange-500 justify-end'
                          : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-white" />
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isPickingColor}
                    data-testid="easy-autopick-hands-btn"
                    onClick={() => handleAutoPickWatchUiColor('hands')}
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl border-2 border-pink-500/50 bg-pink-600/15 hover:bg-pink-600/25 text-white cursor-pointer min-h-[64px] disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2.5 text-sm font-bold text-left">
                      <Pipette className="w-5 h-5 text-pink-400 shrink-0" />
                      <span>{t.autoPickColorBtn}</span>
                    </span>
                    <span
                      className="w-6 h-6 rounded-full border-2 border-white/60 shrink-0 shadow"
                      style={{
                        backgroundColor:
                          autoPickedHex ?? config.hands.secondHandColor,
                      }}
                    />
                  </button>
                </div>

                {/* Hand Shape Picker (Visual SVG Icons) */}
                {config.hands.enabled && (
                  <div className="space-y-2.5">
                    <div className="text-sm font-semibold text-slate-300">
                      {t.handShapeTitle}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(
                        [
                          ['feuilleLeaf', t.handLeaf],
                          ['dauphine', t.handClassic],
                          ['wayfinder', t.handModern],
                          ['skeleton', t.handSport],
                        ] as Array<[HandStyle, string]>
                      ).map(([style, label]) => {
                        const active = config.hands.style === style;
                        return (
                          <button
                            key={style}
                            type="button"
                            onClick={() =>
                              onChangeConfig({
                                ...config,
                                hands: { ...config.hands, style },
                              })
                            }
                            className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border-2 cursor-pointer min-h-[92px] ${
                              active
                                ? 'bg-orange-600/15 border-orange-500 text-white'
                                : 'bg-[#131926] border-slate-700/80 text-slate-300 hover:text-white'
                            }`}
                          >
                            <HandShapeGraphic style={style} />
                            <span className="text-sm font-semibold">
                              {label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Glass Glare & Health Readout Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        glassCap: {
                          ...config.glassCap,
                          sapphireGlare: !config.glassCap.sapphireGlare,
                        },
                      })
                    }
                    className={`flex items-center justify-between gap-3 p-4 rounded-2xl border-2 cursor-pointer min-h-[64px] ${
                      config.glassCap.sapphireGlare
                        ? 'bg-sky-600/15 border-sky-500 text-white'
                        : 'bg-[#131926] border-slate-700/80 text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-sm font-bold text-left">
                      <Eye className="w-5 h-5 text-sky-400 shrink-0" />
                      {t.glassShineLabel}
                    </span>
                    <div
                      className={`w-11 h-6 rounded-full p-0.5 shrink-0 flex items-center ${
                        config.glassCap.sapphireGlare
                          ? 'bg-sky-500 justify-end'
                          : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-white" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleReadouts(!hasVisibleReadouts)}
                    className={`flex items-center justify-between gap-3 p-4 rounded-2xl border-2 cursor-pointer min-h-[64px] ${
                      hasVisibleReadouts
                        ? 'bg-emerald-600/15 border-emerald-500 text-white'
                        : 'bg-[#131926] border-slate-700/80 text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-sm font-bold text-left">
                      <Activity className="w-5 h-5 text-emerald-400 shrink-0" />
                      {t.showStepsDateLabel}
                    </span>
                    <div
                      className={`w-11 h-6 rounded-full p-0.5 shrink-0 flex items-center ${
                        hasVisibleReadouts
                          ? 'bg-emerald-500 justify-end'
                          : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-white" />
                    </div>
                  </button>
                </div>

                {/* Studio Light Angle (3D Specular & Cast Shadows) */}
                <label className="block rounded-2xl bg-[#131926] border border-slate-800 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-200">
                    <span className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-amber-400" />
                      Studio Light Angle
                    </span>
                    <span dir="ltr" className="font-mono text-sky-300">
                      {config.dial.lightAngleDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Studio Light Angle"
                    min={0}
                    max={360}
                    value={config.dial.lightAngleDeg}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        dial: {
                          ...config.dial,
                          lightAngleDeg: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </label>
              </div>
            )}

            {/* STEP 5: SAVE TO WATCH */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white font-display">
                    5. {t.saveTitle}
                  </h2>
                  <p className="text-sm text-slate-300 mt-1">
                    {t.saveSubtitle}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={onExportFitCloud}
                    className="flex items-center gap-4 p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-left transition-colors cursor-pointer min-h-[96px] disabled:opacity-50"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                      <Download className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-base font-bold">{t.saveFitCloud}</div>
                      <div className="text-sm text-emerald-100 mt-0.5">
                        {t.saveFitCloudHint}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => onExportVeryFit(true)}
                    className="flex items-center gap-4 p-5 rounded-2xl bg-[#162136] hover:bg-[#1e2d4a] border-2 border-sky-500/50 text-white text-left transition-colors cursor-pointer min-h-[96px] disabled:opacity-50"
                  >
                    <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-base font-bold">{t.saveVeryFit}</div>
                      <div className="text-sm text-slate-300 mt-0.5">
                        {t.saveVeryFitHint}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenWebBle}
                    className="sm:col-span-2 flex items-center gap-4 p-5 rounded-2xl bg-[#131926] hover:bg-[#1a2235] border-2 border-indigo-500/45 text-white text-left transition-colors cursor-pointer min-h-[96px]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                      <Bluetooth className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-base font-bold">
                        {t.sendBluetooth}
                      </div>
                      <div className="text-sm text-slate-300 mt-0.5">
                        {t.sendBluetoothHint}
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step Footer Navigation (Big Back / Next Buttons) */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 bg-[#121826] border-t border-slate-800">
            <button
              type="button"
              disabled={step === 1}
              onClick={() =>
                setStep((s) => Math.max(1, s - 1) as EasyStepId)
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a2234] hover:bg-[#242f47] text-sm font-semibold text-slate-200 disabled:opacity-35 cursor-pointer min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              {t.prevStep}
            </button>

            <span dir="ltr" className="text-sm font-mono text-slate-400">
              {step} / 5
            </span>

            {step < 5 ? (
              <button
                type="button"
                onClick={() =>
                  setStep((s) => Math.min(5, s + 1) as EasyStepId)
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-sm font-semibold text-white cursor-pointer min-h-[44px]"
              >
                {t.nextStep}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isExporting}
                onClick={onExportFitCloud}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white cursor-pointer min-h-[44px] disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {t.saveFitCloud}
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
