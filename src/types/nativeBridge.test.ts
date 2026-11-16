import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHardwareLockedResolutionSpec,
  dispatchNativeWatchFacePush,
  formatHardwareLockBadgeText,
  inferNativeEcosystemFromGatt,
  isNativeApkRuntime,
  isNativeConnectedState,
  NativeDfuTransferMeta,
  normalizeNativeDfuComplete,
  normalizeNativeDfuProgress,
  resolveNativeDfuMac,
  upsertNativeFoundWatch,
} from './nativeBridge';

test('isNativeApkRuntime returns false in plain Node/browser without window.NativeWatchBridge', () => {
  assert.equal(isNativeApkRuntime(), false);
});

test('isNativeConnectedState accepts connected/ready states and rejects disconnected/connecting', () => {
  assert.equal(isNativeConnectedState('CONNECTED'), true);
  assert.equal(isNativeConnectedState('SYNCHRONIZED'), true);
  assert.equal(isNativeConnectedState('READY'), true);
  assert.equal(isNativeConnectedState('DISCONNECTED'), false);
  assert.equal(isNativeConnectedState('CONNECTING'), false);
  assert.equal(isNativeConnectedState('FAILED'), false);
  assert.equal(isNativeConnectedState(''), false);
  assert.equal(isNativeConnectedState(null), false);
});

test('upsertNativeFoundWatch normalizes MAC addresses, deduplicates, and sorts by strongest RSSI', () => {
  const step1 = upsertNativeFoundWatch([], {
    name: 'Watch A',
    mac: 'aa:bb:cc:dd:ee:01',
    rssi: -72,
  });
  const step2 = upsertNativeFoundWatch(step1, {
    name: 'S71',
    mac: 'aa:bb:cc:dd:ee:02',
    rssi: -49,
  });
  const step3 = upsertNativeFoundWatch(step2, {
    name: 'Watch A Updated',
    mac: 'AA:BB:CC:DD:EE:01',
    rssi: -41,
  });

  assert.equal(step3.length, 2);
  assert.equal(step3[0].mac, 'AA:BB:CC:DD:EE:01');
  assert.equal(step3[0].name, 'Watch A Updated');
  assert.equal(step3[0].rssi, -41);
  assert.equal(step3[1].mac, 'AA:BB:CC:DD:EE:02');
});

test('createHardwareLockedResolutionSpec and formatHardwareLockBadgeText encode exact hardware pixels', () => {
  const round360 = createHardwareLockedResolutionSpec(360, 360, true);
  assert.equal(round360.width, 360);
  assert.equal(round360.height, 360);
  assert.equal(round360.shape, 'round');
  assert.equal(round360.cornerRadius, 180);
  assert.equal(round360.isFullHdMaster, false);
  assert.equal(
    formatHardwareLockBadgeText(360, 360, true),
    'Hardware Locked: 360×360 (Round)'
  );

  const sq240 = createHardwareLockedResolutionSpec(240, 284, false);
  assert.equal(sq240.width, 240);
  assert.equal(sq240.height, 284);
  assert.equal(sq240.shape, 'squircle');
  assert.equal(sq240.cornerRadius, 48);
  assert.equal(
    formatHardwareLockBadgeText(240, 284, false),
    'Hardware Locked: 240×284 (Squircle)'
  );
});

test('inferNativeEcosystemFromGatt detects VeryFit 0x0AF0 vs FitCloudPro services', () => {
  assert.equal(
    inferNativeEcosystemFromGatt([
      {
        serviceUuid: '00000af0-0000-1000-8000-00805f9b34fb',
        characteristics: [],
      },
    ]),
    'veryfit'
  );
  assert.equal(
    inferNativeEcosystemFromGatt([
      {
        serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        characteristics: [],
      },
    ]),
    'fitcloud'
  );
});

test('dispatchNativeWatchFacePush triggers pushFitCloudBin or pushVeryFitIwf with stripped pure base64 based on ecosystem', () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const mockBridge = {
    pushFitCloudBin: (b64: string) => calls.push({ method: 'pushFitCloudBin', args: [b64] }),
    pushVeryFitIwf: (b64: string, mac: string) =>
      calls.push({ method: 'pushVeryFitIwf', args: [b64, mac] }),
  };

  const fcMethod = dispatchNativeWatchFacePush(mockBridge, {
    ecosystem: 'fitcloud',
    base64Data: 'data:application/octet-stream;base64,SGVsbG8=',
  });
  assert.equal(fcMethod, 'pushFitCloudBin');
  assert.deepEqual(calls[0], { method: 'pushFitCloudBin', args: ['SGVsbG8='] });

  const vfMethod = dispatchNativeWatchFacePush(mockBridge, {
    ecosystem: 'veryfit',
    base64Data: 'V29ybGQ=',
    macAddress: 'AA:BB:CC:11:22:33',
  });
  assert.equal(vfMethod, 'pushVeryFitIwf');
  assert.deepEqual(calls[1], {
    method: 'pushVeryFitIwf',
    args: ['V29ybGQ=', 'AA:BB:CC:11:22:33'],
  });

  assert.throws(
    () =>
      dispatchNativeWatchFacePush(mockBridge, {
        ecosystem: 'veryfit',
        base64Data: 'V29ybGQ=',
        macAddress: '',
      }),
    /MAC address/
  );
});

test('resolveNativeDfuMac, normalizeNativeDfuProgress, and normalizeNativeDfuComplete handle FitCloud & VeryFit events', () => {
  assert.equal(
    resolveNativeDfuMac('', {
      mac: 'aa:11:22:33:44:55',
      watchName: 'S71',
      lcdWidth: 360,
      lcdHeight: 360,
      isRound: true,
      shape: 'round',
      dialType: 1,
      state: 'CONNECTED',
    }),
    'AA:11:22:33:44:55'
  );

  const meta: NativeDfuTransferMeta = {
    ecosystem: 'veryfit',
    fileName: 'hero_360x360.iwf.lz',
    totalBytes: 40960,
    crc16: 0x1234,
    crc32: 0xdeadbeef,
    startedAtMs: 1000,
  };

  const prog = normalizeNativeDfuProgress({ percent: 50 }, meta, 3000);
  assert.equal(prog.percent, 50);
  assert.equal(prog.bytesSent, 20480);
  assert.equal(prog.totalBytes, 40960);
  assert.equal(prog.speedKbPerSec, 10);
  assert.match(prog.phaseLabel, /\.iwf\.lz.*50%/);

  const failed = normalizeNativeDfuComplete(
    { installed: false, message: 'Checksum mismatch' },
    meta,
    5000
  );
  assert.deepEqual(failed, {
    status: 'failed',
    errorMessage: 'Checksum mismatch',
  });

  const installed = normalizeNativeDfuComplete({ installed: true }, meta, 5000);
  assert.equal(installed.status, 'installed');
  if (installed.status === 'installed') {
    assert.equal(installed.summary.fileName, 'hero_360x360.iwf.lz');
    assert.equal(installed.summary.speedKbPerSec, 10);
    assert.equal(installed.summary.method, 'nativeBridge');
  }
});

