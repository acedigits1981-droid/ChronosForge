import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampDigitalScale,
  clampWatchRel,
  clientDeltaToWatchRelDelta,
  ensureTimeWidget,
  formatLiveHourNumber,
  getPrimaryTimeWidget,
  updatePrimaryTimeWidget,
} from './digitalPlacement';
import { WATCH_PRESETS } from '../presets/watchPresets';

test('formatLiveHourNumber renders natural 24h hour integers without leading zeros', () => {
  assert.equal(formatLiveHourNumber(0), '0');
  assert.equal(formatLiveHourNumber(1), '1');
  assert.equal(formatLiveHourNumber(9), '9');
  assert.equal(formatLiveHourNumber(10), '10');
  assert.equal(formatLiveHourNumber(19), '19');
  assert.equal(formatLiveHourNumber(23), '23');
  assert.equal(formatLiveHourNumber(25), '1');
  assert.equal(formatLiveHourNumber(-1), '23');
});

test('clampWatchRel and clampDigitalScale bound values safely', () => {
  assert.equal(clampWatchRel(0.95), 0.44);
  assert.equal(clampWatchRel(-0.95), -0.44);
  assert.equal(clampWatchRel(0.123456), 0.123);
  assert.equal(clampWatchRel(Number.NaN), 0);

  assert.equal(clampDigitalScale(0.1), 0.45);
  assert.equal(clampDigitalScale(5.0), 3.2);
  assert.equal(clampDigitalScale(1.256), 1.26);
  assert.equal(clampDigitalScale(Number.NaN), 1);
});

test('clientDeltaToWatchRelDelta normalizes pixel deltas against smallest canvas dimension', () => {
  const delta = clientDeltaToWatchRelDelta(40, -20, 400, 480);
  assert.equal(delta.dRelX, 0.1);
  assert.equal(delta.dRelY, -0.05);
});

test('ensureTimeWidget and updatePrimaryTimeWidget enable digital layer and clamp placement', () => {
  const analogBase = WATCH_PRESETS.find((p) => p.presetId === 'rd-diver-gold-blue');
  assert.ok(analogBase, 'Expected rd-diver-gold-blue preset to exist');

  const baseClone = structuredClone(analogBase);
  assert.equal(getPrimaryTimeWidget(baseClone), null);

  const ensured = ensureTimeWidget(baseClone);
  const digitalLayer = ensured.layers.find((l) => l.id === 'digital');
  assert.equal(digitalLayer?.visible, true);
  assert.ok(getPrimaryTimeWidget(ensured));

  const updated = updatePrimaryTimeWidget(ensured, {
    relX: 0.75,
    relY: -0.185,
    scale: 1.4,
    layout: 'stacked',
  });
  const widget = getPrimaryTimeWidget(updated);
  assert.ok(widget);
  assert.equal(widget.relX, 0.44);
  assert.equal(widget.relY, -0.185);
  assert.equal(widget.scale, 1.4);
  assert.equal(widget.layout, 'stacked');
});

test('cleaned gallery presets enable live digital widgets in both round and square variants', () => {
  const expectedSlugs: Array<{
    slug: string;
    layout: 'inline' | 'stacked' | 'hourOnly';
    hasHands: boolean;
  }> = [
    { slug: 'obsidian-infinity-8', layout: 'hourOnly', hasHands: true },
    { slug: 'titanium-xbridge-hybrid', layout: 'inline', hasHands: true },
    { slug: 'concentric-blue-date', layout: 'stacked', hasHands: false },
    { slug: 'gunmetal-tactical-hud', layout: 'inline', hasHands: false },
    { slug: 'tactical-orange-hud', layout: 'stacked', hasHands: false },
  ];

  for (const spec of expectedSlugs) {
    for (const prefix of ['rd', 'sq']) {
      const id = `${prefix}-${spec.slug}`;
      const preset = WATCH_PRESETS.find((p) => p.presetId === id);
      assert.ok(preset, `Missing preset ${id}`);

      const digitalLayer = preset.layers.find((l) => l.id === 'digital');
      assert.equal(digitalLayer?.visible, true, `${id} digital layer should be visible`);
      assert.equal(preset.hands.enabled, spec.hasHands, `${id} hands.enabled mismatch`);

      const timeWidget = getPrimaryTimeWidget(preset);
      assert.ok(timeWidget, `${id} missing primary time widget`);
      assert.equal(timeWidget.layout, spec.layout, `${id} widget layout mismatch`);
    }
  }
});
