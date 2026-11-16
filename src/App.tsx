import { useEffect, useState } from 'react';
import { buildFitCloudBin } from './compilers/fitcloudCompiler';
import { buildVeryFitPackage } from './compilers/veryfitCompiler';
import { CompilerSidebar } from './components/CompilerSidebar';
import { EasyStudio } from './components/EasyStudio';
import { PhotoPaletteContext } from './components/HslColorPicker';
import { LayerSidebar } from './components/LayerSidebar';
import { SampleUpscalerModal } from './components/SampleUpscalerModal';
import { TemplateClonerModal } from './components/TemplateClonerModal';
import { TopBar } from './components/TopBar';
import { WatchViewport } from './components/WatchViewport';
import { WebBLEUploader } from './components/WebBLEUploader';
import { compileWatchSprites } from './engine/renderer';
import { LanguageCode, SUPPORTED_LANGUAGES } from './i18n/translations';
import {
  adaptWatchFaceToResolution,
  applyDisplayMode,
  clampWatchExportResolution,
  cloneConfig,
  getDisplayMode,
  RESOLUTION_SPECS,
  WATCH_PRESETS,
} from './presets/watchPresets';
import {
  CompiledWatchAssets,
  LayerId,
  ResolutionSpec,
  SimulationState,
  WatchDisplayMode,
  WatchFaceConfig,
} from './types/watchface';
import {
  createHardwareLockedResolutionSpec,
  HardwareResolutionLock,
  isNativeConnectedState,
  NativeWatchStateDetail,
} from './types/nativeBridge';
import { ensureConfigFontsRegistered } from './utils/customFontManager';
import { loadCustomImageAndPalette } from './utils/paletteExtractor';

function triggerDownload(
  bytes: Uint8Array,
  fileName: string,
  mimeType = 'application/octet-stream'
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function detectInitialLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return 'en';
  const base = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const match = SUPPORTED_LANGUAGES.find((l) => l.code === base);
  return match ? match.code : 'en';
}

function detectInitialUiMode(): 'easy' | 'pro' {
  if (typeof window === 'undefined') return 'easy';
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'pro' ? 'pro' : 'easy';
}

