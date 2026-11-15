import React, { useState } from 'react';
import {
  CheckCircle2,
  FileUp,
  Gem,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  RESOLUTION_SPECS,
  ROUND_WATCH_PRESETS,
  SQUARE_WATCH_PRESETS,
  adaptWatchFaceToResolution,
  cloneConfig,
} from '../presets/watchPresets';
import { WatchFaceConfig } from '../types/watchface';

interface SampleUpscalerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: WatchFaceConfig;
  onApplyEnhancedDial: (nextConfig: WatchFaceConfig) => void;
}

interface ExtractedPalette {
  fileName: string;
  origWidth: number;
  origHeight: number;
  dominantHex: string;
  secondaryHex: string;
  accentHex: string;
  recommendedMaterial: WatchFaceConfig['dial']['material'];
  recommendedBezel: WatchFaceConfig['bezel']['style'];
  previewUrl: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(8, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

export const SampleUpscalerModal: React.FC<SampleUpscalerModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onApplyEnhancedDial,
}) => {
  const [extracted, setExtracted] = useState<ExtractedPalette | null>(
    null
  );
  const [shapeTab, setShapeTab] = useState<'round' | 'square'>(() =>
    currentConfig.resolution.shape === 'squircle' ? 'square' : 'round'
  );
  const [targetFullHd, setTargetFullHd] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const galleryPresets =
    shapeTab === 'round' ? ROUND_WATCH_PRESETS : SQUARE_WATCH_PRESETS;

  const handleSampleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 64;
        sampleCanvas.height = 64;
        const sctx = sampleCanvas.getContext('2d', {
          willReadFrequently: true,
        })!;
        sctx.drawImage(img, 0, 0, 64, 64);
        const pixels = sctx.getImageData(0, 0, 64, 64).data;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let brightR = 244;
        let brightG = 175;
        let brightB = 157;
        let maxSat = -1;
        let count = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const a = pixels[i + 3];
          if (a < 128) continue;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          rSum += r;
          gSum += g;
          bSum += b;
          count++;

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC - minC;
          if (sat > maxSat && maxC > 90) {
            maxSat = sat;
            brightR = r;
            brightG = g;
            brightB = b;
          }
        }

        const avgR = count > 0 ? rSum / count : 45;
        const avgG = count > 0 ? gSum / count : 28;
        const avgB = count > 0 ? bSum / count : 36;
        const lum = (avgR + avgG + avgB) / 3;

        const dominantHex = rgbToHex(avgR, avgG, avgB);
        const secondaryHex = rgbToHex(
          Math.min(255, avgR * 1.35 + 24),
          Math.min(255, avgG * 1.35 + 20),
          Math.min(255, avgB * 1.35 + 28)
        );
        const accentHex = rgbToHex(brightR, brightG, brightB);

        const recommendedMaterial: WatchFaceConfig['dial']['material'] =
          lum > 165
            ? 'motherOfPearl'
            : avgR > avgB + 15
            ? 'roseGoldGuilloche'
            : avgB > avgR + 15
            ? 'celestialAventurine'
            : 'silkBlushEnamel';

        setExtracted({
          fileName: file.name,
          origWidth: img.naturalWidth || 240,
          origHeight: img.naturalHeight || 240,
          dominantHex,
          secondaryHex,
          accentHex,
          recommendedMaterial,
          recommendedBezel: lum > 150 ? 'diamondPave' : 'flutedRoseGold',
          previewUrl: dataUrl,
        });
        setStatusMsg(
          `Analyzed sample (${img.naturalWidth}×${img.naturalHeight}px) — Ready to reconstruct as 1080×1080 Full HD Dial.`
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleReconstructFromSample = () => {
    if (!extracted) return;
    const isSquare = currentConfig.resolution.shape === 'squircle';
    const targetRes = isSquare
      ? targetFullHd
        ? RESOLUTION_SPECS[1]
        : RESOLUTION_SPECS[6]
      : targetFullHd
      ? RESOLUTION_SPECS[0]
      : RESOLUTION_SPECS[2];
    const basePreset = adaptWatchFaceToResolution(
      cloneConfig(
        isSquare ? SQUARE_WATCH_PRESETS[0] : ROUND_WATCH_PRESETS[0]
      ),
      targetRes
    );

    const next: WatchFaceConfig = {
      ...basePreset,
      name: `Full HD Custom (${extracted.fileName.replace(/\.[^.]+$/, '')})`,
      layers: basePreset.layers.map((l) =>
        l.id === 'bezel' || l.id === 'hands' ? { ...l, visible: true } : l
      ),
      bezel: {
        ...basePreset.bezel,
        style: extracted.recommendedBezel,
        primaryColor: extracted.dominantHex,
        accentColor: extracted.accentHex,
      },
      dial: {
        ...basePreset.dial,
        intactArtworkUrl: undefined,
        material: extracted.recommendedMaterial,
        baseColor: extracted.dominantHex,
        secondaryColor: extracted.secondaryHex,
        customImage: {
          enabled: true,
          dataUrl: extracted.previewUrl,
          fileName: extracted.fileName,
          zoom: 1,
          panX: 0,
          panY: 0,
          rotationDeg: 0,
          brightness: 1,
          contrast: 1,
          vignette: 0.3,
          tintColor: extracted.dominantHex,
          tintOpacity: 0,
          extractedPalette: [
            extracted.dominantHex,
            extracted.secondaryHex,
            extracted.accentHex,
            '#f8fafc',
            '#18181b',
          ],
        },
      },
      hands: {
        ...basePreset.hands,
        enabled: true,
        style: 'feuilleLeaf',
        finish: 'roseGold18k',
        secondHandColor: extracted.accentHex,
      },
    };

    onApplyEnhancedDial(next);
    onClose();
  };

  const handleSelectGalleryPreset = (preset: WatchFaceConfig) => {
    const isSquare = preset.resolution.shape === 'squircle';
    const targetRes = isSquare
      ? targetFullHd
        ? RESOLUTION_SPECS[1]
        : RESOLUTION_SPECS[6]
      : targetFullHd
      ? RESOLUTION_SPECS[0]
      : RESOLUTION_SPECS[2];
    const next = adaptWatchFaceToResolution(preset, targetRes);
    onApplyEnhancedDial(next);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ladies-upscaler-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-4xl rounded-2xl bg-[#0e131d] border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#121826]">
          <div className="flex items-center gap-2.5">
            <Gem className="w-5 h-5 text-amber-400" />
            <h2
              id="ladies-upscaler-title"
              className="text-base font-bold text-slate-100 font-display"
            >
              Separated Round & Square Full HD Gallery · Photo Upscaler
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Gallery Modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Separated Round vs Square Selector + Full HD Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-amber-950/35 via-[#151c2c] to-sky-950/35 border border-amber-500/30 p-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShapeTab('round')}
                className={`px-3.5 py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                  shapeTab === 'round'
                    ? 'bg-orange-600 text-white'
                    : 'bg-[#0d111a] text-slate-300 border border-slate-700'
                }`}
              >
                ● Round Faces ({ROUND_WATCH_PRESETS.length})
              </button>
              <button
                type="button"
                onClick={() => setShapeTab('square')}
                className={`px-3.5 py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                  shapeTab === 'square'
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#0d111a] text-slate-300 border border-slate-700'
                }`}
              >
                ■ Square Faces ({SQUARE_WATCH_PRESETS.length})
              </button>
            </div>

            <label className="inline-flex items-center gap-2 rounded-lg bg-[#0d111a] border border-amber-500/40 px-3.5 py-2 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={targetFullHd}
                onChange={(e) => setTargetFullHd(e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
              <span className="font-semibold text-amber-200">
                Full HD 1080×1080 Master Quality
              </span>
            </label>
          </div>

          {/* Separated Watch Grid */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              {shapeTab === 'round'
                ? '01. Round Smartwatch Faces (All Separated & Full-Res)'
                : '01. Square Smartwatch Faces (All Separated & Full-Res)'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {galleryPresets.map((preset) => {
                const isCurrent = currentConfig.presetId === preset.presetId;
                const displayName = preset.name
                  .replace(/\s*\(Round\)/gi, '')
                  .replace(/\s*\(Square\)/gi, '');
                return (
                  <button
                    key={preset.presetId}
                    type="button"
                    onClick={() => handleSelectGalleryPreset(preset)}
                    className={`rounded-xl border p-3 flex flex-col items-center gap-2.5 text-center transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#1a2232] border-orange-500 text-white'
                        : 'bg-[#121724] border-slate-800 hover:border-orange-500/60 text-slate-200'
                    }`}
                  >
                    {preset.dial.intactArtworkUrl && (
                      <img
                        src={preset.dial.intactArtworkUrl}
                        alt={displayName}
                        loading="lazy"
                        className={`w-24 h-24 object-contain ${
                          shapeTab === 'round' ? 'rounded-full' : 'rounded-2xl'
                        }`}
                      />
                    )}
                    <span className="font-semibold text-[11px] leading-tight line-clamp-2">
                      {displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Photo -> Full HD 1080p Section */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              02. Upload Your Own Image → Fit into Full HD Watch Dial
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex-1 min-w-[240px] flex items-center justify-center gap-2 rounded-xl border border-dashed border-orange-500/50 hover:border-orange-400 bg-[#141824] px-4 py-4 cursor-pointer transition-colors">
                <FileUp className="w-4 h-4 text-orange-400" />
                <span className="font-medium text-slate-200">
                  Upload Custom Image (.jpg, .png, .webp)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSampleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {statusMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-700/50 px-3.5 py-2 text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            {extracted && (
              <div className="rounded-xl bg-[#121723] border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={extracted.previewUrl}
                    alt="Uploaded sample"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-full object-cover border border-slate-700"
                  />
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="text-slate-100 font-sans font-semibold">
                      {extracted.fileName} ({extracted.origWidth}×
                      {extracted.origHeight}px → 1080×1080px FHD)
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Extracted Palette:</span>
                      <span
                        className="px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: extracted.dominantHex }}
                      >
                        {extracted.dominantHex}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-slate-950"
                        style={{ backgroundColor: extracted.accentHex }}
                      >
                        {extracted.accentHex}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReconstructFromSample}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 px-4 py-2.5 font-bold text-white cursor-pointer"
                >
                  <Wand2 className="w-4 h-4" />
                  Apply 1080×1080 Custom Photo Dial
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
