import { DigitalWidgetConfig, WatchFaceConfig } from '../types/watchface';

export type DigitalClockLayout = 'inline' | 'stacked' | 'hourOnly';

export function clampWatchRel(val: number, min = -0.44, max = 0.44): number {
  if (!Number.isFinite(val)) return 0;
  return Number(Math.max(min, Math.min(max, val)).toFixed(3));
}

export function clampDigitalScale(val: number, min = 0.45, max = 3.2): number {
  if (!Number.isFinite(val)) return 1;
  return Number(Math.max(min, Math.min(max, val)).toFixed(2));
}

/**
 * Formats the live clock hour as its natural integer ("1", "10", "19", "0")
 * without leading-zero padding, matching dynamic single-number dial layouts.
 */
export function formatLiveHourNumber(hours24: number): string {
  const normalized = ((Math.floor(hours24) % 24) + 24) % 24;
  return String(normalized);
}

export function getPrimaryTimeWidget(
  config: WatchFaceConfig
): DigitalWidgetConfig | null {
  return (
    config.digital.widgets.find((w) => w.type === 'timeDigital' && w.enabled) ??
    config.digital.widgets.find((w) => w.type === 'timeDigital') ??
    null
  );
}

export function ensureTimeWidget(config: WatchFaceConfig): WatchFaceConfig {
  const existing = config.digital.widgets.find((w) => w.type === 'timeDigital');
  const layers = config.layers.map((l) =>
    l.id === 'digital' ? { ...l, visible: true } : l
  );
  if (existing) {
    return {
      ...config,
      layers,
      digital: {
        ...config.digital,
        widgets: config.digital.widgets.map((w) =>
          w.id === existing.id ? { ...w, enabled: true } : w
        ),
      },
    };
  }
  const newWidget: DigitalWidgetConfig = {
    id: 'w-time',
    enabled: true,
    type: 'timeDigital',
    label: 'Digital Time',
    relX: 0,
    relY: 0,
    fontSet: 'time',
    scale: 1,
    align: 'center',
    layout: 'inline',
  };
  return {
    ...config,
    layers,
    digital: {
      ...config.digital,
      widgets: [newWidget, ...config.digital.widgets],
    },
  };
}

export function updatePrimaryTimeWidget(
  config: WatchFaceConfig,
  patch: Partial<
    Pick<DigitalWidgetConfig, 'relX' | 'relY' | 'scale' | 'layout' | 'fontSet' | 'enabled'>
  >
): WatchFaceConfig {
  const ensured = ensureTimeWidget(config);
  const target =
    ensured.digital.widgets.find((w) => w.type === 'timeDigital' && w.enabled) ??
    ensured.digital.widgets.find((w) => w.type === 'timeDigital');
  if (!target) return ensured;

  return {
    ...ensured,
    digital: {
      ...ensured.digital,
      widgets: ensured.digital.widgets.map((w) => {
        if (w.id !== target.id) return w;
        return {
          ...w,
          ...patch,
          relX: patch.relX !== undefined ? clampWatchRel(patch.relX) : w.relX,
          relY: patch.relY !== undefined ? clampWatchRel(patch.relY) : w.relY,
          scale:
            patch.scale !== undefined ? clampDigitalScale(patch.scale) : w.scale,
        };
      }),
    },
  };
}

export function clientDeltaToWatchRelDelta(
  dxPx: number,
  dyPx: number,
  renderedWidthPx: number,
  renderedHeightPx: number
): { dRelX: number; dRelY: number } {
  const minPx = Math.max(1, Math.min(renderedWidthPx, renderedHeightPx));
  return {
    dRelX: dxPx / minPx,
    dRelY: dyPx / minPx,
  };
}
