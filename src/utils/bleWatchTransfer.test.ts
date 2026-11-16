import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_SMARTWATCH_VENDOR_SERVICES,
  BleDevice,
  BleGattCharacteristic,
  BleGattService,
  buildCaptureScanOptions,
  buildDialTransferPackets,
  buildRequestDeviceOptions,
  connectWatchGatt,
  connectWithGattRetry,
  decodePrintableUtf8,
  describeKnownBleUuid,
  detectWatchEcosystem,
  extractCharacteristicPropertyLabels,
  flashDialOverGatt,
  formatBytesHex,
  formatDiagnosticReport,
  inspectGattTree,
  listPreviouslyPairedWatches,
  normalizeBleUuid,
  overrideSessionCharacteristic,
  parseAdvertisementEvent,
  parseExtraServiceUuids,
  pickBestGattCharacteristics,
  PROTOCOL_PROFILES,
  pushFitCloudViaNativeBridge,
  uint8ArrayToBase64,
} from './bleWatchTransfer';

test('normalizeBleUuid and parseExtraServiceUuids normalize 16/32/128-bit UUIDs cleanly', () => {
  assert.equal(normalizeBleUuid('FEEA'), '0000feea-0000-1000-8000-00805f9b34fb');
  assert.equal(normalizeBleUuid('00000af0'), '00000af0-0000-1000-8000-00805f9b34fb');
  assert.equal(
    normalizeBleUuid('6E400001-B5A3-F393-E0A9-E50E24DCCA9E'),
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
  );
  assert.equal(normalizeBleUuid('not-a-uuid'), null);

  assert.deepEqual(
    parseExtraServiceUuids('ff10, 0x02f00000-0000-0000-0000-00000000fe00; invalid ff10'),
    [
      '0000ff10-0000-1000-8000-00805f9b34fb',
      '02f00000-0000-0000-0000-00000000fe00',
    ]
  );
});

test('UUID descriptors, hex formatting, printable UTF-8, property labels, and advertisement parser work cleanly', () => {
  assert.equal(
    describeKnownBleUuid('00002902-0000-1000-8000-00805f9b34fb'),
    'Client Characteristic Config (CCCD)'
  );
  assert.equal(
    describeKnownBleUuid('0000ff99-0000-1000-8000-00805f9b34fb'),
    'Vendor / 16-bit UUID (0xFF99)'
  );
  assert.equal(formatBytesHex(new Uint8Array([0x01, 0xab, 0x0f])), '01 AB 0F');
  assert.equal(decodePrintableUtf8(new TextEncoder().encode('S71 Watch\0')), 'S71 Watch');
  assert.equal(decodePrintableUtf8(new Uint8Array([0x01, 0x02, 0xff, 0x80])), null);
  assert.deepEqual(
    extractCharacteristicPropertyLabels({
      read: true,
      writeWithoutResponse: true,
      notify: true,
    }),
    ['READ', 'WRITE_NO_RSP', 'NOTIFY']
  );

  const mfgMap = new Map<number, DataView>([
    [0x004c, new DataView(new Uint8Array([0x10, 0x05]).buffer)],
  ]);
  const svcMap = new Map<string, DataView>([
    ['0000feea-0000-1000-8000-00805f9b34fb', new DataView(new Uint8Array([0xaa, 0xbb]).buffer)],
  ]);
  const adv = parseAdvertisementEvent({
    device: { id: 'dev-s71', name: 'S71' },
    rssi: -58,
    txPower: 4,
    uuids: ['0000FEEA-0000-1000-8000-00805F9B34FB'],
    manufacturerData: mfgMap,
    serviceData: svcMap,
  });
  assert.equal(adv.deviceName, 'S71');
  assert.equal(adv.rssi, -58);
  assert.deepEqual(adv.uuids, ['0000feea-0000-1000-8000-00805f9b34fb']);
  assert.deepEqual(adv.manufacturerData, [{ companyIdHex: '0x004C', rawHex: '10 05' }]);
  assert.deepEqual(adv.serviceData, [
    { uuid: '0000feea-0000-1000-8000-00805f9b34fb', rawHex: 'AA BB' },
  ]);
});

