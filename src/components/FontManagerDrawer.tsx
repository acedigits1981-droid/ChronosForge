import React, { useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { CustomFontAsset, WatchFaceConfig } from '../types/watchface';
import {
  addCustomFontToConfig,
  loadCustomFontFromFile,
  removeCustomFontFromConfig,
  resolveActiveCustomFont,
  selectCustomFontInConfig,
} from '../utils/customFontManager';
import { ensureTimeWidget } from '../utils/digitalPlacement';

interface FontManagerDrawerProps {
  config: WatchFaceConfig;
  onChangeConfig: (next: WatchFaceConfig) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const FontManagerDrawer: React.FC<FontManagerDrawerProps> = ({
  config,
  onChangeConfig,
  isOpen,
  onToggleOpen,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const configRef = useRef<WatchFaceConfig>(config);
  configRef.current = config;
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const customFonts: CustomFontAsset[] = config.digital.customFonts ?? [];
  const activeCustomFont = resolveActiveCustomFont(config.digital);
  const digitalLayerVisible =
    config.layers.find((l) => l.id === 'digital')?.visible ?? true;
  const hasEnabledTimeWidget = config.digital.widgets.some(
    (w) => w.type === 'timeDigital' && w.enabled
  );

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const asset = await loadCustomFontFromFile(file);
      const next = addCustomFontToConfig(configRef.current, asset, true);
      onChangeConfig(next);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not load custom font file.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableDigitalReadout = () => {
    onChangeConfig(ensureTimeWidget(config));
  };

  return (
    <div
      data-testid="font-manager-drawer"
      className="border-b border-slate-800/80 bg-[#0d111a]"
    >
      <button
        type="button"
        data-testid="font-drawer-toggle-btn"
        aria-expanded={isOpen}
        onClick={onToggleOpen}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#121826] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Type className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold tracking-wider text-slate-200 whitespace-nowrap">
            Custom Font Drawer
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#141a28] border border-slate-700/80 text-amber-300 max-w-[104px] truncate">
            {activeCustomFont ? activeCustomFont.name : 'System Font'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 space-y-3 text-xs">
          {/* Hidden Input */}
          <input
            ref={fileInputRef}
            data-testid="font-upload-input"
            type="file"
            accept=".ttf,.otf"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Dropzone / Upload Trigger */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`rounded-xl border border-dashed p-3 text-center transition-colors ${
              isDragOver
                ? 'border-amber-400 bg-amber-500/10'
                : 'border-slate-700 bg-[#111622]'
            }`}
          >
            <button
              type="button"
              disabled={isLoading}
              data-testid="font-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 px-3 py-2 text-amber-200 font-semibold cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              {isLoading ? 'Loading Font...' : 'Upload .TTF or .OTF Font'}
            </button>
            <p className="mt-1.5 text-[10px] text-slate-400">
              Drag &amp; drop or browse TrueType (.ttf) / OpenType (.otf) files to
              rasterize into the 0–9 glyph atlas.
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg bg-rose-950/50 border border-rose-700/60 px-2.5 py-2 text-[11px] text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          {/* Built-in System Option */}
          <button
            type="button"
            data-testid="font-select-builtin-btn"
            aria-pressed={!activeCustomFont}
            onClick={() => onChangeConfig(selectCustomFontInConfig(config, null))}
            className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 border text-left transition-colors cursor-pointer ${
              !activeCustomFont
                ? 'bg-[#172032] border-amber-500/70 text-white'
                : 'bg-[#10141e] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="text-[11px] font-semibold">
                Built-In Horology Typography
              </div>
              <div className="text-[10px] text-slate-400">
                Outfit / JetBrains Mono bitmap set
              </div>
            </div>
            {!activeCustomFont && (
              <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
          </button>

          {/* Uploaded Fonts List */}
          {customFonts.length > 0 && (
            <div className="space-y-1.5" data-testid="custom-font-list">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                <span>Uploaded Fonts ({customFonts.length})</span>
                <span className="font-mono text-emerald-400">
                  Atlas Ready
                </span>
              </div>
              {customFonts.map((font) => {
                const isActive = activeCustomFont?.id === font.id;
                return (
                  <div
                    key={font.id}
                    data-testid={`font-card-${font.id}`}
                    className={`rounded-lg border p-2.5 transition-colors space-y-1.5 ${
                      isActive
                        ? 'bg-[#172032] border-amber-500/75 text-white'
                        : 'bg-[#10141e] border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label={`Use custom font ${font.name}`}
                        aria-pressed={isActive}
                        onClick={() =>
                          onChangeConfig(selectCustomFontInConfig(config, font.id))
                        }
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold truncate">
                            {font.name}
                          </span>
                          <span className="px-1 py-0.5 rounded bg-slate-800 text-[9px] font-mono uppercase text-amber-300 shrink-0">
                            {font.format}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {font.fileName} · {(font.byteSize / 1024).toFixed(1)} KB
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {isActive && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-semibold text-emerald-300">
                            <Check className="w-2.5 h-2.5" />
                            Active
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove custom font ${font.name}`}
                          onClick={() =>
                            onChangeConfig(
                              removeCustomFontFromConfig(config, font.id)
                            )
                          }
                          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Live Font Specimen */}
                    <div
                      className="rounded bg-[#090c14] border border-slate-800/80 px-2.5 py-1.5 flex items-center justify-between text-slate-100"
                      style={{
                        fontFamily: `"${font.familyName}", "Outfit", sans-serif`,
                      }}
                    >
                      <span className="text-sm font-bold tracking-wide">
                        10:24
                      </span>
                      <span className="text-[11px] text-slate-300">
                        89% · SUN 28
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(!digitalLayerVisible || !hasEnabledTimeWidget) && (
            <button
              type="button"
              data-testid="font-enable-digital-btn"
              onClick={handleEnableDigitalReadout}
              className="w-full rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 cursor-pointer"
            >
              Show Digital Time on Watch Preview
            </button>
          )}
        </div>
      )}
    </div>
  );
};