export default function App() {
  const [uiMode, setUiMode] = useState<'easy' | 'pro'>(detectInitialUiMode);
  const [language, setLanguage] = useState<LanguageCode>(detectInitialLanguage);

  const [config, setConfig] = useState<WatchFaceConfig>(() =>
    cloneConfig(WATCH_PRESETS[0])
  );
  const [selectedLayer, setSelectedLayer] = useState<LayerId>('dial');

  const [sim, setSim] = useState<SimulationState>({
    timeSeconds: 10 * 3600 + 10 * 60 + 36,
    realTime: true,
    sweep60fps: true,
    battery: 92,
    steps: 12480,
    heartRate: 74,
    temperature: 22,
    hardwareRgb565Preview: false,
    fitCloudBlackGuard: true,
    fullHdMasterMode: true,
  });

  const [compiledAssets, setCompiledAssets] =
    useState<CompiledWatchAssets | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportBanner, setLastExportBanner] = useState<string | null>(null);

  const [ladiesModalOpen, setLadiesModalOpen] = useState(false);
  const [clonerOpen, setClonerOpen] = useState(false);
  const [webBleOpen, setWebBleOpen] = useState(false);
  const [hardwareLock, setHardwareLock] = useState<HardwareResolutionLock | null>(null);

  // Global listener so hardware resolution lock stays synchronized inside & outside the modal
  useEffect(() => {
    const onNativeWatchState = (ev: Event) => {
      const detail = (ev as CustomEvent<NativeWatchStateDetail>).detail;
      if (!detail || !detail.lcdWidth || !detail.lcdHeight) return;
      if (isNativeConnectedState(detail.state)) {
        const lockedSpec = createHardwareLockedResolutionSpec(
          detail.lcdWidth,
          detail.lcdHeight,
          Boolean(detail.isRound)
        );
        setHardwareLock((prev) => ({
          mac: detail.mac || prev?.mac || '',
          watchName: prev?.watchName || detail.mac || 'Connected Watch',
          lcdWidth: lockedSpec.width,
          lcdHeight: lockedSpec.height,
          isRound: Boolean(detail.isRound),
          shape: lockedSpec.shape,
          dialType: detail.dialType ?? 0,
          state: detail.state,
        }));
        setSim((prev) =>
          prev.fullHdMasterMode ? { ...prev, fullHdMasterMode: false } : prev
        );
        setConfig((prev) => adaptWatchFaceToResolution(prev, lockedSpec));
      } else if ((detail.state ?? '').toUpperCase().includes('DISCONNECT')) {
        setHardwareLock(null);
      }
    };

    window.addEventListener('native-watch-state', onNativeWatchState);
    return () => {
      window.removeEventListener('native-watch-state', onNativeWatchState);
    };
  }, []);

  // Debounced sprite atlas & memory budget compilation when inspecting Pro Studio
  useEffect(() => {
    setCompiledAssets(null);
    if (uiMode !== 'pro') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      ensureConfigFontsRegistered(config)
        .catch(() => false)
        .finally(() => {
          if (cancelled) return;
          const compiled = compileWatchSprites(config, sim);
          setCompiledAssets(compiled);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    uiMode,
    config,
    sim.battery,
    sim.steps,
    sim.heartRate,
    sim.temperature,
    sim.fitCloudBlackGuard,
  ]);

  const handleSelectPreset = (preset: WatchFaceConfig) => {
    setConfig((prev) => {
      const targetRes = hardwareLock
        ? createHardwareLockedResolutionSpec(
            hardwareLock.lcdWidth,
            hardwareLock.lcdHeight,
            hardwareLock.isRound
          )
        : (() => {
            const isCurrentlyFhd =
              prev.resolution.isFullHdMaster ||
              Math.max(prev.resolution.width, prev.resolution.height) >= 1000;
            return prev.resolution.shape === preset.resolution.shape
              ? prev.resolution
              : isCurrentlyFhd
              ? preset.resolution
              : preset.resolution.shape === 'round'
              ? RESOLUTION_SPECS[2]
              : RESOLUTION_SPECS[6];
          })();

      const adapted = adaptWatchFaceToResolution(preset, targetRes);
      if (prev.digital.customFonts && prev.digital.customFonts.length > 0) {
        adapted.digital.customFonts = prev.digital.customFonts;
        adapted.digital.activeCustomFontId = prev.digital.activeCustomFontId ?? null;
      }
      return adapted;
    });
  };

  const handleSelectResolution = (res: ResolutionSpec) => {
    if (hardwareLock) return;
    setConfig((prev) => adaptWatchFaceToResolution(prev, res));
  };

  const handleChangeDisplayMode = (mode: WatchDisplayMode) => {
    setConfig((prev) => applyDisplayMode(prev, mode));
  };

  const [artworkPalette, setArtworkPalette] = useState<string[]>([]);

  useEffect(() => {
    const intactUrl = config.dial.intactArtworkUrl;
    if (!intactUrl) {
      setArtworkPalette([]);
      return;
    }
    let cancelled = false;
    loadCustomImageAndPalette(intactUrl)
      .then(({ palette }) => {
        if (!cancelled) setArtworkPalette(palette);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config.dial.intactArtworkUrl]);

  const handleChangeSim = (next: SimulationState) => {
    setSim(next);
  };

  const handleExportVeryFit = async (compressedLz: boolean) => {
    setIsExporting(true);
    try {
      const slug = config.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const exportSpec = clampWatchExportResolution(
        config.resolution,
        hardwareLock
      );
      const exportConfig =
        config.resolution.width === exportSpec.width &&
        config.resolution.height === exportSpec.height &&
        config.resolution.shape === exportSpec.shape
          ? config
          : adaptWatchFaceToResolution(config, exportSpec);
      const reusableAssets =
        compiledAssets &&
        compiledAssets.width === exportSpec.width &&
        compiledAssets.height === exportSpec.height
          ? compiledAssets
          : undefined;
      const pkg = await buildVeryFitPackage(
        exportConfig,
        sim,
        'lz4',
        reusableAssets
      );
      if (compressedLz) {
        const fname = `${slug}_${exportSpec.id}.iwf.lz`;
        triggerDownload(pkg.iwfLzBytes, fname);
        setLastExportBanner(
          `Exported VeryFit LZ4 package: ${fname} (${(
            pkg.iwfLzBytes.byteLength / 1024
          ).toFixed(1)} KB)`
        );
      } else {
        const fname = `${slug}_${exportSpec.id}.iwf`;
        triggerDownload(pkg.iwfBytes, fname);
        setLastExportBanner(
          `Exported VeryFit IWF archive: ${fname} (${(
            pkg.iwfBytes.byteLength / 1024
          ).toFixed(1)} KB)`
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportFitCloud = () => {
    setIsExporting(true);
    try {
      const slug = config.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const exportSpec = clampWatchExportResolution(
        config.resolution,
        hardwareLock
      );
      const exportConfig =
        config.resolution.width === exportSpec.width &&
        config.resolution.height === exportSpec.height &&
        config.resolution.shape === exportSpec.shape
          ? config
          : adaptWatchFaceToResolution(config, exportSpec);
      const reusableAssets =
        compiledAssets &&
        compiledAssets.width === exportSpec.width &&
        compiledAssets.height === exportSpec.height
          ? compiledAssets
          : undefined;
      const binBytes = buildFitCloudBin(
        exportConfig,
        sim,
        reusableAssets
      );
      const fname = `${slug}_${exportSpec.id}_tbui.bin`;
      triggerDownload(binBytes, fname);
      setLastExportBanner(
        `Exported FitCloudPro TBUI binary: ${fname} (${(
          binBytes.byteLength / 1024
        ).toFixed(1)} KB, #080808 guard active)`
      );
    } finally {
      setIsExporting(false);
    }
  };

  const extractedPhotoPalette =
    config.dial.customImage?.enabled &&
    config.dial.customImage.extractedPalette.length > 0
      ? config.dial.customImage.extractedPalette
      : artworkPalette;
  const activeDisplayMode = getDisplayMode(config);

  const anyModalOpen = webBleOpen || ladiesModalOpen || clonerOpen;

  return (
    <PhotoPaletteContext.Provider value={extractedPhotoPalette}>
      {uiMode === 'easy' ? (
        <EasyStudio
          config={config}
          sim={sim}
          language={language}
          onChangeLanguage={setLanguage}
          onSwitchToPro={() => setUiMode('pro')}
          onChangeConfig={setConfig}
          onChangeSim={handleChangeSim}
          onSelectPreset={handleSelectPreset}
          onSelectResolution={handleSelectResolution}
          onOpenLadiesCollection={() => setLadiesModalOpen(true)}
          onOpenWebBle={() => setWebBleOpen(true)}
          onExportFitCloud={handleExportFitCloud}
          onExportVeryFit={handleExportVeryFit}
          isExporting={isExporting}
          lastExportBanner={lastExportBanner}
          onDismissBanner={() => setLastExportBanner(null)}
          pauseRender={anyModalOpen}
          hardwareLock={hardwareLock}
        />
      ) : (
        <div className="min-h-screen lg:h-screen flex flex-col bg-[#090b0f] text-slate-100 overflow-x-hidden">
          <TopBar
            config={config}
            displayMode={activeDisplayMode}
            onChangeDisplayMode={handleChangeDisplayMode}
            onSelectPreset={handleSelectPreset}
            onSelectResolution={handleSelectResolution}
            onOpenLadiesCollection={() => setLadiesModalOpen(true)}
            onOpenCloner={() => setClonerOpen(true)}
            onOpenWebBle={() => setWebBleOpen(true)}
            onExportVeryFit={handleExportVeryFit}
            onExportFitCloud={handleExportFitCloud}
            onSwitchToEasy={() => setUiMode('easy')}
            isExporting={isExporting}
            hardwareLock={hardwareLock}
          />

          {lastExportBanner && (
            <div className="flex items-center justify-between px-5 py-1.5 bg-emerald-950/70 border-b border-emerald-700/50 text-xs text-emerald-200 font-mono">
              <span>{lastExportBanner}</span>
              <button
                type="button"
                onClick={() => setLastExportBanner(null)}
                className="text-emerald-400 hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex-1 flex flex-col lg:flex-row min-h-0">
            <LayerSidebar
              config={config}
              selectedLayer={selectedLayer}
              onSelectLayer={setSelectedLayer}
              onChangeConfig={setConfig}
            />

            <WatchViewport
              config={config}
              sim={sim}
              onChangeConfig={setConfig}
              onChangeSim={handleChangeSim}
              onSelectPreset={handleSelectPreset}
              onSelectResolution={handleSelectResolution}
              onOpenLadiesCollection={() => setLadiesModalOpen(true)}
              pauseRender={anyModalOpen}
              hardwareLock={hardwareLock}
            />

            <CompilerSidebar assets={compiledAssets} />
          </div>
        </div>
      )}

      <SampleUpscalerModal
        isOpen={ladiesModalOpen}
        onClose={() => setLadiesModalOpen(false)}
        currentConfig={config}
        onApplyEnhancedDial={(nextCfg) => {
          const finalCfg = hardwareLock
            ? adaptWatchFaceToResolution(
                nextCfg,
                createHardwareLockedResolutionSpec(
                  hardwareLock.lcdWidth,
                  hardwareLock.lcdHeight,
                  hardwareLock.isRound
                )
              )
            : nextCfg;
          setConfig(finalCfg);
          setLastExportBanner(
            `Activated ${finalCfg.name} at ${finalCfg.resolution.width}×${finalCfg.resolution.height}px`
          );
        }}
      />

      <TemplateClonerModal
        isOpen={clonerOpen}
        onClose={() => setClonerOpen(false)}
        config={config}
        sim={sim}
        onDownloadBytes={(bytes, name) => {
          triggerDownload(bytes, name);
          setLastExportBanner(
            `Cloned hardware watch face container: ${name} (${(
              bytes.byteLength / 1024
            ).toFixed(1)} KB)`
          );
        }}
      />

      <WebBLEUploader
        isOpen={webBleOpen}
        onClose={() => setWebBleOpen(false)}
        config={config}
        sim={sim}
        hardwareLock={hardwareLock}
        onHardwareLockChange={setHardwareLock}
      />
    </PhotoPaletteContext.Provider>
  );
}