test('buildRequestDeviceOptions includes S71, extraServiceUuids, and registers vendor GATT optionalServices', () => {
  const opts = buildRequestDeviceOptions({
    protocol: 'fitcloud',
    scanMode: 'smartwatch',
    extraServiceUuids: ['00009999-0000-1000-8000-00805f9b34fb'],
  });
  assert.equal(opts.acceptAllDevices, undefined);
  assert.ok(Array.isArray(opts.filters) && opts.filters.length > 5);
  assert.ok(
    opts.filters.some((f) => f.services?.includes(PROTOCOL_PROFILES.fitcloud.serviceUuid))
  );
  assert.ok(opts.filters.some((f) => f.namePrefix === 'S71'));
  assert.ok(opts.filters.some((f) => f.namePrefix === 'Watch'));
  assert.ok(opts.optionalServices?.includes('0000180a-0000-1000-8000-00805f9b34fb'));
  assert.ok(opts.optionalServices?.includes('00009999-0000-1000-8000-00805f9b34fb'));
  assert.ok(opts.optionalServices?.includes(ALL_SMARTWATCH_VENDOR_SERVICES[1]));
  assert.ok(opts.optionalServices?.includes('6e400001-b5a3-f393-e0a9-e50e24dcca9e'));

  const s71Opts = buildRequestDeviceOptions({
    protocol: 'universal',
    scanMode: 'name',
    nameFilter: 'S71',
  });
  assert.deepEqual(s71Opts.filters, [{ namePrefix: 'S71' }, { namePrefix: 's71' }]);

  const namedOpts = buildRequestDeviceOptions({
    protocol: 'veryfit',
    scanMode: 'smartwatch',
    nameFilter: 'IDW19',
  });
  assert.deepEqual(namedOpts.filters, [{ namePrefix: 'IDW19' }, { namePrefix: 'idw19' }]);

  const allOpts = buildRequestDeviceOptions({
    protocol: 'veryfit',
    scanMode: 'all',
  });
  assert.equal(allOpts.acceptAllDevices, true);
});

test('pickBestGattCharacteristics discovers Nordic/DaFit/S71 vendor GATT characteristics cleanly', () => {
  const infoService: BleGattService = {
    uuid: '0000180a-0000-1000-8000-00805f9b34fb',
    getCharacteristics: async () => [],
  };
  const nusService: BleGattService = {
    uuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    getCharacteristics: async () => [],
  };

  const picked = pickBestGattCharacteristics(
    [infoService, nusService],
    new Map([
      [
        infoService.uuid,
        [{ uuid: '00002a29-0000-1000-8000-00805f9b34fb', properties: { read: true } }],
      ],
      [
        nusService.uuid,
        [
          {
            uuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
            properties: { writeWithoutResponse: true, write: true },
          },
          {
            uuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
            properties: { notify: true },
          },
        ],
      ],
    ]),
    '0000feea-0000-1000-8000-00805f9b34fb',
    '0000fee2-0000-1000-8000-00805f9b34fb',
    'universal'
  );

  assert.equal(picked.activeServiceUuid, '6e400001-b5a3-f393-e0a9-e50e24dcca9e');
  assert.equal(picked.writeCharacteristic?.uuid, '6e400002-b5a3-f393-e0a9-e50e24dcca9e');
  assert.equal(picked.notifyCharacteristic?.uuid, '6e400003-b5a3-f393-e0a9-e50e24dcca9e');
});

