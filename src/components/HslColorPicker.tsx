import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pipette, Sparkles } from 'lucide-react';
import {
  clamp,
  formatHslSummary,
  HOROLOGY_COLOR_SWATCHES,
  hexToHsl,
  HslColor,
  hslToHex,
  normalizeHex,
} from '../utils/colorUtils';

export const PhotoPaletteContext = createContext<string[]>([]);

interface HslColorPickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
  isOpen?: boolean;
  onToggleOpen?: (id: string) => void;
  compact?: boolean;
  photoPalette?: string[];
}

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

export const HslColorPicker: React.FC<HslColorPickerProps> = ({
  id,
  label,
  value,
  onChange,
  isOpen: controlledOpen,
  onToggleOpen,
  compact = false,
  photoPalette,
}) => {
  const ctxPalette = useContext(PhotoPaletteContext);
  const resolvedPhotoPalette =
    photoPalette && photoPalette.length > 0 ? photoPalette : ctxPalette;

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const normalizedPropHex = normalizeHex(value) ?? '#ffffff';
  const [hsl, setHsl] = useState<HslColor>(() => hexToHsl(normalizedPropHex));
  const [hexDraft, setHexDraft] = useState<string>(normalizedPropHex);
  const lastEmittedHexRef = useRef<string>(normalizedPropHex);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const nativeColorRef = useRef<HTMLInputElement | null>(null);

  // Sync from external prop changes (e.g., switching presets or external reset),
  // without clobbering hue/saturation when we ourselves just emitted the hex.
  useEffect(() => {
    const nextNorm = normalizeHex(value);
    if (!nextNorm) return;
    if (nextNorm !== lastEmittedHexRef.current) {
      lastEmittedHexRef.current = nextNorm;
      setHsl(hexToHsl(nextNorm));
      setHexDraft(nextNorm);
    } else if (hexDraft.toLowerCase() !== nextNorm) {
      setHexDraft(nextNorm);
    }
  }, [value, hexDraft]);

  const commitHsl = (nextHsl: HslColor) => {
    const clampedHsl: HslColor = {
      h: ((Math.round(nextHsl.h) % 360) + 360) % 360,
      s: Math.round(clamp(nextHsl.s, 0, 100)),
      l: Math.round(clamp(nextHsl.l, 0, 100)),
    };
    const nextHex = hslToHex(clampedHsl.h, clampedHsl.s, clampedHsl.l);
    lastEmittedHexRef.current = nextHex;
    setHsl(clampedHsl);
    setHexDraft(nextHex);
    onChange(nextHex);
  };

  const commitHex = (rawHex: string) => {
    const norm = normalizeHex(rawHex);
    if (!norm) return;
    lastEmittedHexRef.current = norm;
    setHsl(hexToHsl(norm));
    setHexDraft(norm);
    onChange(norm);
  };

  const handleToggle = () => {
    if (onToggleOpen) {
      onToggleOpen(id);
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  const updatePlaneFromPointer = (clientX: number, clientY: number) => {
    const plane = planeRef.current;
    if (!plane) return;
    const rect = plane.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const rx = clamp((clientX - rect.left) / rect.width, 0, 1);
    const ry = clamp((clientY - rect.top) / rect.height, 0, 1);
    commitHsl({
      h: hsl.h,
      s: Math.round(rx * 100),
      l: Math.round((1 - ry) * 100),
    });
  };

  const handlePlanePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePlaneFromPointer(e.clientX, e.clientY);
  };

  const handlePlanePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updatePlaneFromPointer(e.clientX, e.clientY);
  };

  const handlePlanePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const currentHex = normalizeHex(value) ?? hexDraft;

  const handleEyedropper = async () => {
    if (typeof window !== 'undefined' && window.EyeDropper) {
      try {
        const eye = new window.EyeDropper();
        const res = await eye.open();
        if (res?.sRGBHex) {
          commitHex(res.sRGBHex);
          return;
        }
      } catch {
        // User cancelled or browser blocked; fall through safely
      }
    }
    nativeColorRef.current?.click();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-label={`Edit ${label} color`}
          className={`w-full flex items-center justify-between gap-2 rounded-lg border text-left transition-colors cursor-pointer ${
            compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
          } ${
            isOpen
              ? 'bg-[#171d2c] border-orange-500/60 text-slate-100'
              : 'bg-[#131824] border-slate-700/90 text-slate-200 hover:border-slate-600'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              className="w-4 h-4 rounded border border-white/25 shrink-0 shadow-inner"
              style={{ backgroundColor: currentHex }}
            />
            <span className="text-[11px] font-medium truncate">{label}</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono tabular-nums text-slate-400 uppercase">
              {currentHex}
            </span>
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-orange-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </span>
        </button>
      </div>

      {isOpen && (
        <div
          data-testid={`hsl-studio-${id}`}
          className="rounded-lg bg-[#0f141f] border border-slate-700/90 p-2.5 space-y-2.5"
        >
          {/* Header summary + Eyedropper */}
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-medium text-slate-300 flex items-center gap-1.5">
              <Pipette className="w-3 h-3 text-orange-400" />
              Horological Color Picker
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums text-slate-300">
                {formatHslSummary(hsl)}
              </span>
              <button
                type="button"
                onClick={handleEyedropper}
                title="Pick color with Eyedropper"
                aria-label={`${label} Eyedropper`}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-200 cursor-pointer"
              >
                <Pipette className="w-2.5 h-2.5 text-sky-400" />
                <span>Pick</span>
              </button>
              <input
                ref={nativeColorRef}
                type="color"
                aria-hidden="true"
                tabIndex={-1}
                value={currentHex}
                onChange={(e) => commitHex(e.target.value)}
                className="sr-only"
              />
            </div>
          </div>

          {/* 2D Saturation × Lightness Plane */}
          <div
            ref={planeRef}
            data-testid={`hsl-plane-${id}`}
            role="application"
            aria-label={`${label} saturation and lightness plane`}
            onPointerDown={handlePlanePointerDown}
            onPointerMove={handlePlanePointerMove}
            onPointerUp={handlePlanePointerUp}
            onPointerCancel={handlePlanePointerUp}
            className="relative w-full h-28 rounded-md overflow-hidden border border-slate-700 cursor-crosshair touch-none select-none"
            style={{
              backgroundImage: `linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 50%, #000000 100%), linear-gradient(to right, hsl(${hsl.h}, 0%, 50%), hsl(${hsl.h}, 100%, 50%))`,
            }}
          >
            <div
              className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-slate-950/90 shadow pointer-events-none"
              style={{
                left: `${hsl.s}%`,
                top: `${100 - hsl.l}%`,
                backgroundColor: currentHex,
              }}
            />
          </div>

          {/* Hue, Saturation, Lightness Sliders */}
          <div className="space-y-2">
            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Hue</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {hsl.h}°
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                aria-label={`${label} Hue`}
                value={hsl.h}
                onChange={(e) =>
                  commitHsl({ ...hsl, h: Number(e.target.value) })
                }
                style={{
                  background:
                    'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                }}
                className="w-full h-2.5 rounded-full appearance-none cursor-pointer border border-slate-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-900 [&::-webkit-slider-thumb]:shadow"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Saturation</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {hsl.s}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                aria-label={`${label} Saturation`}
                value={hsl.s}
                onChange={(e) =>
                  commitHsl({ ...hsl, s: Number(e.target.value) })
                }
                style={{
                  background: `linear-gradient(to right, hsl(${hsl.h}, 0%, ${hsl.l}%), hsl(${hsl.h}, 100%, ${hsl.l}%))`,
                }}
                className="w-full h-2.5 rounded-full appearance-none cursor-pointer border border-slate-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-900 [&::-webkit-slider-thumb]:shadow"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Lightness</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {hsl.l}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                aria-label={`${label} Lightness`}
                value={hsl.l}
                onChange={(e) =>
                  commitHsl({ ...hsl, l: Number(e.target.value) })
                }
                style={{
                  background: `linear-gradient(to right, #000000 0%, hsl(${hsl.h}, ${hsl.s}%, 50%) 50%, #ffffff 100%)`,
                }}
                className="w-full h-2.5 rounded-full appearance-none cursor-pointer border border-slate-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-slate-900 [&::-webkit-slider-thumb]:shadow"
              />
            </label>
          </div>

          {/* Numeric H/S/L + Hex Direct Inputs */}
          <div className="grid grid-cols-5 gap-1.5 pt-0.5">
            <label className="col-span-2 space-y-0.5">
              <span className="block text-[10px] text-slate-400">Hex</span>
              <input
                type="text"
                aria-label={`${label} Hex value`}
                value={hexDraft}
                onChange={(e) => {
                  const val = e.target.value;
                  setHexDraft(val);
                  if (normalizeHex(val)) {
                    commitHex(val);
                  }
                }}
                onBlur={() => {
                  const norm = normalizeHex(hexDraft);
                  setHexDraft(norm ?? currentHex);
                }}
                className="w-full rounded bg-[#151b29] border border-slate-700 px-1.5 py-1 text-[11px] font-mono tabular-nums text-slate-100 uppercase focus:outline-none focus:border-orange-500"
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[10px] text-slate-400">H</span>
              <input
                type="number"
                min={0}
                max={359}
                aria-label={`${label} Hue number`}
                value={hsl.h}
                onChange={(e) =>
                  commitHsl({ ...hsl, h: Number(e.target.value) || 0 })
                }
                className="w-full rounded bg-[#151b29] border border-slate-700 px-1 py-1 text-[11px] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[10px] text-slate-400">S%</span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label={`${label} Saturation number`}
                value={hsl.s}
                onChange={(e) =>
                  commitHsl({ ...hsl, s: Number(e.target.value) || 0 })
                }
                className="w-full rounded bg-[#151b29] border border-slate-700 px-1 py-1 text-[11px] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[10px] text-slate-400">L%</span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label={`${label} Lightness number`}
                value={hsl.l}
                onChange={(e) =>
                  commitHsl({ ...hsl, l: Number(e.target.value) || 0 })
                }
                className="w-full rounded bg-[#151b29] border border-slate-700 px-1 py-1 text-[11px] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-orange-500"
              />
            </label>
          </div>

          {/* 5 Auto-Extracted "Match Photo" Swatches (shown when custom image uploaded) */}
          {resolvedPhotoPalette.length > 0 && (
            <div className="pt-1.5 border-t border-slate-800/80 space-y-1">
              <span className="flex items-center gap-1 text-[10px] font-medium text-pink-300">
                <Sparkles className="w-3 h-3 text-pink-400" />
                Match Photo
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {resolvedPhotoPalette.map((hex, idx) => {
                  const isMatch = currentHex.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={`${hex}-${idx}`}
                      type="button"
                      title={`Match Photo ${idx + 1} (${hex})`}
                      aria-label={`${label} Match Photo swatch ${idx + 1}`}
                      onClick={() => commitHex(hex)}
                      className={`h-5 rounded border transition-transform cursor-pointer hover:scale-105 ${
                        isMatch
                          ? 'border-white ring-1 ring-pink-400'
                          : 'border-white/25'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 10 Curated Watchmaker Presets */}
          <div className="pt-1 border-t border-slate-800/80 space-y-1">
            <span className="block text-[10px] text-slate-400">
              Watchmaker Presets
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {HOROLOGY_COLOR_SWATCHES.map((swatch) => {
                const isMatch = currentHex.toLowerCase() === swatch.hex;
                return (
                  <button
                    key={swatch.name}
                    type="button"
                    title={`${swatch.name} (${swatch.hex})`}
                    aria-label={`${label} swatch ${swatch.name}`}
                    onClick={() => commitHex(swatch.hex)}
                    className={`h-5 rounded border transition-transform cursor-pointer hover:scale-105 ${
                      isMatch
                        ? 'border-white ring-1 ring-orange-400'
                        : 'border-white/20'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
