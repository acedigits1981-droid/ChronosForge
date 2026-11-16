import React, { useState } from 'react';
import { Cpu, Grid, HardDrive } from 'lucide-react';
import { CompiledWatchAssets } from '../types/watchface';

interface CompilerSidebarProps {
  assets: CompiledWatchAssets | null;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export const CompilerSidebar: React.FC<CompilerSidebarProps> = ({ assets }) => {
  const [filter, setFilter] = useState<'all' | 'hand' | 'arc' | 'glyph'>('all');
  const [selectedSpriteId, setSelectedSpriteId] = useState<string | null>(null);

  if (!assets) {
    return (
      <aside className="w-full lg:w-80 shrink-0 border-l border-slate-800/80 bg-[#0c0f16] p-4 text-xs text-slate-400">
        Compiling hardware sprite atlas...
      </aside>
    );
  }

  const { budget } = assets;
  const binKb = budget.fitcloudBinBytes / 1024;
  const iwfLzKb = budget.veryfitLzBytes / 1024;
  const maxLimitKb = budget.flashBudgetMaxKb;
  const usagePercent = Math.min(100, Math.round((binKb / maxLimitKb) * 100));

  const filteredSprites = assets.allSprites.filter((s) =>
    filter === 'all' ? true : s.category === filter
  );

  const activeSprite =
    (selectedSpriteId
      ? assets.allSprites.find((s) => s.id === selectedSpriteId)
      : null) ?? assets.handHour;

  return (
    <aside className="w-full lg:w-84 shrink-0 border-l border-slate-800/80 bg-[#0c0f16] flex flex-col h-full overflow-y-auto">
      {/* Section 1: Live Memory Budget Meter */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-slate-300 flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            03. Flash Memory Budget
          </h2>
          <span className="text-[11px] font-mono text-emerald-400">
            {usagePercent}% of 1.2 MB
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2.5 bg-[#141a26] rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-200 ${
              binKb > 900
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-emerald-500 to-sky-500'
            }`}
            style={{ width: `${Math.max(5, usagePercent)}%` }}
          />
        </div>

        {/* Payload Breakdown Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#111622] border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">FitCloudPro (.bin)</div>
            <div className="font-mono font-semibold text-slate-100 mt-0.5">
              {formatKb(budget.fitcloudBinBytes)}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">
              TBUI RGB565 + #080808
            </div>
          </div>

          <div className="bg-[#111622] border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">VeryFit (.iwf.lz)</div>
            <div className="font-mono font-semibold text-slate-100 mt-0.5">
              {iwfLzKb.toFixed(1)} KB
            </div>
            <div className="text-[10px] text-sky-400 mt-0.5">
              LZ4 / FastLZ Archive
            </div>
          </div>

          <div className="bg-[#111622] border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">24-Bit Raw RGBA</div>
            <div className="font-mono text-slate-300 mt-0.5">
              {formatKb(budget.uncompressedRgbaBytes)}
            </div>
          </div>

          <div className="bg-[#111622] border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">Cropped Sprites</div>
            <div className="font-mono text-slate-300 mt-0.5">
              {budget.spriteCount} assets
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Selected Sprite Pivot & Bounding Box Inspector */}
      {activeSprite && (
        <div className="p-4 border-b border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-orange-400" />
              Cropped Sprite & Pivot Anchor
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              {activeSprite.width}×{activeSprite.height}px
            </span>
          </div>

          <div className="flex items-center gap-3 bg-[#10141e] border border-slate-800 rounded-lg p-2.5">
            <div className="relative w-20 h-20 shrink-0 rounded checkerboard-bg border border-slate-700 flex items-center justify-center overflow-hidden">
              <img
                src={activeSprite.dataUrl}
                alt={activeSprite.label}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain"
              />
              {/* Pivot Crosshair Indicator */}
              <div
                title={`Pivot (${activeSprite.pivotX}, ${activeSprite.pivotY})`}
                className="w-2 h-2 rounded-full border border-orange-400 bg-orange-500/60 absolute pointer-events-none"
              />
            </div>

            <div className="text-[11px] font-mono space-y-1 text-slate-300 min-w-0">
              <div className="text-slate-100 font-sans font-medium truncate">
                {activeSprite.label}
              </div>
              <div>
                BBox: ({activeSprite.x}, {activeSprite.y})
              </div>
              <div className="text-orange-400">
                Pivot: ({activeSprite.pivotX}, {activeSprite.pivotY})
              </div>
              <div className="text-slate-400">
                RGB565: {formatKb(activeSprite.rgb565Bytes.byteLength)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Interactive Sprite Atlas Grid */}
      <div className="p-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Grid className="w-3.5 h-3.5 text-sky-400" />
            04. Quantized Sprite Atlas
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            {assets.glyphs.length} glyphs
          </span>
        </div>

        {/* Segmented Filter Control */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#111622] rounded-lg border border-slate-800 mb-3 text-[11px]">
          {(
            [
              ['all', 'All'],
              ['hand', 'Hands'],
              ['arc', 'Arcs'],
              ['glyph', '0-9'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap ${
                filter === key
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 overflow-y-auto pr-1">
          {filteredSprites.slice(0, filter === 'glyph' ? 96 : 42).map((sprite) => {
            const isSel = activeSprite?.id === sprite.id;
            return (
              <button
                key={sprite.id}
                type="button"
                onClick={() => setSelectedSpriteId(sprite.id)}
                className={`p-1.5 rounded-lg border text-left transition-colors cursor-pointer flex flex-col items-center ${
                  isSel
                    ? 'bg-[#171f30] border-orange-500'
                    : 'bg-[#10141e] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="w-full h-12 checkerboard-bg rounded flex items-center justify-center overflow-hidden mb-1">
                  <img
                    src={sprite.dataUrl}
                    alt={sprite.label}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-300 truncate w-full text-center">
                  {sprite.id
                    .replace('font_time_', '')
                    .replace('font_metrics_', '')
                    .replace('font_small_', '')}
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  {sprite.width}×{sprite.height}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