test('listPreviouslyPairedWatches returns authorized devices without throwing', async () => {
  const remembered = await listPreviouslyPairedWatches({
    requestDevice: async () => ({ id: 'x' }),
    getDevices: async () => [{ id: 'watch-s71', name: 'S71' }],
  });
  assert.equal(remembered.length, 1);
  assert.equal(remembered[0].name, 'S71');

  const empty = await listPreviouslyPairedWatches({
    requestDevice: async () => ({ id: 'x' }),
  });
  assert.deepEqual(empty, []);
});

test('connectWithGattRetry recovers from transient Error 133 and inspectGattTree probes unlisted services & descriptors', async () => {
  let connectAttempts = 0;
  let connected = false;
  const diagLog: string[] = [];

  const unlistedService: BleGattService = {
    uuid: '0000ff10-0000-1000-8000-00805f9b34fb',
    getCharacteristics: async () => [
      {
        uuid: '0000ff11-0000-1000-8000-00805f9b34fb',
        properties: { writeWithoutResponse: true, notify: true },
        getDescriptors: async () => [
          {
            uuid: '00002902-0000-1000-8000-00805f9b34fb',
            readValue: async () => new DataView(new Uint8Array([0x01, 0x00]).buffer),
          },
          {
            uuid: '00002901-0000-1000-8000-00805f9b34fb',
            readValue: async () =>
              new DataView(new TextEncoder().encode('S71 Dial Channel').buffer),
          },
        ],
      },
    ],
  };

  const fakeDevice: BleDevice = {
    id: 's71-retry',
    name: 'S71',
    gatt: {
      get connected() {
        return connected;
      },
      connect: async function () {
        connectAttempts++;
        if (connectAttempts === 1) {
          throw new Error('GATT Error Unknown (133)');
        }
        connected = true;
        return this;
      },
      disconnect: () => {
        connected = false;
      },
      getPrimaryServices: async () => [],
      getPrimaryService: async (uuid) => {
        if (uuid === '0000ff10-0000-1000-8000-00805f9b34fb') return unlistedService;
        throw new Error('Service not found');
      },
    },
  };

  const server = await connectWithGattRetry(fakeDevice, 3, (ev) =>
    diagLog.push(`${ev.stage}:${ev.summary}`)
  );
  assert.equal(connectAttempts, 2);
  assert.equal(server.connected, true);
  assert.ok(diagLog.some((l) => l.includes('attempt 1 failed')));

  const { services, serviceTree } = await inspectGattTree({
    server,
    candidateServiceUuids: ['0000ff10-0000-1000-8000-00805f9b34fb'],
    onDiag: (ev) => diagLog.push(`${ev.stage}:${ev.summary}`),
  });

  assert.equal(services.length, 1);
  assert.equal(serviceTree[0].source, 'probedOptionalService');
  assert.equal(serviceTree[0].characteristics.length, 1);
  assert.deepEqual(serviceTree[0].characteristics[0].properties, ['WRITE_NO_RSP', 'NOTIFY']);
  assert.equal(serviceTree[0].characteristics[0].descriptors.length, 2);
  assert.equal(serviceTree[0].characteristics[0].descriptors[0].rawHex, '01 00');
  assert.equal(serviceTree[0].characteristics[0].descriptors[1].utf8, 'S71 Dial Channel');
});

