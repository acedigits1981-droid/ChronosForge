import React from 'react';
import {
  Bluetooth,
  Download,
  FileUp,
  Gem,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  RESOLUTION_SPECS,
  ROUND_WATCH_PRESETS,
  SQUARE_WATCH_PRESETS,
  WATCH_PRESETS,
} from '../presets/watchPresets';
import {
  formatHardwareLockBadgeText,
  HardwareResolutionLock,
} from '../types/nativeBridge';
import { ResolutionSpec, WatchDisplayMode, WatchFaceConfig } from '../types/watchface';
import { usePWAInstall } from './usePWAInstall';

interface TopBarProps {
  config: WatchFaceConfig;
  displayMode: WatchDisplayMode;
  onChangeDisplayMode: (mode: WatchDisplayMode) => void;
  onSelectPreset: (preset: WatchFaceConfig) => void;
  onSelectResolution: (res: ResolutionSpec) => void;
  onOpenLadiesCollection: () => void;
  onOpenCloner: () => void;
  onOpenWebBle: () => void;
  onExportVeryFit: (compressed: boolean) => void;
  onExportFitCloud: () => void;
  onSwitchToEasy?: () => void;
  isExporting: boolean;
  hardwareLock?: HardwareResolutionLock | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  config,
  displayMode,
  onChangeDisplayMode,
  onSelectPreset,
  onSelectResolution,
  onOpenLadiesCollection,
  onOpenCloner,
  onOpenWebBle,
  onExportVeryFit,
  onExportFitCloud,
  onSwitchToEasy,
  isExporting,
  hardwareLock = null,
}) => {
  const { isInstallable, install } = usePWAInstall();

  const roundAnalog = ROUND_WATCH_PRESETS.filter(
    (p) => p.category === 'round-analog'
  );
  const roundDigital = ROUND_WATCH_PRESETS.filter(
    (p) => p.category === 'round-digital'
  );
  const squareAnalog = SQUARE_WATCH_PRESETS.filter(
    (p) => p.category === 'square-analog'
  );
  const squareDigital = SQUARE_WATCH_PRESETS.filter(
    (p) => p.category === 'square-digital'
  );

  return (
    <div className="border-b border-slate-800/90 bg-[#0c0f16]">
      {/* Primary Top Bar Contract: 3 Zones */}
      <header className="flex items-center justify-between gap-8 px-5 py-3 border-b border-slate-800/60">
        <a
          href="#studio"
          onClick={(e) => e.preventDefault()}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 font-display"
        >
          ChronosForge Studio
        </a>

        <nav
          aria-label="Studio Tools"
          className="flex items-center gap-6 text-xs font-medium text-slate-300 overflow-x-auto"
        >
          {onSwitchToEasy && (
            <button
              type="button"
              onClick={onSwitchToEasy}
              className="rounded-lg bg-emerald-600/20 border border-emerald-500/40 px-2.5 py-1 text-emerald-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer font-semibold"
            >
              Easy Mode
            </button>
          )}
          <button
            type="button"
            onClick={onOpenLadiesCollection}
            className="text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 font-semibold"
          >
            Full HD Gallery & Upscaler
          </button>
          <button
            type="button"
            onClick={onOpenCloner}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            Template Cloner (.bin / .iwf)
          </button>
          <button
            type="button"
            onClick={onOpenWebBle}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            Send to Watch
          </button>
          {isInstallable && (
            <button
              type="button"
              onClick={install}
              className="text-sky-400 hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
            >
              Install App
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {hardwareLock && (
            <span
              data-testid="topbar-hardware-lock-badge"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-950/75 border border-emerald-500/60 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 whitespace-nowrap"
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
            disabled={isExporting}
            onClick={onExportFitCloud}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export FitCloudPro (.bin)
          </button>
        </div>
      </header>

      {/* Secondary Studio Hardware Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-[#090b10]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Grouped Preset Switcher (Luxury Femme + Tactical & Chrono) */}
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span className="whitespace-nowrap font-medium text-slate-300">
              Dial Preset
            </span>
            <select
              aria-label="Dial Preset"
              value={config.presetId}
              onChange={(e) => {
                const found = WATCH_PRESETS.find(
                  (p) => p.presetId === e.target.value
                );
                if (found) onSelectPreset(found);
              }}
              className="rounded-lg bg-[#131824] border border-slate-700/80 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-orange-500"
            >
              <optgroup label="Round Category · Analog & Tourbillon">
                {roundAnalog.map((p) => (
                  <option key={p.presetId} value={p.presetId}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Round Category · Digital & Hybrid">
                {roundDigital.map((p) => (
                  <option key={p.presetId} value={p.presetId}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Square Category · Analog & Tourbillon">
                {squareAnalog.map((p) => (
                  <option key={p.presetId} value={p.presetId}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Square Category · Digital & Hybrid">
                {squareDigital.map((p) => (
                  <option key={p.presetId} value={p.presetId}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {/* 1-Click Round / Square Form Factor Switcher */}
          <div
            role="group"
            aria-label="Watch Shape Switcher"
            className="flex items-center p-0.5 rounded-lg bg-[#131824] border border-slate-700/80 text-xs"
          >
            <button
              type="button"
              disabled={Boolean(hardwareLock)}
              onClick={() => {
                if (hardwareLock) return;
                if (config.resolution.shape !== 'round') {
                  onSelectResolution(
                    config.resolution.isFullHdMaster ||
                      Math.max(config.resolution.width, config.resolution.height) >= 1000
                      ? RESOLUTION_SPECS[0]
                      : RESOLUTION_SPECS[2]
                  );
                }
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                config.resolution.shape === 'round'
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Round
            </button>
            <button
              type="button"
              disabled={Boolean(hardwareLock)}
              onClick={() => {
                if (hardwareLock) return;
                if (config.resolution.shape !== 'squircle') {
                  onSelectResolution(
                    config.resolution.isFullHdMaster ||
                      Math.max(config.resolution.width, config.resolution.height) >= 1000
                      ? RESOLUTION_SPECS[1]
                      : RESOLUTION_SPECS[6]
                  );
                }
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                config.resolution.shape === 'squircle'
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Square
            </button>
          </div>

          {/* 3-Way Watch Type Switcher: Analog / Hybrid / Pure Digital */}
          <div
            role="group"
            aria-label="Watch Type Display Mode"
            className="flex items-center p-0.5 rounded-lg bg-[#131824] border border-slate-700/80 text-xs"
          >
            {(
              [
                ['analog', 'Analog'],
                ['hybrid', 'Hybrid'],
                ['digital', 'Pure Digital'],
              ] as Array<[WatchDisplayMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={displayMode === mode}
                onClick={() => onChangeDisplayMode(mode)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  displayMode === mode
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Resolution & Full HD 1080p Selector */}
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <span className="whitespace-nowrap font-medium text-slate-300">
              Target Geometry
            </span>
            <select
              aria-label="Target Geometry"
              disabled={Boolean(hardwareLock)}
              value={hardwareLock ? '__locked__' : config.resolution.id}
              onChange={(e) => {
                if (hardwareLock) return;
                const found = RESOLUTION_SPECS.find(
                  (r) => r.id === e.target.value
                );
                if (found) onSelectResolution(found);
              }}
              className="rounded-lg bg-[#131824] border border-slate-700/80 px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-orange-500 disabled:opacity-65 disabled:cursor-not-allowed"
            >
              {hardwareLock && (
                <option value="__locked__">
                  {formatHardwareLockBadgeText(
                    hardwareLock.lcdWidth,
                    hardwareLock.lcdHeight,
                    hardwareLock.isRound
                  )}
                </option>
              )}
              {RESOLUTION_SPECS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onOpenLadiesCollection}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Gem className="w-3.5 h-3.5 text-amber-400" />
            Full HD Face Gallery
          </button>
        </div>

        {/* Firmware Package Exporters */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenCloner}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5 text-amber-400" />
            Template Cloner
          </button>

          <button
            type="button"
            onClick={onOpenWebBle}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Bluetooth className="w-3.5 h-3.5" />
            Send to Watch
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => onExportVeryFit(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 px-3 py-1.5 text-xs font-medium text-sky-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export VeryFit (.iwf)
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => onExportVeryFit(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 px-3 py-1.5 text-xs font-medium text-indigo-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Export VeryFit (.iwf.lz)
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={onExportFitCloud}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export FitCloudPro (.bin)
          </button>
        </div>
      </div>
    </div>
  );
};
