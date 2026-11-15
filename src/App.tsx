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

  // Debounced sprite atlas & memory budget compilation when inspecting Pro Studio
  useEffect(() => {
    if (uiMode !== 'pro') return;
    const timer = window.setTimeout(() => {
      const compiled = compileWatchSprites(config, sim);
      setCompiledAssets(compiled);
    }, 120);
    return () => window.clearTimeout(timer);
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
      const isCurrentlyFhd =
        prev.resolution.isFullHdMaster ||
        Math.max(prev.resolution.width, prev.resolution.height) >= 1000;
      const targetRes =
        prev.resolution.shape === preset.resolution.shape
          ? prev.resolution
          : isCurrentlyFhd
          ? preset.resolution
          : preset.resolution.shape === 'round'
          ? RESOLUTION_SPECS[2]
          : RESOLUTION_SPECS[6];
      return adaptWatchFaceToResolution(preset, targetRes);
    });
  };

  const handleSelectResolution = (res: ResolutionSpec) => {
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
      const assetsForExport =
        compiledAssets ?? compileWatchSprites(config, sim);
      const pkg = await buildVeryFitPackage(
        config,
        sim,
        'lz4',
        assetsForExport
      );
      if (compressedLz) {
        const fname = `${slug}_${config.resolution.id}.iwf.lz`;
        triggerDownload(pkg.iwfLzBytes, fname);
        setLastExportBanner(
          `Exported VeryFit LZ4 package: ${fname} (${(
            pkg.iwfLzBytes.byteLength / 1024
          ).toFixed(1)} KB)`
        );
      } else {
        const fname = `${slug}_${config.resolution.id}.iwf`;
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
      const assetsForExport =
        compiledAssets ?? compileWatchSprites(config, sim);
      const binBytes = buildFitCloudBin(
        config,
        sim,
        assetsForExport
      );
      const fname = `${slug}_${config.resolution.id}_tbui.bin`;
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
          setConfig(nextCfg);
          setLastExportBanner(
            `Activated ${nextCfg.name} at ${nextCfg.resolution.width}×${nextCfg.resolution.height}px`
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
      />
    </PhotoPaletteContext.Provider>
  );
}