test('connectWatchGatt, overrideSessionCharacteristic, flashDialOverGatt MTU step-down, and formatDiagnosticReport work end-to-end', async () => {
  const writes: Array<{ uuid: string; mode: string; bytes: Uint8Array }> = [];
  const enc = new TextEncoder();

  const charsByService = new Map<string, BleGattCharacteristic[]>([
    [
      '0000180a-0000-1000-8000-00805f9b34fb',
      [
        {
          uuid: '00002a29-0000-1000-8000-00805f9b34fb',
          properties: { read: true },
          readValue: async () => new DataView(enc.encode('FitCloud').buffer),
        },
        {
          uuid: '00002a24-0000-1000-8000-00805f9b34fb',
          properties: { read: true },
          readValue: async () => new DataView(enc.encode('S71-Pro').buffer),
        },
      ],
    ],
    [
      '0000180f-0000-1000-8000-00805f9b34fb',
      [
        {
          uuid: '00002a19-0000-1000-8000-00805f9b34fb',
          properties: { read: true },
          readValue: async () => new DataView(new Uint8Array([87]).buffer),
        },
      ],
    ],
    [
      '0000feea-0000-1000-8000-00805f9b34fb',
      [
        {
          uuid: '0000fee1-0000-1000-8000-00805f9b34fb',
          properties: { write: true, notify: true },
          startNotifications: async function () {
            return this;
          },
          writeValueWithResponse: async (buf) => {
            writes.push({
              uuid: '0000fee1',
              mode: 'withResponse',
              bytes: new Uint8Array(buf as ArrayBuffer),
            });
          },
        },
        {
          uuid: '0000fee2-0000-1000-8000-00805f9b34fb',
          properties: { writeWithoutResponse: true, write: true },
          // Simulate watch enforcing a 20-byte ATT MTU ceiling
          writeValueWithoutResponse: async (buf) => {
            const bytes = new Uint8Array(buf as ArrayBuffer);
            if (bytes.byteLength > 20) {
              throw new Error('GATT operation exceeds ATT MTU');
            }
            writes.push({
              uuid: '0000fee2',
              mode: 'withoutResponse',
              bytes,
            });
          },
          writeValueWithResponse: async (buf) => {
            const bytes = new Uint8Array(buf as ArrayBuffer);
            if (bytes.byteLength > 20) {
              throw new Error('GATT operation exceeds ATT MTU');
            }
            writes.push({
              uuid: '0000fee2',
              mode: 'withResponse',
              bytes,
            });
          },
        },
      ],
    ],
  ]);

  const services: BleGattService[] = Array.from(charsByService.entries()).map(
    ([uuid, chars]) => ({
      uuid,
      getCharacteristics: async () => chars,
    })
  );

  let connected = false;
  const fakeDevice: BleDevice = {
    id: 'abc123456789',
    name: null,
    gatt: {
      get connected() {
        return connected;
      },
      connect: async function () {
        connected = true;
        return this;
      },
      disconnect: () => {
        connected = false;
      },
      getPrimaryServices: async () => services,
    },
  };

  const session = await connectWatchGatt({
    device: fakeDevice,
    protocol: 'fitcloud',
    preferredServiceUuid: PROTOCOL_PROFILES.fitcloud.serviceUuid,
    preferredCharUuid: PROTOCOL_PROFILES.fitcloud.dataCharUuid,
  });

  assert.equal(session.displayName, 'FitCloud S71-Pro');
  assert.equal(session.batteryPercent, 87);
  assert.ok(session.writeCharacteristic);
  assert.equal(session.serviceTree.length, 3);

  // Override writeCharacteristic to 0000fee1 and back to 0000fee2
  const overridden = overrideSessionCharacteristic(
    session,
    '0000feea-0000-1000-8000-00805f9b34fb',
    '0000fee1-0000-1000-8000-00805f9b34fb',
    'write'
  );
  assert.equal(overridden.writeCharacteristic?.uuid, '0000fee1-0000-1000-8000-00805f9b34fb');
  assert.equal(overridden.writeMode, 'withResponse');

  const payload = new Uint8Array(55);
  for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;

  const plan = buildDialTransferPackets(payload, 'fitcloud', 55);
  assert.equal(plan.dataChunks.length, 1);

  const result = await flashDialOverGatt({
    session,
    payload,
    protocol: 'fitcloud',
    mtuSize: 55,
  });

  assert.equal(result.chunksSent, 1);
  // 1 start + 3 stepped-down 20B data sub-packets (20+20+15) + 1 commit = 5 writes
  assert.equal(writes.length, 5);
  assert.equal(writes[0].uuid, '0000fee1');
  assert.equal(
    writes[1].bytes.byteLength + writes[2].bytes.byteLength + writes[3].bytes.byteLength,
    55
  );
  assert.equal(writes[4].uuid, '0000fee1');

  const reportJson = formatDiagnosticReport({
    protocol: 'universal',
    scanMode: 'name',
    nameFilter: 'S71',
    requestOptions: { filters: [{ namePrefix: 'S71' }], optionalServices: [] },
    extraServiceUuids: [],
    advertisements: [],
    session,
    events: [],
  });
  const parsed = JSON.parse(reportJson);
  assert.equal(parsed.connectedSession.displayName, 'FitCloud S71-Pro');
  assert.equal(parsed.connectedSession.serviceTree.length, 3);

  // Verify honest error when writeCharacteristic is missing
  await assert.rejects(
    () =>
      flashDialOverGatt({
        session: { ...session, writeCharacteristic: null },
        payload,
        protocol: 'fitcloud',
        mtuSize: 55,
      }),
    /no writable dial\/GATT characteristic/i
  );
});

