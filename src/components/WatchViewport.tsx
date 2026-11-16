import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  Clock,
  Cpu,
  Footprints,
  Gem,
  Plus,
  ShieldCheck,
  Sparkles,
  Thermometer,
} from 'lucide-react';
import { drawDialMotifLayer } from '../engine/dialMotifs';
import {
  drawBezelAndOuterRing,
  drawDialPlate,
  isUsingIntactArtwork,
} from '../engine/materials';
import {
  renderSupersampledWatchFrame,
  scaleConfigToMaxDim,
  SUPERSAMPLE_TARGET_DIM,
} from '../engine/renderer';
import {
  RESOLUTION_SPECS,
  ROUND_WATCH_PRESETS,
  SQUARE_WATCH_PRESETS,
} from '../presets/watchPresets';
import {
  ResolutionSpec,
  SimulationState,
  WatchFaceConfig,
} from '../types/watchface';
import { HardwareResolutionLock } from '../types/nativeBridge';
import {
  getCachedCustomImageSync,
  loadCustomImageAndPalette,
} from '../utils/paletteExtractor';
import { getSystemClockState } from '../utils/systemClock';
import {
  clientDeltaToWatchRelDelta,
  getPrimaryTimeWidget,
  updatePrimaryTimeWidget,
} from '../utils/digitalPlacement';
import { ensureConfigFontsRegistered } from '../utils/customFontManager';
import { processUploadedDialImageFile } from './CustomImageUploadControls';

interface WatchViewportProps {
  config: WatchFaceConfig;
  sim: SimulationState;
  onChangeConfig: (next: WatchFaceConfig) => void;
  onChangeSim: (next: SimulationState) => void;
  onSelectPreset: (preset: WatchFaceConfig) => void;
  onSelectResolution: (res: ResolutionSpec) => void;
  onOpenLadiesCollection: () => void;
  pauseRender?: boolean;
  hardwareLock?: HardwareResolutionLock | null;
}

