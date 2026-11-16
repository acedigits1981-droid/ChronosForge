import React, { useRef } from 'react';
import { ImagePlus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { createDefaultCustomImageConfig } from '../presets/watchPresets';
import { CustomDialImageConfig, WatchFaceConfig } from '../types/watchface';
import {
  loadCustomImageAndPalette,
  readImageFileAsDataUrl,
} from '../utils/paletteExtractor';
import { HslColorPicker } from './HslColorPicker';

export async function processUploadedDialImageFile(
  file: File,
  currentConfig: WatchFaceConfig,
  onChangeConfig: (next: WatchFaceConfig) => void
): Promise<void> {
  if (!file.type.startsWith('image/')) return;
  const dataUrl = await readImageFileAsDataUrl(file);
  const { palette } = await loadCustomImageAndPalette(dataUrl);
  const existing = currentConfig.dial.customImage ?? createDefaultCustomImageConfig();
  const nextCustom: CustomDialImageConfig = {
    ...existing,
    enabled: true,
    dataUrl,
    fileName: file.name,
    extractedPalette: palette,
  };
  onChangeConfig({
    ...currentConfig,
    layers: currentConfig.layers.map((l) =>
      l.id === 'bezel' ? { ...l, visible: true } : l
    ),
    bezel: {
      ...currentConfig.bezel,
      style:
        currentConfig.bezel.style === 'minimal'
          ? 'minuteTrack'
          : currentConfig.bezel.style,
      lumePips: true,
    },
    dial: {
      ...currentConfig.dial,
      recessedAoDepth: Math.max(currentConfig.dial.recessedAoDepth ?? 0.4, 0.58),
      customImage: nextCustom,
    },
  });
}

interface CustomImageUploadControlsProps {
  config: WatchFaceConfig;
  onChangeConfig: (next: WatchFaceConfig) => void;
  activeColorId?: string | null;
  onToggleColorPicker?: (id: string) => void;
  compact?: boolean;
}

export const CustomImageUploadControls: React.FC<
  CustomImageUploadControlsProps
> = ({
  config,
  onChangeConfig,
  activeColorId,
  onToggleColorPicker,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const custom = config.dial.customImage ?? createDefaultCustomImageConfig();

  const updateCustom = (patch: Partial<CustomDialImageConfig>) => {
    onChangeConfig({
      ...config,
      dial: {
        ...config.dial,
        customImage: {
          ...custom,
          ...patch,
        },
      },
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processUploadedDialImageFile(file, config, onChangeConfig);
  };

  return (
    <div className="rounded-xl bg-[#111622] border border-slate-800 p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-200 flex items-center gap-1.5">
          <ImagePlus className="w-3.5 h-3.5 text-orange-400" />
          Custom Dial Image
        </span>
        {custom.enabled && custom.dataUrl && (
          <button
            type="button"
            onClick={() =>
              updateCustom({
                enabled: false,
                dataUrl: '',
                fileName: '',
                extractedPalette: [],
              })
            }
            className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Upload custom dial image file"
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-orange-500/60 bg-orange-500/10 hover:bg-orange-500/20 px-3 py-2 font-semibold text-orange-200 transition-colors cursor-pointer"
      >
        <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold leading-none">
          +
        </span>
        <span className="truncate">
          {custom.enabled && custom.fileName
            ? `Replace: ${custom.fileName}`
            : 'Upload Custom Dial Image'}
        </span>
      </button>

      {custom.enabled && custom.dataUrl && (
        <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
          {custom.extractedPalette.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-pink-300">
                <span className="flex items-center gap-1 font-medium">
                  <Sparkles className="w-3 h-3 text-pink-400" />
                  Match Photo Palette
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateCustom({
                      zoom: 1,
                      panX: 0,
                      panY: 0,
                      rotationDeg: 0,
                      brightness: 1,
                      contrast: 1,
                      vignette: 0.35,
                      tintOpacity: 0,
                    })
                  }
                  className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Reset Frame
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {custom.extractedPalette.map((hex, idx) => (
                  <button
                    key={`${hex}-${idx}`}
                    type="button"
                    title={`Apply Match Photo accent ${hex}`}
                    aria-label={`Apply extracted photo color ${hex}`}
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        bezel: { ...config.bezel, accentColor: hex },
                        hands: { ...config.hands, secondHandColor: hex },
                        digital: { ...config.digital, glowColor: hex },
                      })
                    }
                    className="h-6 rounded-md border border-white/25 hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Framing & Optics Sliders */}
          <label className="block space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Zoom</span>
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(custom.zoom * 100)}%
              </span>
            </div>
            <input
              type="range"
              aria-label="Custom Image Zoom"
              min={0.5}
              max={2.5}
              step={0.02}
              value={custom.zoom}
              onChange={(e) => updateCustom({ zoom: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Pan X</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {Math.round(custom.panX * 100)}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Custom Image Pan X"
                min={-1}
                max={1}
                step={0.02}
                value={custom.panX}
                onChange={(e) => updateCustom({ panX: Number(e.target.value) })}
                className="w-full accent-orange-500"
              />
            </label>
            <label className="block space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Pan Y</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {Math.round(custom.panY * 100)}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Custom Image Pan Y"
                min={-1}
                max={1}
                step={0.02}
                value={custom.panY}
                onChange={(e) => updateCustom({ panY: Number(e.target.value) })}
                className="w-full accent-orange-500"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Rotation</span>
              <span className="font-mono tabular-nums text-slate-200">
                {custom.rotationDeg}°
              </span>
            </div>
            <input
              type="range"
              aria-label="Custom Image Rotation"
              min={-180}
              max={180}
              step={1}
              value={custom.rotationDeg}
              onChange={(e) =>
                updateCustom({ rotationDeg: Number(e.target.value) })
              }
              className="w-full accent-orange-500"
            />
          </label>

          {!compact && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Brightness</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {Math.round(custom.brightness * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Custom Image Brightness"
                    min={0.4}
                    max={1.8}
                    step={0.02}
                    value={custom.brightness}
                    onChange={(e) =>
                      updateCustom({ brightness: Number(e.target.value) })
                    }
                    className="w-full accent-sky-500"
                  />
                </label>
                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Contrast</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {Math.round(custom.contrast * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Custom Image Contrast"
                    min={0.4}
                    max={1.8}
                    step={0.02}
                    value={custom.contrast}
                    onChange={(e) =>
                      updateCustom({ contrast: Number(e.target.value) })
                    }
                    className="w-full accent-sky-500"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Edge Vignette</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {Math.round(custom.vignette * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Custom Image Edge Vignette"
                  min={0}
                  max={1}
                  step={0.02}
                  value={custom.vignette}
                  onChange={(e) =>
                    updateCustom({ vignette: Number(e.target.value) })
                  }
                  className="w-full accent-orange-500"
                />
              </label>

              <div className="space-y-1.5 pt-1">
                <HslColorPicker
                  id="photo-tint-color"
                  label="Photo Overlay Tint"
                  compact
                  value={custom.tintColor}
                  isOpen={activeColorId === 'photo-tint-color'}
                  onToggleOpen={onToggleColorPicker}
                  onChange={(hex) => updateCustom({ tintColor: hex })}
                />
                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Tint Blend Opacity</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {Math.round(custom.tintOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Photo Tint Blend Opacity"
                    min={0}
                    max={0.85}
                    step={0.02}
                    value={custom.tintOpacity}
                    onChange={(e) =>
                      updateCustom({ tintOpacity: Number(e.target.value) })
                    }
                    className="w-full accent-orange-500"
                  />
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