test('buildCaptureScanOptions targets 0x0AF0/0xFEE7/0x180A/0x180F and supports acceptAllDevices fallback', () => {
  const filtered = buildCaptureScanOptions({ includeAllFallback: false });
  assert.equal(filtered.acceptAllDevices, undefined);
  assert.ok(filtered.filters?.some((f) => f.services?.includes('00000af0-0000-1000-8000-00805f9b34fb')));
  assert.ok(filtered.filters?.some((f) => f.services?.includes('0000fee7-0000-1000-8000-00805f9b34fb')));
  assert.ok(filtered.filters?.some((f) => f.services?.includes('0000180a-0000-1000-8000-00805f9b34fb')));
  assert.ok(filtered.filters?.some((f) => f.services?.includes('0000180f-0000-1000-8000-00805f9b34fb')));

  const broad = buildCaptureScanOptions({ includeAllFallback: true });
  assert.equal(broad.acceptAllDevices, true);
  assert.ok(broad.optionalServices?.includes('00000af0-0000-1000-8000-00805f9b34fb'));
});

test('detectWatchEcosystem and VeryFit D1 state machine auto-subscribe 0x0AF7/0x0AF2, await ACK, and stream sequenced chunks', async () => {
  const veryfitSvcs: BleGattService[] = [
    { uuid: '00000af0-0000-1000-8000-00805f9b34fb', getCharacteristics: async () => [] },
  ];
  assert.equal(detectWatchEcosystem(veryfitSvcs).ecosystem, 'veryfit');

  const fitcloudSvcs: BleGattService[] = [
    { uuid: '02f00000-0000-0000-8000-00000000fe00', getCharacteristics: async () => [] },
  ];
  assert.equal(detectWatchEcosystem(fitcloudSvcs).ecosystem, 'fitcloud');

  let af7Listener: ((ev: { target: BleGattCharacteristic }) => void) | null = null;
  const writes: Array<{ uuid: string; bytes: Uint8Array }> = [];

  const af7Char: BleGattCharacteristic = {
    uuid: '00000af7-0000-1000-8000-00805f9b34fb',
    properties: { notify: true },
    startNotifications: async function () {
      return this;
    },
    addEventListener: (_type, listener) => {
      af7Listener = listener;
    },
  };
  const af2Char: BleGattCharacteristic = {
    uuid: '00000af2-0000-1000-8000-00805f9b34fb',
    properties: { notify: true },
    startNotifications: async function () {
      return this;
    },
  };
  const af1Char: BleGattCharacteristic = {
    uuid: '00000af1-0000-1000-8000-00805f9b34fb',
    properties: { write: true },
    writeValueWithResponse: async (buf) => {
      const bytes = new Uint8Array(buf as ArrayBuffer);
      writes.push({ uuid: '00000af1', bytes });
      // Watch responds to D1 01 metadata initiation on 0x0AF7 ACK notify channel
      if (bytes[0] === 0xd1 && bytes[1] === 0x01 && af7Listener) {
        queueMicrotask(() => {
          const ack = new Uint8Array([0xd1, 0x01, 0x00]);
          af7Listener!({
            target: {
              ...af7Char,
              value: new DataView(ack.buffer),
            },
          });
        });
      }
    },
  };
  const af6Char: BleGattCharacteristic = {
    uuid: '00000af6-0000-1000-8000-00805f9b34fb',
    properties: { writeWithoutResponse: true, write: true },
    writeValueWithoutResponse: async (buf) => {
      writes.push({ uuid: '00000af6', bytes: new Uint8Array(buf as ArrayBuffer) });
    },
    writeValueWithResponse: async (buf) => {
      writes.push({ uuid: '00000af6', bytes: new Uint8Array(buf as ArrayBuffer) });
    },
  };

  let connected = false;
  const veryFitDevice: BleDevice = {
    id: 'idw19-watch',
    name: 'IDW19',
    gatt: {
      get connected() {
        return connected;
      },
      connect: async function () {
        connected = true;
        return this;
      },
      disconnect: () => {
        connected = false;
      },
      getPrimaryServices: async () => [
        {
          uuid: '00000af0-0000-1000-8000-00805f9b34fb',
          getCharacteristics: async () => [af1Char, af2Char, af6Char, af7Char],
        },
      ],
    },
  };

  const session = await connectWatchGatt({
    device: veryFitDevice,
    protocol: 'universal',
    preferredServiceUuid: '0000feea-0000-1000-8000-00805f9b34fb',
    preferredCharUuid: '0000fee2-0000-1000-8000-00805f9b34fb',
  });

  assert.equal(session.ecosystem, 'veryfit');
  assert.ok(session.subscribedNotifyUuids.includes('00000af7-0000-1000-8000-00805f9b34fb'));
  assert.ok(session.subscribedNotifyUuids.includes('00000af2-0000-1000-8000-00805f9b34fb'));
  assert.equal(session.controlCharacteristic?.uuid, '00000af1-0000-1000-8000-00805f9b34fb');
  assert.equal(session.writeCharacteristic?.uuid, '00000af6-0000-1000-8000-00805f9b34fb');

  const payload = new Uint8Array(40);
  for (let i = 0; i < payload.length; i++) payload[i] = i + 1;

  let observedSpeed = 0;
  const result = await flashDialOverGatt({
    session,
    payload,
    protocol: 'veryfit',
    mtuSize: 20,
    ackTimeoutMs: 250,
    onProgress: (_pct, _sent, _total, _bytes, speed) => {
      observedSpeed = speed;
    },
  });

  assert.equal(result.ackReceived, true);
  assert.equal(writes[0].uuid, '00000af1');
  assert.equal(writes[0].bytes[0], 0xd1);
  assert.equal(writes[0].bytes[1], 0x01);
  assert.equal(writes[0].bytes[6], 0x01); // compressed .iwf.lz flag
  assert.equal(writes[writes.length - 1].bytes[0], 0xd1);
  assert.equal(writes[writes.length - 1].bytes[1], 0x02); // D1 apply command
  assert.ok(observedSpeed >= 0);
});

test('uint8ArrayToBase64 and pushFitCloudViaNativeBridge invoke window.NativeWatchBridge.pushFitCloudBin', async () => {
  const sample = new Uint8Array([0x54, 0x42, 0x55, 0x49]); // "TBUI"
  assert.equal(uint8ArrayToBase64(sample), 'VEJVSQ==');

  let receivedB64 = '';
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    NativeWatchBridge: {
      pushFitCloudBin: async (b64: string) => {
        receivedB64 = b64;
        return true;
      },
    },
  };

  try {
    const ok = await pushFitCloudViaNativeBridge(sample);
    assert.equal(ok, true);
    assert.equal(receivedB64, uint8ArrayToBase64(sample));
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});
