import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Layers,
  Pipette,
  RotateCcw,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  applyAutoPickedWatchUiColors,
  applyDisplayMode,
  getDisplayMode,
} from '../presets/watchPresets';
import {
  BezelStyle,
  DialMaterial,
  HandStyle,
  LayerId,
  MetallicFinish,
  WatchDisplayMode,
  WatchFaceConfig,
} from '../types/watchface';
import {
  autoPickWatchUiColorsFromImageUrl,
  ExtractedWatchUiColors,
} from '../utils/paletteExtractor';
import { CustomImageUploadControls } from './CustomImageUploadControls';
import { FontManagerDrawer } from './FontManagerDrawer';
import { HslColorPicker } from './HslColorPicker';

interface LayerSidebarProps {
  config: WatchFaceConfig;
  selectedLayer: LayerId;
  onSelectLayer: (id: LayerId) => void;
  onChangeConfig: (next: WatchFaceConfig) => void;
}

export const LayerSidebar: React.FC<LayerSidebarProps> = ({
  config,
  selectedLayer,
  onSelectLayer,
  onChangeConfig,
}) => {
  const [activeColorId, setActiveColorId] = useState<string | null>('dial-base');
  const [autoPickedHex, setAutoPickedHex] = useState<string | null>(null);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [fontDrawerOpen, setFontDrawerOpen] = useState(false);

  const toggleColorPicker = (id: string) => {
    setActiveColorId((prev) => (prev === id ? null : id));
  };

  const handleAutoPickWatchUi = async (scope: 'bezel' | 'dial' | 'hands') => {
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

  const toggleVisibility = (id: LayerId) => {
    const nextLayers = config.layers.map((l) =>
      l.id === id ? { ...l, visible: !l.visible } : l
    );
    onChangeConfig({ ...config, layers: nextLayers });
  };

  const moveLayer = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= config.layers.length) return;
    const next = [...config.layers];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    onChangeConfig({ ...config, layers: next });
  };

  const displayMode = getDisplayMode(config);

  return (
    <aside className="w-full lg:w-80 shrink-0 border-r border-slate-800/80 bg-[#0c0f16] flex flex-col h-full overflow-y-auto">
      {/* Display Mode Switcher: Analog / Hybrid / Pure Digital */}
      <div className="px-4 pt-3.5 pb-3 border-b border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
          <span>Watch Type Mode</span>
          <span className="font-mono text-sky-400 capitalize">{displayMode}</span>
        </div>
        <div
          role="group"
          aria-label="Sidebar Watch Type Switcher"
          className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111622] border border-slate-800"
        >
          {(
            [
              ['analog', 'Analog'],
              ['hybrid', 'Hybrid'],
              ['digital', 'Digital'],
            ] as Array<[WatchDisplayMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={displayMode === mode}
              onClick={() => onChangeConfig(applyDisplayMode(config, mode))}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                displayMode === mode
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 1: Layer Stack */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold tracking-wider text-slate-300 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-orange-400" />
            01. Horology Layer Stack
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">
            {config.layers.filter((l) => l.visible).length}/{config.layers.length} Active
          </span>
        </div>

        <div className="space-y-1.5">
          {config.layers.map((layer, idx) => {
            const isSelected = selectedLayer === layer.id;
            return (
              <div
                key={layer.id}
                className={`flex items-center justify-between rounded-lg px-2.5 py-2 border transition-colors ${
                  isSelected
                    ? 'bg-[#161d2b] border-orange-500/60 text-white'
                    : 'bg-[#10141e] border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectLayer(layer.id)}
                  className="flex-1 text-left text-xs font-medium truncate pr-2 cursor-pointer"
                >
                  {idx + 1}. {layer.name}
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Move ${layer.name} up`}
                    disabled={idx === 0}
                    onClick={() => moveLayer(idx, -1)}
                    className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${layer.name} down`}
                    disabled={idx === config.layers.length - 1}
                    onClick={() => moveLayer(idx, 1)}
                    className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Toggle ${layer.name} visibility`}
                    onClick={() => toggleVisibility(layer.id)}
                    className={`p-1 rounded cursor-pointer ${
                      layer.visible
                        ? 'text-orange-400 hover:text-orange-300'
                        : 'text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    {layer.visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Font Management Drawer (.ttf / .otf custom glyph atlas) */}
      <FontManagerDrawer
        config={config}
        onChangeConfig={onChangeConfig}
        isOpen={fontDrawerOpen}
        onToggleOpen={() => setFontDrawerOpen((prev) => !prev)}
      />

      {/* Section 2: Material & Shader Inspector */}
      <div className="p-4 flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-slate-300 flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            02. Surface & Material Inspector
          </h2>
          <span className="text-[11px] text-orange-400 font-mono">
            {selectedLayer}
          </span>
        </div>

        {selectedLayer === 'bezel' && (
          <div className="space-y-3 text-xs">
            <button
              type="button"
              disabled={isPickingColor}
              data-testid="sidebar-autopick-bezel-btn"
              onClick={() => handleAutoPickWatchUi('bezel')}
              className="w-full flex items-center justify-between gap-2 rounded-lg bg-pink-600/15 hover:bg-pink-600/25 border border-pink-500/45 px-2.5 py-2 text-pink-200 font-semibold cursor-pointer disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <Pipette className="w-3.5 h-3.5 text-pink-400" />
                Auto-Pick Watch UI Color
              </span>
              <span
                className="w-4 h-4 rounded-full border border-white/40"
                style={{
                  backgroundColor: autoPickedHex ?? config.bezel.accentColor,
                }}
              />
            </button>
            <label className="block space-y-1">
              <span className="text-slate-400">Chapter Ring & Bezel Style</span>
              <select
                value={config.bezel.style}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    bezel: {
                      ...config.bezel,
                      style: e.target.value as BezelStyle,
                    },
                  })
                }
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 text-slate-100"
              >
                <option value="doubleRowDiamondPave">Double-Row Micro-Pavé Diamonds (18K Rose Gold)</option>
                <option value="diamondPave">48-Stone Brilliant Diamond Pavé (Luxury Femme)</option>
                <option value="flutedRoseGold">72-Flute 18K Rose Gold & Diamonds (Luxury Femme)</option>
                <option value="compass">Tactical Compass Scale (360°)</option>
                <option value="tachymeter">Chronograph Tachymeter</option>
                <option value="minuteTrack">Precision 1/5s Minute Track</option>
                <option value="minimal">Minimalist Clean Rehaut</option>
              </select>
            </label>

            <div className="space-y-2">
              <HslColorPicker
                id="bezel-primary"
                label="Bezel Ring / Rehaut"
                value={config.bezel.primaryColor}
                isOpen={activeColorId === 'bezel-primary'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    bezel: { ...config.bezel, primaryColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="bezel-accent"
                label="Accent Color"
                value={config.bezel.accentColor}
                isOpen={activeColorId === 'bezel-accent'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    bezel: { ...config.bezel, accentColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="bezel-tick"
                label="Index Tick Color"
                value={config.bezel.tickColor}
                isOpen={activeColorId === 'bezel-tick'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    bezel: { ...config.bezel, tickColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="bezel-case-tint"
                label="Case Accent Tint"
                value={config.bezel.caseTintColor ?? config.bezel.primaryColor}
                isOpen={activeColorId === 'bezel-case-tint'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    bezel: { ...config.bezel, caseTintColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="marker-metal"
                label="Hour Marker Metal Frame"
                value={config.bezel.markerMetalColor ?? '#f1f5f9'}
                isOpen={activeColorId === 'marker-metal'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    bezel: { ...config.bezel, markerMetalColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="marker-lume"
                label="Hour Marker Lume Infill"
                value={config.bezel.markerLumeColor ?? config.hands.lumeColor}
                isOpen={activeColorId === 'marker-lume'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    bezel: { ...config.bezel, markerLumeColor: hex },
                  })
                }
              />
            </div>

            <label className="flex items-center justify-between pt-1">
              <span className="text-slate-300">Super-LumiNova Baton Pips</span>
              <input
                type="checkbox"
                checked={config.bezel.lumePips}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    bezel: { ...config.bezel, lumePips: e.target.checked },
                  })
                }
                className="accent-orange-500 w-4 h-4"
              />
            </label>
          </div>
        )}

        {selectedLayer === 'dial' && (
          <div className="space-y-3 text-xs">
            <CustomImageUploadControls
              config={config}
              onChangeConfig={onChangeConfig}
              activeColorId={activeColorId}
              onToggleColorPicker={toggleColorPicker}
            />

            <button
              type="button"
              disabled={isPickingColor}
              data-testid="sidebar-autopick-dial-btn"
              onClick={() => handleAutoPickWatchUi('dial')}
              className="w-full flex items-center justify-between gap-2 rounded-lg bg-pink-600/15 hover:bg-pink-600/25 border border-pink-500/45 px-2.5 py-2 text-pink-200 font-semibold cursor-pointer disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                Auto-Pick Dial Tint from Watch UI
              </span>
              <span
                className="w-4 h-4 rounded-full border border-white/40"
                style={{
                  backgroundColor: autoPickedHex ?? config.dial.secondaryColor,
                }}
              />
            </button>

            <label className="block space-y-1">
              <span className="text-slate-400">Texture Engine Dial Material</span>
              <select
                value={config.dial.material}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    dial: {
                      ...config.dial,
                      material: e.target.value as DialMaterial,
                    },
                  })
                }
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 text-slate-100"
              >
                <option value="iridescentRoseNacre">Iridescent Rose Champagne Nacre (Luxury Femme)</option>
                <option value="motherOfPearl">Delicate Opalescent Mother-of-Pearl (Luxury Femme)</option>
                <option value="iridescentTahitianPearl">Tahitian Peacock Black Mother-of-Pearl (Luxury Femme)</option>
                <option value="roseGoldGuilloche">Swiss 18K Rose Gold Flinqué Guilloché (Luxury Femme)</option>
                <option value="celestialAventurine">Celestial Midnight Aventurine Starlight (Luxury Femme)</option>
                <option value="silkBlushEnamel">Grand Feu Silk Blush Enamel (Luxury Femme)</option>
                <option value="forgedCarbon">Forged Carbon (Multi-Octave FBM)</option>
                <option value="sunburst">Sunburst Brushed Metal (Conic Specular)</option>
                <option value="matteCeramic">Matte Micro-Blasted Ceramic</option>
                <option value="pitchOled">Pitch-Black Wayfinder OLED</option>
              </select>
            </label>

            <div className="space-y-2">
              <HslColorPicker
                id="dial-base"
                label="Base Tone"
                value={config.dial.baseColor}
                isOpen={activeColorId === 'dial-base'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    dial: { ...config.dial, baseColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="dial-secondary"
                label="Specular Highlight"
                value={config.dial.secondaryColor}
                isOpen={activeColorId === 'dial-secondary'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    dial: { ...config.dial, secondaryColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="dial-overlay-tint"
                label="Dial Overlay Tint"
                value={config.dial.overlayTintColor ?? '#090b0f'}
                isOpen={activeColorId === 'dial-overlay-tint'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    dial: { ...config.dial, overlayTintColor: hex },
                  })
                }
              />
              <label className="block space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Dial Overlay Blend Opacity</span>
                  <span className="font-mono text-slate-200">
                    {Math.round((config.dial.overlayTintOpacity ?? 0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Dial Overlay Blend Opacity"
                  min={0}
                  max={0.85}
                  step={0.02}
                  value={config.dial.overlayTintOpacity ?? 0}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      dial: {
                        ...config.dial,
                        overlayTintOpacity: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-orange-500"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Iridescent Shader Intensity</span>
                <span className="font-mono text-pink-300">
                  {Math.round((config.dial.iridescenceIntensity ?? 1.0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={config.dial.iridescenceIntensity ?? 1.0}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    dial: {
                      ...config.dial,
                      iridescenceIntensity: Number(e.target.value),
                    },
                  })
                }
                className="w-full accent-pink-500"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Studio Light Angle</span>
                <span className="font-mono text-slate-200">
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
                className="w-full accent-orange-500"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Recessed Sub-Dial AO Depth</span>
                <span className="font-mono text-slate-200">
                  {Math.round(config.dial.recessedAoDepth * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={config.dial.recessedAoDepth}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    dial: {
                      ...config.dial,
                      recessedAoDepth: Number(e.target.value),
                    },
                  })
                }
                className="w-full accent-orange-500"
              />
            </label>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-slate-400 block font-medium">
                Recessed Sub-Dials ({config.dial.subDials.length})
              </span>
              {config.dial.subDials.map((sub, i) => {
                const subColorId = `subdial-${sub.id}`;
                return (
                  <div
                    key={sub.id}
                    className="bg-[#111622] px-2.5 py-2 rounded border border-slate-800 space-y-2"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sub.enabled}
                        onChange={(e) => {
                          const nextSubs = [...config.dial.subDials];
                          nextSubs[i] = { ...sub, enabled: e.target.checked };
                          onChangeConfig({
                            ...config,
                            dial: { ...config.dial, subDials: nextSubs },
                          });
                        }}
                        className="accent-orange-500"
                      />
                      <span className="text-slate-200 font-medium">{sub.label}</span>
                    </label>
                    <HslColorPicker
                      id={subColorId}
                      label={`${sub.label} Accent`}
                      compact
                      value={sub.accentColor}
                      isOpen={activeColorId === subColorId}
                      onToggleOpen={toggleColorPicker}
                      onChange={(hex) => {
                        const nextSubs = [...config.dial.subDials];
                        nextSubs[i] = { ...sub, accentColor: hex };
                        onChangeConfig({
                          ...config,
                          dial: { ...config.dial, subDials: nextSubs },
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedLayer === 'complications' && (
          <div className="space-y-3 text-xs">
            <p className="text-slate-400 leading-relaxed">
              Multi-frame progress arcs are pre-rendered into discrete sprite states
              for hardware watch engines.
            </p>
            {config.complications.arcs.map((arc, i) => {
              const arcColorId = `arc-${arc.id}`;
              const arcTrackId = `arc-track-${arc.id}`;
              return (
                <div
                  key={arc.id}
                  className="p-2.5 rounded-lg bg-[#111622] border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 font-medium text-slate-200">
                      <input
                        type="checkbox"
                        checked={arc.enabled}
                        onChange={(e) => {
                          const nextArcs = [...config.complications.arcs];
                          nextArcs[i] = { ...arc, enabled: e.target.checked };
                          onChangeConfig({
                            ...config,
                            complications: { arcs: nextArcs },
                          });
                        }}
                        className="accent-orange-500"
                      />
                      {arc.label}
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {arc.thickness}px · {arc.frameCount}f
                    </span>
                  </div>
                  <HslColorPicker
                    id={arcColorId}
                    label={`${arc.label} Color`}
                    compact
                    value={arc.color}
                    isOpen={activeColorId === arcColorId}
                    onToggleOpen={toggleColorPicker}
                    onChange={(hex) => {
                      const nextArcs = [...config.complications.arcs];
                      nextArcs[i] = { ...arc, color: hex };
                      onChangeConfig({
                        ...config,
                        complications: { arcs: nextArcs },
                      });
                    }}
                  />
                  <HslColorPicker
                    id={arcTrackId}
                    label={`${arc.label} Track`}
                    compact
                    value={arc.trackColor}
                    isOpen={activeColorId === arcTrackId}
                    onToggleOpen={toggleColorPicker}
                    onChange={(hex) => {
                      const nextArcs = [...config.complications.arcs];
                      nextArcs[i] = { ...arc, trackColor: hex };
                      onChangeConfig({
                        ...config,
                        complications: { arcs: nextArcs },
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {selectedLayer === 'digital' && (
          <div className="space-y-3 text-xs">
            <label className="block space-y-1">
              <span className="text-slate-400">Bitmap Numeral Rendering Style</span>
              <select
                value={config.digital.fontStyle}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    digital: {
                      ...config.digital,
                      fontStyle: e.target.value as WatchFaceConfig['digital']['fontStyle'],
                    },
                  })
                }
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 text-slate-100"
              >
                <option value="metallic">3D Brushed Metallic Specular</option>
                <option value="oledGlow">High-Contrast OLED Neon Glow</option>
                <option value="tacticalStencil">Tactical Monospace Readout</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setFontDrawerOpen(true)}
              className="w-full rounded-lg bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/45 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 cursor-pointer"
            >
              Manage Custom .TTF / .OTF Fonts
            </button>

            <div className="space-y-2">
              <div className="space-y-1">
                <span className="text-slate-400 block">Hours Color Mode</span>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111622] border border-slate-800">
                  {(['solid', 'gradient'] as const).map((mode) => {
                    const active = (config.digital.hoursColorMode ?? 'solid') === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          onChangeConfig({
                            ...config,
                            digital: { ...config.digital, hoursColorMode: mode },
                          })
                        }
                        className={`py-1 rounded text-[11px] font-semibold capitalize cursor-pointer ${
                          active
                            ? 'bg-orange-600 text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(config.digital.hoursColorMode ?? 'solid') === 'solid' ? (
                <HslColorPicker
                  id="digital-hours-solid"
                  label="Hours Color"
                  value={config.digital.hoursColor ?? config.digital.primaryColor}
                  isOpen={activeColorId === 'digital-hours-solid'}
                  onToggleOpen={toggleColorPicker}
                  onChange={(hex) =>
                    onChangeConfig({
                      ...config,
                      digital: {
                        ...config.digital,
                        primaryColor: hex,
                        hoursColor: hex,
                      },
                    })
                  }
                />
              ) : (
                <>
                  <HslColorPicker
                    id="digital-hours-top"
                    label="Hours Gradient Top"
                    value={config.digital.hoursGradientTop ?? config.digital.primaryColor}
                    isOpen={activeColorId === 'digital-hours-top'}
                    onToggleOpen={toggleColorPicker}
                    onChange={(hex) =>
                      onChangeConfig({
                        ...config,
                        digital: { ...config.digital, hoursGradientTop: hex },
                      })
                    }
                  />
                  <HslColorPicker
                    id="digital-hours-bottom"
                    label="Hours Gradient Bottom"
                    value={config.digital.hoursGradientBottom ?? config.digital.glowColor}
                    isOpen={activeColorId === 'digital-hours-bottom'}
                    onToggleOpen={toggleColorPicker}
                    onChange={(hex) =>
                      onChangeConfig({
                        ...config,
                        digital: { ...config.digital, hoursGradientBottom: hex },
                      })
                    }
                  />
                </>
              )}

              <HslColorPicker
                id="digital-minutes"
                label="Minutes Color"
                value={config.digital.minutesColor ?? config.digital.primaryColor}
                isOpen={activeColorId === 'digital-minutes'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    digital: { ...config.digital, minutesColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="digital-seconds"
                label="Seconds Color"
                value={config.digital.secondsColor ?? config.digital.glowColor}
                isOpen={activeColorId === 'digital-seconds'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    digital: { ...config.digital, secondsColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="digital-ampm"
                label="AM / PM Accent"
                value={config.digital.ampmColor ?? config.digital.glowColor}
                isOpen={activeColorId === 'digital-ampm'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    digital: { ...config.digital, ampmColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="digital-date"
                label="Date & Weekday Color"
                value={config.digital.dateColor ?? '#e2e8f0'}
                isOpen={activeColorId === 'digital-date'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    digital: { ...config.digital, dateColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="digital-metrics-value"
                label="Metrics Readout Color"
                value={config.digital.metricsValueColor ?? config.digital.primaryColor}
                isOpen={activeColorId === 'digital-metrics-value'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    digital: { ...config.digital, metricsValueColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="digital-metrics-icon"
                label="Gauge / Bar Accent"
                value={config.digital.metricsIconColor ?? config.digital.glowColor}
                isOpen={activeColorId === 'digital-metrics-icon'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    digital: { ...config.digital, metricsIconColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="digital-glow"
                label="Secondary / Glow"
                value={config.digital.glowColor}
                isOpen={activeColorId === 'digital-glow'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    digital: { ...config.digital, glowColor: hex },
                  })
                }
              />
            </div>

            {/* Readability Backdrop Pill */}
            <div className="rounded-lg bg-[#111622] border border-slate-800 p-2.5 space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-slate-200 font-medium">
                  Readability Backdrop Pill
                </span>
                <input
                  type="checkbox"
                  checked={config.digital.backdropPill?.enabled ?? false}
                  onChange={(e) =>
                    onChangeConfig({
                      ...config,
                      digital: {
                        ...config.digital,
                        backdropPill: {
                          enabled: e.target.checked,
                          color: config.digital.backdropPill?.color ?? '#090b0f',
                          opacity: config.digital.backdropPill?.opacity ?? 0.56,
                        },
                      },
                    })
                  }
                  className="accent-orange-500 w-4 h-4"
                />
              </label>

              {config.digital.backdropPill?.enabled && (
                <>
                  <HslColorPicker
                    id="digital-backdrop-pill"
                    label="Backdrop Pill Color"
                    compact
                    value={config.digital.backdropPill.color}
                    isOpen={activeColorId === 'digital-backdrop-pill'}
                    onToggleOpen={toggleColorPicker}
                    onChange={(hex) =>
                      onChangeConfig({
                        ...config,
                        digital: {
                          ...config.digital,
                          backdropPill: {
                            enabled: true,
                            color: hex,
                            opacity: config.digital.backdropPill?.opacity ?? 0.56,
                          },
                        },
                      })
                    }
                  />
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Backdrop Opacity</span>
                      <span className="font-mono text-slate-200">
                        {Math.round((config.digital.backdropPill.opacity ?? 0.56) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Readability Backdrop Opacity"
                      min={0.1}
                      max={0.95}
                      step={0.02}
                      value={config.digital.backdropPill.opacity}
                      onChange={(e) =>
                        onChangeConfig({
                          ...config,
                          digital: {
                            ...config.digital,
                            backdropPill: {
                              enabled: true,
                              color: config.digital.backdropPill?.color ?? '#090b0f',
                              opacity: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="w-full accent-orange-500"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-slate-400 block font-medium">
                Active Digital Readouts &amp; Position (or Drag on Watch)
              </span>
              {config.digital.widgets.map((w, i) => (
                <div
                  key={w.id}
                  className="bg-[#111622] px-2.5 py-2 rounded border border-slate-800 space-y-2"
                >
                  <label className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={w.enabled}
                        onChange={(e) => {
                          const nextW = [...config.digital.widgets];
                          nextW[i] = { ...w, enabled: e.target.checked };
                          onChangeConfig({
                            ...config,
                            digital: { ...config.digital, widgets: nextW },
                          });
                        }}
                        className="accent-orange-500"
                      />
                      {w.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {w.fontSet}
                    </span>
                  </label>

                  {w.enabled && (
                    <div className="space-y-1.5 pt-1 border-t border-slate-800/70">
                      {w.type === 'timeDigital' && (
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              ['inline', 'HH:MM'],
                              ['stacked', 'Stacked'],
                              ['hourOnly', 'Hour Only'],
                            ] as const
                          ).map(([lk, lbl]) => (
                            <button
                              key={lk}
                              type="button"
                              onClick={() => {
                                const nextW = [...config.digital.widgets];
                                nextW[i] = { ...w, layout: lk };
                                onChangeConfig({
                                  ...config,
                                  digital: { ...config.digital, widgets: nextW },
                                });
                              }}
                              className={`py-1 rounded text-[10px] font-semibold cursor-pointer ${
                                (w.layout ?? 'inline') === lk
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-[#0b0f17] text-slate-300 hover:text-white'
                              }`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      )}

                      <label className="block space-y-0.5">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>X Position</span>
                          <span className="font-mono text-sky-300">
                            {Math.round(w.relX * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-0.42}
                          max={0.42}
                          step={0.01}
                          value={w.relX}
                          onChange={(e) => {
                            const nextW = [...config.digital.widgets];
                            nextW[i] = { ...w, relX: Number(e.target.value) };
                            onChangeConfig({
                              ...config,
                              digital: { ...config.digital, widgets: nextW },
                            });
                          }}
                          className="w-full accent-sky-500"
                        />
                      </label>

                      <label className="block space-y-0.5">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Y Position</span>
                          <span className="font-mono text-sky-300">
                            {Math.round(w.relY * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-0.42}
                          max={0.42}
                          step={0.01}
                          value={w.relY}
                          onChange={(e) => {
                            const nextW = [...config.digital.widgets];
                            nextW[i] = { ...w, relY: Number(e.target.value) };
                            onChangeConfig({
                              ...config,
                              digital: { ...config.digital, widgets: nextW },
                            });
                          }}
                          className="w-full accent-sky-500"
                        />
                      </label>

                      <label className="block space-y-0.5">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Size Scale</span>
                          <span className="font-mono text-sky-300">
                            {w.scale.toFixed(2)}×
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.45}
                          max={3.2}
                          step={0.05}
                          value={w.scale}
                          onChange={(e) => {
                            const nextW = [...config.digital.widgets];
                            nextW[i] = { ...w, scale: Number(e.target.value) };
                            onChangeConfig({
                              ...config,
                              digital: { ...config.digital, widgets: nextW },
                            });
                          }}
                          className="w-full accent-sky-500"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedLayer === 'hands' && (
          <div className="space-y-3 text-xs">
            <button
              type="button"
              disabled={isPickingColor}
              data-testid="sidebar-autopick-hands-btn"
              onClick={() => handleAutoPickWatchUi('hands')}
              className="w-full flex items-center justify-between gap-2 rounded-lg bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/50 px-2.5 py-2 text-pink-100 font-semibold cursor-pointer disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <Pipette className="w-3.5 h-3.5 text-pink-400" />
                Auto-Pick Color from Watch UI
              </span>
              <span dir="ltr" className="flex items-center gap-1.5 font-mono text-[10px] uppercase">
                <span
                  className="w-4 h-4 rounded-full border border-white/50"
                  style={{
                    backgroundColor:
                      autoPickedHex ?? config.hands.secondHandColor,
                  }}
                />
                {autoPickedHex ?? config.hands.secondHandColor}
              </span>
            </button>

            <label className="flex items-center justify-between">
              <span className="text-slate-200 font-medium">
                Enable 3D Analog Hands
              </span>
              <input
                type="checkbox"
                checked={config.hands.enabled}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    hands: { ...config.hands, enabled: e.target.checked },
                  })
                }
                className="accent-orange-500 w-4 h-4"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-slate-400">Hand Architecture</span>
              <select
                value={config.hands.style}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    hands: {
                      ...config.hands,
                      style: e.target.value as HandStyle,
                    },
                  })
                }
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 text-slate-100"
              >
                <option value="feuilleLeaf">Haute Horlogerie Curved Feuille Leaf (Ladies)</option>
                <option value="skeleton">Galaxy Ultra Tactical Skeleton</option>
                <option value="dauphine">Classic Diamond-Cut Dauphine</option>
                <option value="wayfinder">Apple Ultra Wayfinder Baton</option>
                <option value="sword">Military Broad Sword</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-slate-400">Alloy & Bevel Finish</span>
              <select
                value={config.hands.finish}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    hands: {
                      ...config.hands,
                      finish: e.target.value as MetallicFinish,
                    },
                  })
                }
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 text-slate-100"
              >
                <option value="roseGold18k">18K Polished Rose Gold (Ladies Luxury)</option>
                <option value="brushedTitanium">Grade-5 Brushed Titanium</option>
                <option value="polishedSteel">316L Mirror-Polished Steel</option>
                <option value="champagneGold">18K Champagne Gold</option>
                <option value="obsidianBlack">DLC Obsidian Stealth</option>
              </select>
            </label>

            <div className="space-y-2">
              <div className="space-y-1">
                {config.hands.hourMinuteMetalColor && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeConfig({
                          ...config,
                          hands: {
                            ...config.hands,
                            hourMinuteMetalColor: undefined,
                          },
                        })
                      }
                      className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Reset to Alloy
                    </button>
                  </div>
                )}
                <HslColorPicker
                  id="hands-metal"
                  label="Hour & Minute Metal Color"
                  value={config.hands.hourMinuteMetalColor ?? '#e2e8f0'}
                  isOpen={activeColorId === 'hands-metal'}
                  onToggleOpen={toggleColorPicker}
                  onChange={(hex) =>
                    onChangeConfig({
                      ...config,
                      hands: { ...config.hands, hourMinuteMetalColor: hex },
                    })
                  }
                />
              </div>
              <HslColorPicker
                id="hands-lume"
                label="Super-LumiNova"
                value={config.hands.lumeColor}
                isOpen={activeColorId === 'hands-lume'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    hands: { ...config.hands, lumeColor: hex },
                  })
                }
              />
              <HslColorPicker
                id="hands-second"
                label="Sweep Second Hand"
                value={config.hands.secondHandColor}
                isOpen={activeColorId === 'hands-second'}
                onToggleOpen={toggleColorPicker}
                onChange={(hex) =>
                  onChangeConfig({
                    ...config,
                    hands: {
                      ...config.hands,
                      secondHandColor: hex,
                    },
                  })
                }
              />
            </div>
          </div>
        )}

        {selectedLayer === 'glassCap' && (
          <div className="space-y-3 text-xs">
            <label className="block space-y-1">
              <span className="text-slate-400">Center Pivot Cap Alloy</span>
              <select
                value={config.glassCap.capFinish}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    glassCap: {
                      ...config.glassCap,
                      capFinish: e.target.value as MetallicFinish,
                    },
                  })
                }
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 text-slate-100"
              >
                <option value="brushedTitanium">Brushed Titanium</option>
                <option value="polishedSteel">Polished Steel</option>
                <option value="champagneGold">Champagne Gold</option>
                <option value="obsidianBlack">Obsidian DLC</option>
              </select>
            </label>

            <label className="flex items-center justify-between pt-1">
              <span className="text-slate-200">
                Sapphire AR Crystal Reflection
              </span>
              <input
                type="checkbox"
                checked={config.glassCap.sapphireGlare}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    glassCap: {
                      ...config.glassCap,
                      sapphireGlare: e.target.checked,
                    },
                  })
                }
                className="accent-orange-500 w-4 h-4"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">AR Glare Intensity</span>
                <span className="font-mono text-slate-200">
                  {Math.round(config.glassCap.glareIntensity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.glassCap.glareIntensity}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    glassCap: {
                      ...config.glassCap,
                      glareIntensity: Number(e.target.value),
                    },
                  })
                }
                className="w-full accent-orange-500"
              />
            </label>
          </div>
        )}
      </div>
    </aside>
  );
};