export const WatchViewport: React.FC<WatchViewportProps> = ({
  config,
  sim,
  onChangeConfig,
  onChangeSim,
  onSelectPreset,
  onSelectResolution,
  onOpenLadiesCollection,
  pauseRender = false,
  hardwareLock = null,
}) => {
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

  const [quickCollection, setQuickCollection] = useState<
    'round-analog' | 'round-digital' | 'square-analog' | 'square-digital'
  >(() =>
    config.resolution.shape === 'squircle' ? 'square-analog' : 'round-analog'
  );
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
  const [clockSnapshot, setClockSnapshot] = useState(() =>
    getSystemClockState(new Date())
  );

  // Update visible device clock label strictly from system clock every 1s
  useEffect(() => {
    setClockSnapshot(getSystemClockState(new Date()));
    const interval = window.setInterval(() => {
      setClockSnapshot(getSystemClockState(new Date()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Decode any custom uploaded photo OR intact preset artwork into the image cache
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

  // Ensure any uploaded custom .ttf/.otf fonts are registered with FontFace API
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

  // 1. Rebuild procedural dial plate shader or custom framed photo at 2048px-class supersampling
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

  // 2. Composite bezel & dial motifs onto 2048px cached dial plate + draw synchronous frame
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

  // 3. Clear bitmap numeral glyph cache instantly on any digital color/style/font change
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

  // Locked device-clock requestAnimationFrame render loop at 2048px supersampling
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

  const { width, height, shape } = config.resolution;
  const { width: previewW, height: previewH } = previewConfig.resolution;
  const isFullHd = width >= 1080 || height >= 1080;
  const isLadiesLuxury =
    config.dial.secondaryColor.toLowerCase() === '#f4af9d' ||
    config.bezel.style === 'diamondPave' ||
    config.bezel.style === 'doubleRowDiamondPave' ||
    config.bezel.style === 'flutedRoseGold';

  const handleToggleFullHdMaster = (checked: boolean) => {
    onChangeSim({ ...sim, fullHdMasterMode: checked });
    if (checked) {
      const targetSpec =
        shape === 'round' ? RESOLUTION_SPECS[0] : RESOLUTION_SPECS[1];
      onSelectResolution(targetSpec);
    } else {
      const targetSpec =
        shape === 'round' ? RESOLUTION_SPECS[2] : RESOLUTION_SPECS[6];
      onSelectResolution(targetSpec);
    }
  };

  const handleViewportFileInput = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processUploadedDialImageFile(file, config, onChangeConfig);
  };

  const handleDropOnDial = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUploadedDialImageFile(file, config, onChangeConfig);
    }
  };

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

  const activeCollectionList =
    quickCollection === 'round-analog'
      ? ROUND_WATCH_PRESETS.filter((p) => p.category === 'round-analog')
      : quickCollection === 'round-digital'
      ? ROUND_WATCH_PRESETS.filter((p) => p.category === 'round-digital')
      : quickCollection === 'square-analog'
      ? SQUARE_WATCH_PRESETS.filter((p) => p.category === 'square-analog')
      : SQUARE_WATCH_PRESETS.filter((p) => p.category === 'square-digital');

  return (
    <main className="flex-1 flex flex-col items-center justify-between p-4 lg:p-5 bg-[#090b10] overflow-y-auto">
      {/* Top Status Strip + Quick Ladies' Collection Switcher */}
      <div className="w-full max-w-2xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-mono">
            <span className="text-slate-200 font-semibold">{config.name}</span>
            <span>·</span>
            <span className={isFullHd ? 'text-pink-400 font-semibold' : ''}>
              {width}×{height}px ({shape})
            </span>
            <span>·</span>
            <span>
              {isFullHd
                ? 'Full HD 1080p Super-Sampled'
                : sim.hardwareRgb565Preview
                ? '16-Bit RGB565 Dithered'
                : '24-Bit Studio Master'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className={`inline-flex items-center gap-1.5 text-pink-300 font-medium ${hardwareLock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={Boolean(hardwareLock)}
                checked={isFullHd}
                onChange={(e) => {
                  if (!hardwareLock) handleToggleFullHdMaster(e.target.checked);
                }}
                className="accent-pink-500"
              />
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>Full HD 1080p Quality</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={sim.hardwareRgb565Preview}
                onChange={(e) =>
                  onChangeSim({
                    ...sim,
                    hardwareRgb565Preview: e.target.checked,
                  })
                }
                className="accent-orange-500"
              />
              <Cpu className="w-3.5 h-3.5 text-orange-400" />
              <span>RGB565 Dither</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={sim.fitCloudBlackGuard}
                onChange={(e) =>
                  onChangeSim({
                    ...sim,
                    fitCloudBlackGuard: e.target.checked,
                  })
                }
                className="accent-emerald-500"
              />
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>#080808</span>
            </label>
          </div>
        </div>

        {/* Separated Round & Square Quick Preset Bar */}
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-[#10141f] border border-slate-800/90 text-[11px]">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#090c14] border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setQuickCollection('round-analog')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                quickCollection === 'round-analog'
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ● Round Analog
            </button>
            <button
              type="button"
              onClick={() => setQuickCollection('round-digital')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                quickCollection === 'round-digital'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ● Round Digital
            </button>
            <button
              type="button"
              onClick={() => setQuickCollection('square-analog')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                quickCollection === 'square-analog'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ■ Square Analog
            </button>
            <button
              type="button"
              onClick={() => setQuickCollection('square-digital')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                quickCollection === 'square-digital'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ■ Square Digital
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {activeCollectionList.map((lp) => {
              const active = config.presetId === lp.presetId;
              const shortLabel = lp.name
                .replace(/\s*\(Round\)/gi, '')
                .replace(/\s*\(Square\)/gi, '');
              return (
                <button
                  key={lp.presetId}
                  type="button"
                  onClick={() => onSelectPreset(lp)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? quickCollection.startsWith('square')
                        ? 'bg-sky-600 text-white'
                        : 'bg-orange-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {shortLabel}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onOpenLadiesCollection}
              className="px-2.5 py-1 rounded-lg font-semibold text-amber-300 hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              + Gallery & Upscaler
            </button>
          </div>
        </div>
      </div>

      {/* Center Metallic Watch Case, Drag-and-Drop Photo Zone, and Prominent + Upload Badge */}
      <div className="my-3 flex items-center justify-center">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDropOnDial}
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
            {/* Side Crown Guard Accent */}
            <div
              className={`absolute -right-3 top-1/3 w-2.5 h-14 rounded-r-md border ${
                isLadiesLuxury
                  ? 'bg-gradient-to-b from-[#fff1f2] via-[#f4af9d] to-[#783f42] border-[#f4af9d]'
                  : 'bg-gradient-to-b from-slate-400 via-slate-600 to-slate-800 border-slate-600'
              }`}
            />
            <div
              className={`absolute -right-2.5 top-1/2 mt-4 w-2 h-9 rounded-r border ${
                isLadiesLuxury
                  ? 'bg-pink-500 border-pink-300'
                  : 'bg-orange-600 border-orange-400'
              }`}
            />

            <div
              className={`relative overflow-hidden bg-[#05070a] border border-slate-800 ${
                shape === 'round' ? 'rounded-full' : 'rounded-[48px]'
              }`}
            >
              <canvas
                ref={canvasRef}
                data-testid="watch-simulator-canvas"
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
                className={`block max-w-[320px] max-h-[350px] w-auto h-auto select-none ${
                  isDigitalLayerActive
                    ? isDraggingClock
                      ? 'cursor-grabbing touch-none'
                      : 'cursor-grab touch-none'
                    : ''
                }`}
              />
              {isDragOver && (
                <div className="absolute inset-0 bg-slate-950/75 flex items-center justify-center text-xs font-semibold text-orange-300 pointer-events-none">
                  Drop Image onto Watch Dial
                </div>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleViewportFileInput}
            className="sr-only"
            data-testid="viewport-photo-upload-input"
            aria-label="Upload Custom Dial Image file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Custom Dial Image"
            aria-label="Upload Custom Dial Image"
            data-testid="viewport-upload-plus-btn"
            className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full bg-orange-600 hover:bg-orange-500 border-2 border-[#090b10] text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Locked Real-Time System Clock Status & Sensor Controls (Zero Manual Scrubber) */}
      <section
        aria-label="Live Hardware Simulation Controls"
        className="w-full max-w-2xl rounded-xl bg-[#0e131d] border border-slate-800/90 p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium text-emerald-300">
              Auto-Synced to Device Clock
            </span>
            <span className="text-slate-500">·</span>
            <span
              data-testid="device-clock-hms"
              className="font-mono tabular-nums text-slate-100 font-semibold"
            >
              {clockSnapshot.formattedHMS}
            </span>
            <span className="text-slate-500">·</span>
            <span className="font-mono text-slate-400">
              {clockSnapshot.timezone}
            </span>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={sim.sweep60fps}
              onChange={(e) =>
                onChangeSim({ ...sim, sweep60fps: e.target.checked })
              }
              className="accent-orange-500"
            />
            Sweep Motion (vs 1Hz Tick)
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-xs">
          <label className="space-y-1 bg-[#131926] p-2.5 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1">
                <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                Battery
              </span>
              <span className="font-mono text-emerald-400">{sim.battery}%</span>
            </div>
            <input
              type="range"
              aria-label="Battery Percentage"
              min={0}
              max={100}
              value={sim.battery}
              onChange={(e) =>
                onChangeSim({ ...sim, battery: Number(e.target.value) })
              }
              className="w-full accent-emerald-500"
            />
          </label>

          <label className="space-y-1 bg-[#131926] p-2.5 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1">
                <Footprints className="w-3.5 h-3.5 text-orange-400" />
                Steps
              </span>
              <span className="font-mono text-orange-400">
                {sim.steps.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              aria-label="Steps Count"
              min={0}
              max={20000}
              step={250}
              value={sim.steps}
              onChange={(e) =>
                onChangeSim({ ...sim, steps: Number(e.target.value) })
              }
              className="w-full accent-orange-500"
            />
          </label>

          <label className="space-y-1 bg-[#131926] p-2.5 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                Heart Rate
              </span>
              <span className="font-mono text-sky-400">{sim.heartRate} BPM</span>
            </div>
            <input
              type="range"
              aria-label="Heart Rate BPM"
              min={50}
              max={180}
              value={sim.heartRate}
              onChange={(e) =>
                onChangeSim({ ...sim, heartRate: Number(e.target.value) })
              }
              className="w-full accent-sky-500"
            />
          </label>

          <label className="space-y-1 bg-[#131926] p-2.5 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                Weather
              </span>
              <span className="font-mono text-amber-400">
                {sim.temperature}°C
              </span>
            </div>
            <input
              type="range"
              aria-label="Temperature Celsius"
              min={-10}
              max={40}
              value={sim.temperature}
              onChange={(e) =>
                onChangeSim({ ...sim, temperature: Number(e.target.value) })
              }
              className="w-full accent-amber-500"
            />
          </label>
        </div>
      </section>
    </main>
  );
};
