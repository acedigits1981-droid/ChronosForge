import { crc16Ccitt, crc32 } from '../compilers/compression';
import '../types/nativeBridge';

export type WatchBleProtocol = 'fitcloud' | 'veryfit' | 'universal';

export type WatchEcosystem = 'veryfit' | 'fitcloud' | 'unknown';

export type BleScanMode = 'name' | 'smartwatch' | 'all';

export const SMARTWATCH_CAPTURE_FILTER_SERVICES = [
  '00000af0-0000-1000-8000-00805f9b34fb', // VeryFit / IDO Control (0x0AF0)
  '0000fee7-0000-1000-8000-00805f9b34fb', // FitCloud / Moyoung / OEM (0xFEE7)
  '0000feea-0000-1000-8000-00805f9b34fb', // FitCloudPro / TopStep (0xFEEA)
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information (0x180A)
  '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service (0x180F)
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART / DaFit
] as const;

export interface BleProtocolProfile {
  id: WatchBleProtocol;
  name: string;
  shortLabel: string;
  serviceUuid: string;
  controlCharUuid: string;
  dataCharUuid: string;
  defaultMtu: number;
  knownServiceUuids: string[];
  knownWriteCharUuids: string[];
  knownNotifyCharUuids: string[];
}

export const STANDARD_BLE_INFO_SERVICES = [
  '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
  '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
  '0000180d-0000-1000-8000-00805f9b34fb', // Heart Rate
  '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
  '00001812-0000-1000-8000-00805f9b34fb', // Human Interface Device
] as const;

export const ALL_SMARTWATCH_VENDOR_SERVICES = [
  '0000feea-0000-1000-8000-00805f9b34fb', // FitCloudPro / TopStep
  '0000fee7-0000-1000-8000-00805f9b34fb', // Moyoung / DaFit / OEM
  '0000fee8-0000-1000-8000-00805f9b34fb', // Realtek / FitCloudPro Aux
  '0000fee9-0000-1000-8000-00805f9b34fb', // Realtek / FitCloudPro OTA
  '0000fee0-0000-1000-8000-00805f9b34fb', // Vendor Control Service
  '0000fee1-0000-1000-8000-00805f9b34fb', // Vendor Control Aux
  '0000fee2-0000-1000-8000-00805f9b34fb', // Vendor Data Aux
  '0000fee3-0000-1000-8000-00805f9b34fb', // Vendor Notify Aux
  '0000fea0-0000-1000-8000-00805f9b34fb', // Smartwatch OTA / Dial
  '0000fe59-0000-1000-8000-00805f9b34fb', // Nordic Secure DFU
  '000001ff-0000-1000-8000-00805f9b34fb', // DaFit / GloryFit Custom
  '0000a00a-0000-1000-8000-00805f9b34fb', // OEM Watch Service
  '0000a800-0000-1000-8000-00805f9b34fb', // OEM Dial Service
  '0000ae00-0000-1000-8000-00805f9b34fb', // Jieli RCSP Control
  '0000ae30-0000-1000-8000-00805f9b34fb', // Jieli Watch Dial
  '0000ae3a-0000-1000-8000-00805f9b34fb', // Jieli OTA Service
  '00000af0-0000-1000-8000-00805f9b34fb', // VeryFit / IDO Control
  '00000af6-0000-1000-8000-00805f9b34fb', // VeryFit / IDO Data
  '0000ba00-0000-1000-8000-00805f9b34fb', // RTL Watch Data
  '0000cc00-0000-1000-8000-00805f9b34fb', // OEM Dial Sync
  '0000cdd0-0000-1000-8000-00805f9b34fb', // GloryFit / OEM
  '0000d0ff-0000-1000-8000-00805f9b34fb', // Realtek OTA / Dial
  '0000f000-0000-1000-8000-00805f9b34fb', // OEM Control
  '0000f008-0000-1000-8000-00805f9b34fb', // GloryFit Dial
  '0000fd00-0000-1000-8000-00805f9b34fb', // OEM Dial Vendor
  '0000ff00-0000-1000-8000-00805f9b34fb', // Generic Watch Primary Service
  '0000ff01-0000-1000-8000-00805f9b34fb', // Generic Watch Control
  '0000ff10-0000-1000-8000-00805f9b34fb', // S71 / OEM Watch Dial Service
  '0000ff20-0000-1000-8000-00805f9b34fb', // S71 / OEM Watch Data Service
  '0000ffc0-0000-1000-8000-00805f9b34fb', // OTA Block Service
  '0000ffd0-0000-1000-8000-00805f9b34fb', // Vendor UART Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // BLE Serial UART
  '0000fff0-0000-1000-8000-00805f9b34fb', // OEM Transparent UART
  '00005500-0000-1000-8000-00805f9b34fb', // OEM SmartWatch Service
  '000056ff-0000-1000-8000-00805f9b34fb', // OEM Dial Sync
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART (DaFit / HryFine / NRF)
  '00001530-1212-efde-1523-785feabcd123', // Nordic Legacy DFU
  '02f00000-0000-0000-0000-00000000fe00', // Realtek RTL8762x OTA / Dial
  '55e405d2-af9f-a98f-e54a-7dfe43535349', // GloryFit / UTE Watch Service
  'de5bf728-d711-4e47-af26-65e3012a5dc7', // DaFit / Moyoung 128-bit
  '00010203-0405-0607-0809-0a0b0c0d1910', // Telink OTA / Dial
  'f000ffc0-0451-4000-b000-000000000000', // TI OAD / OEM Image Transfer
] as const;

export const COMMON_SMARTWATCH_NAME_PREFIXES = [
  'S71',
  'S7',
  'S8',
  'S9',
  'S6',
  'S5',
  'S10',
  'Watch',
  'Galaxy',
  'Findtime',
  'IDW',
  'ID20',
  'VeryFit',
  'FitCloud',
  'DaFit',
  'GloryFit',
  'HryFine',
  'LaxasFit',
  'RDFit',
  'Co-Fit',
  'JYou',
  'GT',
  'HK',
  'DT',
  'HW',
  'TK',
  'KW',
  'ZL',
  'SW',
  'SMART',
  'Ultra',
  'Chronos',
  'Amazfit',
  'Mibro',
  'Haylou',
  'Colmi',
  'Kospet',
  'Zeblaze',
  'Blackview',
  'Noise',
  'Fire-Boltt',
  'boAt',
  'AK',
  'C20',
  'K22',
  'LW',
  'NX',
  'T800',
  'X8',
] as const;

export const PROTOCOL_PROFILES: Record<WatchBleProtocol, BleProtocolProfile> = {
  fitcloud: {
    id: 'fitcloud',
    name: 'FitCloudPro / TopStep / RTL876x (.bin)',
    shortLabel: 'FitCloudPro (.bin)',
    serviceUuid: '0000feea-0000-1000-8000-00805f9b34fb',
    controlCharUuid: '0000fee1-0000-1000-8000-00805f9b34fb',
    dataCharUuid: '0000fee2-0000-1000-8000-00805f9b34fb',
    defaultMtu: 244,
    knownServiceUuids: [
      '0000feea-0000-1000-8000-00805f9b34fb',
      '0000fee0-0000-1000-8000-00805f9b34fb',
      '0000fee7-0000-1000-8000-00805f9b34fb',
      '02f00000-0000-0000-0000-00000000fe00',
      '0000a00a-0000-1000-8000-00805f9b34fb',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
      '0000ae00-0000-1000-8000-00805f9b34fb',
      '0000ae30-0000-1000-8000-00805f9b34fb',
      '0000d0ff-0000-1000-8000-00805f9b34fb',
    ],
    knownWriteCharUuids: [
      '0000fee2-0000-1000-8000-00805f9b34fb',
      '0000fee1-0000-1000-8000-00805f9b34fb',
      '0000fea1-0000-1000-8000-00805f9b34fb',
      '0000fea2-0000-1000-8000-00805f9b34fb',
      '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
      '0000ae01-0000-1000-8000-00805f9b34fb',
    ],
    knownNotifyCharUuids: [
      '0000fee1-0000-1000-8000-00805f9b34fb',
      '0000fee3-0000-1000-8000-00805f9b34fb',
      '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
      '0000ae02-0000-1000-8000-00805f9b34fb',
    ],
  },
  veryfit: {
    id: 'veryfit',
    name: 'VeryFit / IDO / IDW19 (.iwf.lz)',
    shortLabel: 'VeryFit (.iwf.lz)',
    serviceUuid: '00000af0-0000-1000-8000-00805f9b34fb',
    controlCharUuid: '00000af1-0000-1000-8000-00805f9b34fb',
    dataCharUuid: '00000af6-0000-1000-8000-00805f9b34fb',
    defaultMtu: 182,
    knownServiceUuids: [
      '00000af0-0000-1000-8000-00805f9b34fb',
      '00000af6-0000-1000-8000-00805f9b34fb',
      '0000fee0-0000-1000-8000-00805f9b34fb',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    ],
    knownWriteCharUuids: [
      '00000af6-0000-1000-8000-00805f9b34fb',
      '00000af1-0000-1000-8000-00805f9b34fb',
      '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    ],
    knownNotifyCharUuids: [
      '00000af2-0000-1000-8000-00805f9b34fb',
      '00000af7-0000-1000-8000-00805f9b34fb',
      '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    ],
  },
  universal: {
    id: 'universal',
    name: 'S71 / DaFit / GloryFit / Nordic BLE (.bin)',
    shortLabel: 'Universal / S71 BLE (.bin)',
    serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    controlCharUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    dataCharUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    defaultMtu: 244,
    knownServiceUuids: [
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
      '0000feea-0000-1000-8000-00805f9b34fb',
      '0000fee7-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '0000ff10-0000-1000-8000-00805f9b34fb',
      '000001ff-0000-1000-8000-00805f9b34fb',
      '0000fee0-0000-1000-8000-00805f9b34fb',
      '02f00000-0000-0000-0000-00000000fe00',
      '55e405d2-af9f-a98f-e54a-7dfe43535349',
      '0000ae00-0000-1000-8000-00805f9b34fb',
      '0000ae30-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      'de5bf728-d711-4e47-af26-65e3012a5dc7',
      '0000cdd0-0000-1000-8000-00805f9b34fb',
      '0000f008-0000-1000-8000-00805f9b34fb',
      '00000af0-0000-1000-8000-00805f9b34fb',
    ],
    knownWriteCharUuids: [
      '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
      '0000fee2-0000-1000-8000-00805f9b34fb',
      '0000fee1-0000-1000-8000-00805f9b34fb',
      '0000fea1-0000-1000-8000-00805f9b34fb',
      '0000fea2-0000-1000-8000-00805f9b34fb',
      '0000ff01-0000-1000-8000-00805f9b34fb',
      '0000ff02-0000-1000-8000-00805f9b34fb',
      '0000ff11-0000-1000-8000-00805f9b34fb',
      '0000ae01-0000-1000-8000-00805f9b34fb',
      '0000fff2-0000-1000-8000-00805f9b34fb',
      '0000ffe1-0000-1000-8000-00805f9b34fb',
      '00000af6-0000-1000-8000-00805f9b34fb',
    ],
    knownNotifyCharUuids: [
      '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
      '0000fee1-0000-1000-8000-00805f9b34fb',
      '0000fee3-0000-1000-8000-00805f9b34fb',
      '0000ae02-0000-1000-8000-00805f9b34fb',
      '0000fff1-0000-1000-8000-00805f9b34fb',
      '00000af2-0000-1000-8000-00805f9b34fb',
    ],
  },
};

export interface BleCharacteristicProperties {
  broadcast?: boolean;
  read?: boolean;
  writeWithoutResponse?: boolean;
  write?: boolean;
  notify?: boolean;
  indicate?: boolean;
  authenticatedSignedWrites?: boolean;
  reliableWrite?: boolean;
  writableAuxiliaries?: boolean;
}

export interface BleGattDescriptor {
  uuid: string;
  value?: DataView;
  readValue?: () => Promise<DataView>;
  writeValue?: (value: BufferSource) => Promise<void>;
}

export interface BleGattCharacteristic {
  uuid: string;
  properties: BleCharacteristicProperties;
  value?: DataView;
  readValue?: () => Promise<DataView>;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue?: (value: BufferSource) => Promise<void>;
  startNotifications?: () => Promise<BleGattCharacteristic>;
  getDescriptors?: (descriptor?: string) => Promise<BleGattDescriptor[]>;
  getDescriptor?: (descriptor: string) => Promise<BleGattDescriptor>;
  addEventListener?: (
    type: 'characteristicvaluechanged',
    listener: (ev: { target: BleGattCharacteristic }) => void
  ) => void;
}

export interface BleGattService {
  uuid: string;
  getCharacteristics: () => Promise<BleGattCharacteristic[]>;
  getCharacteristic?: (uuid: string) => Promise<BleGattCharacteristic>;
}

export interface BleGattServer {
  connected: boolean;
  connect: () => Promise<BleGattServer>;
  disconnect: () => void;
  getPrimaryServices: () => Promise<BleGattService[]>;
  getPrimaryService?: (uuid: string) => Promise<BleGattService>;
}

export interface BleAdvertisementEventLike {
  device?: BleDevice;
  name?: string;
  uuids?: string[];
  rssi?: number;
  txPower?: number;
  manufacturerData?: Map<number, DataView>;
  serviceData?: Map<string, DataView>;
}

export interface BleDevice {
  id: string;
  name?: string | null;
  gatt?: BleGattServer;
  watchingAdvertisements?: boolean;
  watchAdvertisements?: (options?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener?: (type: string, listener: (ev: any) => void) => void;
  removeEventListener?: (type: string, listener: (ev: any) => void) => void;
}

export interface BleRequestDeviceOptions {
  filters?: Array<{ services?: string[]; namePrefix?: string }>;
  acceptAllDevices?: boolean;
  optionalServices?: string[];
}

export interface BleNavigatorApi {
  requestDevice: (options: BleRequestDeviceOptions) => Promise<BleDevice>;
  getDevices?: () => Promise<BleDevice[]>;
  getAvailability?: () => Promise<boolean>;
}

export interface GattDescriptorDiagnostic {
  uuid: string;
  knownName: string;
  rawHex: string | null;
  utf8: string | null;
  readError?: string;
}

export interface GattCharacteristicDiagnostic {
  uuid: string;
  knownName: string;
  properties: string[];
  rawValueHex: string | null;
  utf8Value: string | null;
  descriptors: GattDescriptorDiagnostic[];
  readError?: string;
  descriptorError?: string;
}

export interface GattServiceDiagnostic {
  uuid: string;
  knownName: string;
  source: 'getPrimaryServices' | 'probedOptionalService';
  characteristics: GattCharacteristicDiagnostic[];
  error?: string;
}

export interface AdvertisementDiagnostic {
  deviceId: string;
  deviceName: string | null;
  rssi: number | null;
  txPower: number | null;
  uuids: string[];
  manufacturerData: Array<{ companyIdHex: string; rawHex: string }>;
  serviceData: Array<{ uuid: string; rawHex: string }>;
}

export interface ScanDiagnosticEvent {
  timestamp: string;
  stage:
    | 'scan-filter'
    | 'advertisement'
    | 'connect'
    | 'services'
    | 'characteristics'
    | 'descriptors'
    | 'transfer'
    | 'error';
  summary: string;
  detail?: string;
}

export interface DetectedWatchEcosystem {
  ecosystem: WatchEcosystem;
  protocol: WatchBleProtocol;
  label: string;
  matchedServiceUuids: string[];
}

export interface ConnectedWatchSession {
  device: BleDevice;
  server: BleGattServer;
  displayName: string;
  manufacturer: string | null;
  modelNumber: string | null;
  batteryPercent: number | null;
  ecosystem: WatchEcosystem;
  ecosystemLabel: string;
  discoveredServiceUuids: string[];
  serviceTree: GattServiceDiagnostic[];
  characteristicHandles: Map<string, BleGattCharacteristic>;
  activeServiceUuid: string | null;
  controlCharacteristic: BleGattCharacteristic | null;
  writeCharacteristic: BleGattCharacteristic | null;
  notifyCharacteristic: BleGattCharacteristic | null;
  subscribedNotifyUuids: string[];
  waitForNotification?: (timeoutMs?: number) => Promise<Uint8Array | null>;
  writeMode: 'withoutResponse' | 'withResponse' | 'legacy' | 'none';
}

const KNOWN_BLE_UUID_LABELS: Record<string, string> = {
  '00001800-0000-1000-8000-00805f9b34fb': 'Generic Access (GAP)',
  '00001801-0000-1000-8000-00805f9b34fb': 'Generic Attribute (GATT)',
  '0000180a-0000-1000-8000-00805f9b34fb': 'Device Information (DIS)',
  '0000180d-0000-1000-8000-00805f9b34fb': 'Heart Rate Service',
  '0000180f-0000-1000-8000-00805f9b34fb': 'Battery Service',
  '00001812-0000-1000-8000-00805f9b34fb': 'Human Interface Device (HID)',
  '00002a00-0000-1000-8000-00805f9b34fb': 'GAP Device Name',
  '00002a01-0000-1000-8000-00805f9b34fb': 'GAP Appearance',
  '00002a05-0000-1000-8000-00805f9b34fb': 'GATT Service Changed',
  '00002a19-0000-1000-8000-00805f9b34fb': 'Battery Level',
  '00002a24-0000-1000-8000-00805f9b34fb': 'Model Number String',
  '00002a25-0000-1000-8000-00805f9b34fb': 'Serial Number String',
  '00002a26-0000-1000-8000-00805f9b34fb': 'Firmware Revision',
  '00002a27-0000-1000-8000-00805f9b34fb': 'Hardware Revision',
  '00002a29-0000-1000-8000-00805f9b34fb': 'Manufacturer Name',
  '00002900-0000-1000-8000-00805f9b34fb': 'Characteristic Extended Properties',
  '00002901-0000-1000-8000-00805f9b34fb': 'Characteristic User Description',
  '00002902-0000-1000-8000-00805f9b34fb': 'Client Characteristic Config (CCCD)',
  '00002903-0000-1000-8000-00805f9b34fb': 'Server Characteristic Config',
  '00002904-0000-1000-8000-00805f9b34fb': 'Characteristic Presentation Format',
  '0000feea-0000-1000-8000-00805f9b34fb': 'FitCloudPro / TopStep Service',
  '0000fee1-0000-1000-8000-00805f9b34fb': 'FitCloudPro Control / Notify',
  '0000fee2-0000-1000-8000-00805f9b34fb': 'FitCloudPro Data Write',
  '0000fee3-0000-1000-8000-00805f9b34fb': 'FitCloudPro / DaFit Notify',
  '0000fee7-0000-1000-8000-00805f9b34fb': 'Moyoung / DaFit / WeChat OEM Service',
  '0000fee8-0000-1000-8000-00805f9b34fb': 'Realtek / OEM Auxiliary Service',
  '0000fee9-0000-1000-8000-00805f9b34fb': 'Realtek / OEM OTA Service',
  '0000fee0-0000-1000-8000-00805f9b34fb': 'Vendor Control Service',
  '0000fe59-0000-1000-8000-00805f9b34fb': 'Nordic Secure DFU Service',
  '000001ff-0000-1000-8000-00805f9b34fb': 'DaFit / GloryFit Custom Service',
  '0000ff00-0000-1000-8000-00805f9b34fb': 'OEM Smartwatch Primary Service',
  '0000ff10-0000-1000-8000-00805f9b34fb': 'OEM Smartwatch Dial Service',
  '0000ae00-0000-1000-8000-00805f9b34fb': 'Jieli RCSP Service',
  '0000ae30-0000-1000-8000-00805f9b34fb': 'Jieli Dial Transfer Service',
  '00000af0-0000-1000-8000-00805f9b34fb': 'VeryFit / IDO Control Service',
  '00000af6-0000-1000-8000-00805f9b34fb': 'VeryFit / IDO Data Service',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART Service (NUS)',
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART RX (Write)',
  '6e400003-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART TX (Notify)',
  '02f00000-0000-0000-0000-00000000fe00': 'Realtek RTL8762x OTA / Dial',
  '55e405d2-af9f-a98f-e54a-7dfe43535349': 'GloryFit / UTE Vendor Service',
  'de5bf728-d711-4e47-af26-65e3012a5dc7': 'DaFit / Moyoung 128-bit Service',
};

export function describeKnownBleUuid(uuid: string): string {
  const norm = normalizeBleUuid(uuid) ?? uuid.toLowerCase();
  if (KNOWN_BLE_UUID_LABELS[norm]) return KNOWN_BLE_UUID_LABELS[norm];
  const shortMatch = norm.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
  if (shortMatch) {
    return `Vendor / 16-bit UUID (0x${shortMatch[1].toUpperCase()})`;
  }
  return 'Custom 128-bit Vendor UUID';
}

export function normalizeBleUuid(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/^0x/, '');
  if (!trimmed) return null;
  if (/^[0-9a-f]{4}$/.test(trimmed)) {
    return `0000${trimmed}-0000-1000-8000-00805f9b34fb`;
  }
  if (/^[0-9a-f]{8}$/.test(trimmed)) {
    return `${trimmed}-0000-1000-8000-00805f9b34fb`;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function parseExtraServiceUuids(rawInput: string): string[] {
  const tokens = rawInput
    .split(/[\s,;]+/)
    .map((t) => normalizeBleUuid(t))
    .filter((u): u is string => u !== null);
  return Array.from(new Set(tokens));
}

export function expandWatchNamePrefixVariants(rawName: string): string[] {
  const trimmed = rawName.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([
    trimmed,
    trimmed.toUpperCase(),
    trimmed.toLowerCase(),
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
  ]);
  return Array.from(variants);
}

export function formatBytesHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

export function decodePrintableUtf8(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return null;
  const decoded = new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
  if (!decoded) return null;
  // Require mostly printable ASCII/UTF-8 so binary packets aren't shown as mojibake
  let printableCount = 0;
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    if (code >= 32 && code <= 126) printableCount++;
  }
  return printableCount / decoded.length >= 0.7 ? decoded : null;
}

export function extractCharacteristicPropertyLabels(
  props: BleCharacteristicProperties | undefined
): string[] {
  if (!props) return [];
  const labels: string[] = [];
  if (props.read) labels.push('READ');
  if (props.writeWithoutResponse) labels.push('WRITE_NO_RSP');
  if (props.write) labels.push('WRITE');
  if (props.notify) labels.push('NOTIFY');
  if (props.indicate) labels.push('INDICATE');
  if (props.broadcast) labels.push('BROADCAST');
  if (props.authenticatedSignedWrites) labels.push('SIGNED_WRITE');
  if (props.reliableWrite) labels.push('RELIABLE_WRITE');
  return labels;
}

export function parseAdvertisementEvent(
  ev: BleAdvertisementEventLike
): AdvertisementDiagnostic {
  const mfgEntries: Array<{ companyIdHex: string; rawHex: string }> = [];
  if (ev.manufacturerData && typeof ev.manufacturerData.forEach === 'function') {
    ev.manufacturerData.forEach((dv, companyId) => {
      const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      mfgEntries.push({
        companyIdHex: `0x${companyId.toString(16).padStart(4, '0').toUpperCase()}`,
        rawHex: formatBytesHex(bytes),
      });
    });
  }

  const svcEntries: Array<{ uuid: string; rawHex: string }> = [];
  if (ev.serviceData && typeof ev.serviceData.forEach === 'function') {
    ev.serviceData.forEach((dv, uuid) => {
      const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      svcEntries.push({
        uuid: String(uuid).toLowerCase(),
        rawHex: formatBytesHex(bytes),
      });
    });
  }

  return {
    deviceId: ev.device?.id ?? 'unknown',
    deviceName: ev.name ?? ev.device?.name ?? null,
    rssi: typeof ev.rssi === 'number' ? ev.rssi : null,
    txPower: typeof ev.txPower === 'number' ? ev.txPower : null,
    uuids: Array.isArray(ev.uuids)
      ? ev.uuids.map((u) => String(u).toLowerCase())
      : [],
    manufacturerData: mfgEntries,
    serviceData: svcEntries,
  };
}

export function collectCandidateServices(params: {
  customServiceUuid?: string;
  extraServiceUuids?: string[];
}): string[] {
  const normalizedCustom = params.customServiceUuid
    ? normalizeBleUuid(params.customServiceUuid)
    : null;
  return Array.from(
    new Set([
      ...(normalizedCustom ? [normalizedCustom] : []),
      ...(params.extraServiceUuids ?? []),
      ...ALL_SMARTWATCH_VENDOR_SERVICES,
      ...PROTOCOL_PROFILES.fitcloud.knownServiceUuids,
      ...PROTOCOL_PROFILES.veryfit.knownServiceUuids,
      ...PROTOCOL_PROFILES.universal.knownServiceUuids,
      ...STANDARD_BLE_INFO_SERVICES,
    ])
  );
}

export function buildRequestDeviceOptions(params: {
  protocol: WatchBleProtocol;
  scanMode: BleScanMode;
  customServiceUuid?: string;
  extraServiceUuids?: string[];
  nameFilter?: string;
}): BleRequestDeviceOptions {
  const profile = PROTOCOL_PROFILES[params.protocol];
  const normalizedCustom = params.customServiceUuid
    ? normalizeBleUuid(params.customServiceUuid)
    : null;

  const allServices = collectCandidateServices({
    customServiceUuid: params.customServiceUuid,
    extraServiceUuids: params.extraServiceUuids,
  });

  const trimmedName = (params.nameFilter ?? '').trim();

  if (params.scanMode === 'all') {
    return {
      acceptAllDevices: true,
      optionalServices: allServices,
    };
  }

  if (trimmedName.length > 0 || params.scanMode === 'name') {
    const targetName = trimmedName || 'S71';
    const filters = expandWatchNamePrefixVariants(targetName).map((namePrefix) => ({
      namePrefix,
    }));
    return {
      filters,
      optionalServices: allServices,
    };
  }

  const filters: Array<{ services?: string[]; namePrefix?: string }> = [];
  for (const prefix of COMMON_SMARTWATCH_NAME_PREFIXES) {
    filters.push({ namePrefix: prefix });
  }
  if (normalizedCustom && !profile.knownServiceUuids.includes(normalizedCustom)) {
    filters.push({ services: [normalizedCustom] });
  }
  for (const svc of profile.knownServiceUuids) {
    filters.push({ services: [svc] });
  }

  return {
    filters,
    optionalServices: allServices,
  };
}

export function buildCaptureScanOptions(params: {
  includeAllFallback?: boolean;
  nameFilter?: string;
  extraServiceUuids?: string[];
}): BleRequestDeviceOptions {
  const allServices = collectCandidateServices({
    extraServiceUuids: params.extraServiceUuids,
  });

  if (params.includeAllFallback) {
    return {
      acceptAllDevices: true,
      optionalServices: allServices,
    };
  }

  const trimmed = (params.nameFilter ?? '').trim();
  const filters: Array<{ services?: string[]; namePrefix?: string }> = [];

  if (trimmed.length > 0) {
    for (const variant of expandWatchNamePrefixVariants(trimmed)) {
      filters.push({ namePrefix: variant });
    }
  }

  for (const svc of SMARTWATCH_CAPTURE_FILTER_SERVICES) {
    filters.push({ services: [svc] });
  }

  return {
    filters,
    optionalServices: allServices,
  };
}

export function detectWatchEcosystem(
  services: BleGattService[],
  charMap?: Map<string, BleGattCharacteristic[]>
): DetectedWatchEcosystem {
  const uuids = services.map((s) => s.uuid.toLowerCase());
  const veryFitMatches = uuids.filter(
    (u) =>
      u === '00000af0-0000-1000-8000-00805f9b34fb' ||
      u === '00000af6-0000-1000-8000-00805f9b34fb'
  );
  if (veryFitMatches.length > 0) {
    return {
      ecosystem: 'veryfit',
      protocol: 'veryfit',
      label: 'VeryFit / IDO Target (0x0AF0)',
      matchedServiceUuids: veryFitMatches,
    };
  }

  const fitCloudServiceSet = new Set([
    '0000feea-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '0000fee8-0000-1000-8000-00805f9b34fb',
    '0000fee9-0000-1000-8000-00805f9b34fb',
    '0000fea0-0000-1000-8000-00805f9b34fb',
    '0000d0ff-0000-1000-8000-00805f9b34fb',
    '0000a00a-0000-1000-8000-00805f9b34fb',
    '02f00000-0000-0000-0000-00000000fe00',
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '0000ae00-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb',
  ]);
  const fitCloudMatches = uuids.filter((u) => fitCloudServiceSet.has(u));
  if (fitCloudMatches.length > 0) {
    return {
      ecosystem: 'fitcloud',
      protocol: 'fitcloud',
      label: 'FitCloudPro / TopStep DFU',
      matchedServiceUuids: fitCloudMatches,
    };
  }

  const standardSet = new Set<string>(STANDARD_BLE_INFO_SERVICES);
  const writableVendorServices = uuids.filter((u) => {
    if (standardSet.has(u)) return false;
    if (!charMap) return true;
    const svc = services.find((s) => s.uuid.toLowerCase() === u);
    const chars = svc ? charMap.get(svc.uuid) ?? [] : [];
    return chars.some((c) => c.properties.write || c.properties.writeWithoutResponse);
  });

  if (writableVendorServices.length > 0) {
    return {
      ecosystem: 'fitcloud',
      protocol: 'universal',
      label: 'BLE Smartwatch Vendor GATT',
      matchedServiceUuids: writableVendorServices,
    };
  }

  return {
    ecosystem: 'unknown',
    protocol: 'universal',
    label: 'Read-Only / Unverified GATT',
    matchedServiceUuids: [],
  };
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(bytes.byteLength, i + chunkSize));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function hasNativeWatchBridge(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.NativeWatchBridge)
  );
}

export async function pushFitCloudViaNativeBridge(
  bytes: Uint8Array
): Promise<boolean> {
  if (!hasNativeWatchBridge() || typeof window.NativeWatchBridge?.pushFitCloudBin !== 'function') {
    throw new Error('NativeWatchBridge.pushFitCloudBin is only available inside the Android APK build.');
  }
  const b64 = uint8ArrayToBase64(bytes);
  window.NativeWatchBridge.pushFitCloudBin(b64);
  return true;
}

export async function listPreviouslyPairedWatches(
  navBle?: BleNavigatorApi
): Promise<BleDevice[]> {
  if (!navBle?.getDevices) return [];
  try {
    const devices = await navBle.getDevices();
    return Array.isArray(devices) ? devices : [];
  } catch {
    return [];
  }
}

export function createDiagEvent(
  stage: ScanDiagnosticEvent['stage'],
  summary: string,
  detail?: string
): ScanDiagnosticEvent {
  const now = new Date();
  const timestamp = now.toTimeString().slice(0, 8);
  return { timestamp, stage, summary, detail };
}

export async function connectWithGattRetry(
  device: BleDevice,
  attempts = 3,
  onDiag?: (ev: ScanDiagnosticEvent) => void
): Promise<BleGattServer> {
  if (!device.gatt) {
    throw new Error('Selected device does not expose a BLE GATT server.');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      onDiag?.(
        createDiagEvent(
          'connect',
          `GATT connect attempt ${attempt}/${attempts} -> ${device.name || device.id}`
        )
      );
      const server = await device.gatt.connect();
      if (server.connected) {
        onDiag?.(
          createDiagEvent(
            'connect',
            `GATT connected on attempt ${attempt}`,
            `deviceId=${device.id}`
          )
        );
        return server;
      }
      lastError = new Error('GATT server returned connected=false.');
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      onDiag?.(
        createDiagEvent(
          'error',
          `GATT connect attempt ${attempt} failed: ${msg}`
        )
      );
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 260 * attempt));
      }
    }
  }
  const finalMsg =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`GATT connection failed after ${attempts} attempts: ${finalMsg}`);
}

export async function inspectGattTree(params: {
  server: BleGattServer;
  candidateServiceUuids: string[];
  onDiag?: (ev: ScanDiagnosticEvent) => void;
}): Promise<{
  services: BleGattService[];
  charMap: Map<string, BleGattCharacteristic[]>;
  characteristicHandles: Map<string, BleGattCharacteristic>;
  serviceTree: GattServiceDiagnostic[];
}> {
  const { server, candidateServiceUuids, onDiag } = params;
  const discoveredByUuid = new Map<
    string,
    { service: BleGattService; source: 'getPrimaryServices' | 'probedOptionalService' }
  >();

  try {
    const primary = await server.getPrimaryServices();
    onDiag?.(
      createDiagEvent(
        'services',
        `getPrimaryServices() returned ${primary.length} service(s)`,
        primary.map((s) => s.uuid.toLowerCase()).join(', ') || '(none)'
      )
    );
    for (const svc of primary) {
      discoveredByUuid.set(svc.uuid.toLowerCase(), {
        service: svc,
        source: 'getPrimaryServices',
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onDiag?.(
      createDiagEvent(
        'error',
        `getPrimaryServices() failed (${msg}); falling back to per-UUID service probing...`
      )
    );
  }

  // Probe individual candidate services that getPrimaryServices() missed or could not enumerate
  if (typeof server.getPrimaryService === 'function') {
    for (const candidate of candidateServiceUuids) {
      const norm = candidate.toLowerCase();
      if (discoveredByUuid.has(norm)) continue;
      try {
        const svc = await server.getPrimaryService(norm);
        discoveredByUuid.set(svc.uuid.toLowerCase(), {
          service: svc,
          source: 'probedOptionalService',
        });
        onDiag?.(
          createDiagEvent(
            'services',
            `Probed unlisted service ${svc.uuid.toLowerCase()}`,
            describeKnownBleUuid(svc.uuid)
          )
        );
      } catch {
        // Service not present on this device
      }
    }
  }

  const services: BleGattService[] = [];
  const charMap = new Map<string, BleGattCharacteristic[]>();
  const characteristicHandles = new Map<string, BleGattCharacteristic>();
  const serviceTree: GattServiceDiagnostic[] = [];

  for (const [svcUuid, entry] of discoveredByUuid.entries()) {
    const svc = entry.service;
    services.push(svc);
    let chars: BleGattCharacteristic[] = [];
    let svcErr: string | undefined;
    try {
      chars = await svc.getCharacteristics();
      onDiag?.(
        createDiagEvent(
          'characteristics',
          `Service ${svcUuid} -> ${chars.length} characteristic(s)`,
          chars
            .map(
              (c) =>
                `${c.uuid.toLowerCase()} [${extractCharacteristicPropertyLabels(c.properties).join(',')}]`
            )
            .join(' | ') || '(empty)'
        )
      );
    } catch (err) {
      svcErr = err instanceof Error ? err.message : String(err);
      onDiag?.(
        createDiagEvent(
          'error',
          `getCharacteristics(${svcUuid}) failed: ${svcErr}`
        )
      );
    }

    charMap.set(svc.uuid, chars);

    const charDiags: GattCharacteristicDiagnostic[] = [];
    for (const c of chars) {
      const cUuid = c.uuid.toLowerCase();
      characteristicHandles.set(`${svcUuid}/${cUuid}`, c);
      const props = extractCharacteristicPropertyLabels(c.properties);
      let rawValueHex: string | null = null;
      let utf8Value: string | null = null;
      let readError: string | undefined;

      if (c.properties.read && typeof c.readValue === 'function') {
        try {
          const dv = await c.readValue();
          const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
          rawValueHex = formatBytesHex(bytes);
          utf8Value = decodePrintableUtf8(bytes);
        } catch (err) {
          readError = err instanceof Error ? err.message : String(err);
        }
      }

      const descriptors: GattDescriptorDiagnostic[] = [];
      let descriptorError: string | undefined;
      if (typeof c.getDescriptors === 'function') {
        try {
          const rawDescriptors = await c.getDescriptors();
          for (const d of rawDescriptors) {
            const dUuid = d.uuid.toLowerCase();
            let dHex: string | null = null;
            let dUtf8: string | null = null;
            let dReadErr: string | undefined;
            if (typeof d.readValue === 'function') {
              try {
                const ddv = await d.readValue();
                const dBytes = new Uint8Array(
                  ddv.buffer,
                  ddv.byteOffset,
                  ddv.byteLength
                );
                dHex = formatBytesHex(dBytes);
                dUtf8 = decodePrintableUtf8(dBytes);
              } catch (err) {
                dReadErr = err instanceof Error ? err.message : String(err);
              }
            }
            descriptors.push({
              uuid: dUuid,
              knownName: describeKnownBleUuid(dUuid),
              rawHex: dHex,
              utf8: dUtf8,
              ...(dReadErr ? { readError: dReadErr } : {}),
            });
          }
          if (descriptors.length > 0) {
            onDiag?.(
              createDiagEvent(
                'descriptors',
                `Char ${cUuid} -> ${descriptors.length} descriptor(s)`,
                descriptors
                  .map(
                    (d) =>
                      `${d.uuid} (${d.knownName})${d.rawHex ? `=${d.rawHex}` : ''}`
                  )
                  .join(', ')
              )
            );
          }
        } catch (err) {
          descriptorError = err instanceof Error ? err.message : String(err);
        }
      }

      charDiags.push({
        uuid: cUuid,
        knownName: describeKnownBleUuid(cUuid),
        properties: props,
        rawValueHex,
        utf8Value,
        descriptors,
        ...(readError ? { readError } : {}),
        ...(descriptorError ? { descriptorError } : {}),
      });
    }

    serviceTree.push({
      uuid: svcUuid,
      knownName: describeKnownBleUuid(svcUuid),
      source: entry.source,
      characteristics: charDiags,
      ...(svcErr ? { error: svcErr } : {}),
    });
  }

  return { services, charMap, characteristicHandles, serviceTree };
}

export function pickBestGattCharacteristics(
  services: BleGattService[],
  serviceCharacteristics: Map<string, BleGattCharacteristic[]>,
  preferredServiceUuid: string | null,
  preferredCharUuid: string | null,
  protocol: WatchBleProtocol
): {
  activeServiceUuid: string | null;
  writeCharacteristic: BleGattCharacteristic | null;
  controlCharacteristic: BleGattCharacteristic | null;
  notifyCharacteristic: BleGattCharacteristic | null;
} {
  const profile = PROTOCOL_PROFILES[protocol];
  const normPrefService = preferredServiceUuid
    ? normalizeBleUuid(preferredServiceUuid)
    : null;
  const normPrefChar = preferredCharUuid
    ? normalizeBleUuid(preferredCharUuid)
    : null;

  const standardSet = new Set<string>(STANDARD_BLE_INFO_SERVICES);
  const rankedServices = [...services].sort((a, b) => {
    const au = a.uuid.toLowerCase();
    const bu = b.uuid.toLowerCase();
    const score = (u: string) => {
      if (normPrefService && u === normPrefService) return 100;
      const idx = profile.knownServiceUuids.indexOf(u);
      if (idx !== -1) return 80 - idx;
      if (
        ALL_SMARTWATCH_VENDOR_SERVICES.includes(
          u as (typeof ALL_SMARTWATCH_VENDOR_SERVICES)[number]
        )
      ) {
        return 50;
      }
      if (!standardSet.has(u)) return 30;
      return 0;
    };
    return score(bu) - score(au);
  });

  let writeChar: BleGattCharacteristic | null = null;
  let controlChar: BleGattCharacteristic | null = null;
  let notifyChar: BleGattCharacteristic | null = null;
  let activeServiceUuid: string | null = null;

  for (const svc of rankedServices) {
    const chars = serviceCharacteristics.get(svc.uuid) ?? [];
    if (chars.length === 0) continue;

    if (!writeChar && normPrefChar) {
      const exact = chars.find(
        (c) =>
          c.uuid.toLowerCase() === normPrefChar &&
          (c.properties.writeWithoutResponse || c.properties.write)
      );
      if (exact) {
        writeChar = exact;
        activeServiceUuid = svc.uuid;
      }
    }

    if (!writeChar) {
      for (const knownUuid of profile.knownWriteCharUuids) {
        const hit = chars.find(
          (c) =>
            c.uuid.toLowerCase() === knownUuid &&
            (c.properties.writeWithoutResponse || c.properties.write)
        );
        if (hit) {
          writeChar = hit;
          activeServiceUuid = svc.uuid;
          break;
        }
      }
    }

    if (!writeChar && !standardSet.has(svc.uuid.toLowerCase())) {
      const anyWritable = chars.find(
        (c) => c.properties.writeWithoutResponse || c.properties.write
      );
      if (anyWritable) {
        writeChar = anyWritable;
        activeServiceUuid = svc.uuid;
      }
    }

    if (!controlChar) {
      const ctrlNorm = normalizeBleUuid(profile.controlCharUuid);
      const exactCtrl = chars.find(
        (c) =>
          c.uuid.toLowerCase() === ctrlNorm &&
          (c.properties.write || c.properties.writeWithoutResponse)
      );
      if (exactCtrl) controlChar = exactCtrl;
    }

    if (!notifyChar) {
      for (const knownNotify of profile.knownNotifyCharUuids) {
        const hit = chars.find(
          (c) =>
            c.uuid.toLowerCase() === knownNotify &&
            (c.properties.notify || c.properties.indicate)
        );
        if (hit) {
          notifyChar = hit;
          break;
        }
      }
      if (!notifyChar && !standardSet.has(svc.uuid.toLowerCase())) {
        notifyChar =
          chars.find((c) => c.properties.notify || c.properties.indicate) ?? null;
      }
    }
  }

  return {
    activeServiceUuid,
    writeCharacteristic: writeChar,
    controlCharacteristic: controlChar ?? writeChar,
    notifyCharacteristic: notifyChar,
  };
}

export async function connectWatchGatt(params: {
  device: BleDevice;
  protocol: WatchBleProtocol;
  preferredServiceUuid: string;
  preferredCharUuid: string;
  candidateServiceUuids?: string[];
  onNotification?: (bytes: Uint8Array) => void;
  onLog?: (msg: string) => void;
  onDiag?: (ev: ScanDiagnosticEvent) => void;
}): Promise<ConnectedWatchSession> {
  const {
    device,
    protocol,
    preferredServiceUuid,
    preferredCharUuid,
    candidateServiceUuids,
    onNotification,
    onLog,
    onDiag,
  } = params;

  const server = await connectWithGattRetry(device, 3, onDiag);
  const candidates =
    candidateServiceUuids ??
    collectCandidateServices({ customServiceUuid: preferredServiceUuid });

  const { services, charMap, characteristicHandles, serviceTree } = await inspectGattTree({
    server,
    candidateServiceUuids: candidates,
    onDiag,
  });

  const discoveredServiceUuids = services.map((s) => s.uuid.toLowerCase());
  onLog?.(
    `Discovered ${services.length} GATT service(s) across ${serviceTree.reduce(
      (sum, s) => sum + s.characteristics.length,
      0
    )} characteristic(s).`
  );

  let manufacturer: string | null = null;
  let modelNumber: string | null = null;
  let batteryPercent: number | null = null;

  const disNode = serviceTree.find(
    (s) => s.uuid === '0000180a-0000-1000-8000-00805f9b34fb'
  );
  if (disNode) {
    manufacturer =
      disNode.characteristics.find(
        (c) => c.uuid === '00002a29-0000-1000-8000-00805f9b34fb'
      )?.utf8Value ?? null;
    modelNumber =
      disNode.characteristics.find(
        (c) => c.uuid === '00002a24-0000-1000-8000-00805f9b34fb'
      )?.utf8Value ?? null;
  }

  const batterySvc = services.find(
    (s) => s.uuid.toLowerCase() === '0000180f-0000-1000-8000-00805f9b34fb'
  );
  if (batterySvc) {
    const batChars = charMap.get(batterySvc.uuid) ?? [];
    const batChar = batChars.find(
      (c) => c.uuid.toLowerCase() === '00002a19-0000-1000-8000-00805f9b34fb'
    );
    if (batChar?.readValue && batChar.properties.read) {
      try {
        const dv = await batChar.readValue();
        if (dv.byteLength >= 1) batteryPercent = dv.getUint8(0);
      } catch {
        // ignore protected battery characteristic
      }
    }
  }

  const detected = detectWatchEcosystem(services, charMap);
  const effectiveProtocol =
    detected.ecosystem === 'veryfit'
      ? 'veryfit'
      : detected.ecosystem === 'fitcloud'
      ? protocol === 'veryfit'
        ? detected.protocol
        : protocol
      : protocol;

  onDiag?.(
    createDiagEvent(
      'services',
      `Detected ecosystem: ${detected.label}`,
      `Matched: ${detected.matchedServiceUuids.join(', ') || 'generic/none'}`
    )
  );

  const picked = pickBestGattCharacteristics(
    services,
    charMap,
    detected.ecosystem === 'veryfit'
      ? '00000af0-0000-1000-8000-00805f9b34fb'
      : preferredServiceUuid,
    detected.ecosystem === 'veryfit'
      ? '00000af6-0000-1000-8000-00805f9b34fb'
      : preferredCharUuid,
    effectiveProtocol
  );

  // Queue + waiter for incoming ACK notifications (used by VeryFit D1 state machine)
  const pendingNotifications: Uint8Array[] = [];
  const notificationWaiters: Array<(bytes: Uint8Array | null) => void> = [];
  const pushIncomingAck = (bytes: Uint8Array) => {
    const waiter = notificationWaiters.shift();
    if (waiter) waiter(bytes);
    else pendingNotifications.push(bytes);
    onNotification?.(bytes);
  };
  const waitForNotification = (timeoutMs = 1500): Promise<Uint8Array | null> => {
    const queued = pendingNotifications.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = notificationWaiters.indexOf(onWaitResolve);
        if (idx !== -1) notificationWaiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      const onWaitResolve = (bytes: Uint8Array | null) => {
        clearTimeout(timer);
        resolve(bytes);
      };
      notificationWaiters.push(onWaitResolve);
    });
  };

  // Subscribe to all matching notify characteristics (critical for VeryFit 0x0AF7 + 0x0AF2)
  const notifyCandidates: BleGattCharacteristic[] = [];
  const seenNotifyUuids = new Set<string>();
  const addNotifyCandidate = (c: BleGattCharacteristic | null | undefined) => {
    if (!c) return;
    const key = c.uuid.toLowerCase();
    if (seenNotifyUuids.has(key)) return;
    if (!c.properties.notify && !c.properties.indicate) return;
    seenNotifyUuids.add(key);
    notifyCandidates.push(c);
  };

  addNotifyCandidate(picked.notifyCharacteristic);
  const priorityNotifyUuids = new Set([
    '00000af7-0000-1000-8000-00805f9b34fb',
    '00000af2-0000-1000-8000-00805f9b34fb',
    ...PROTOCOL_PROFILES[effectiveProtocol].knownNotifyCharUuids,
  ]);
  for (const chars of charMap.values()) {
    for (const c of chars) {
      if (priorityNotifyUuids.has(c.uuid.toLowerCase())) {
        addNotifyCandidate(c);
      }
    }
  }

  const subscribedNotifyUuids: string[] = [];
  for (const notifyChar of notifyCandidates) {
    try {
      if (notifyChar.startNotifications) {
        await notifyChar.startNotifications();
      }
      if (typeof notifyChar.getDescriptor === 'function') {
        try {
          const cccd = await notifyChar.getDescriptor(
            '00002902-0000-1000-8000-00805f9b34fb'
          );
          if (cccd.writeValue) {
            const enableNotify = new Uint8Array([0x01, 0x00]);
            await cccd.writeValue(enableNotify.buffer);
            onDiag?.(
              createDiagEvent(
                'descriptors',
                `Wrote CCCD 0x2902=[01 00] on ${notifyChar.uuid.toLowerCase()}`
              )
            );
          }
        } catch {
          // Many browsers handle CCCD automatically inside startNotifications()
        }
      }
      notifyChar.addEventListener?.(
        'characteristicvaluechanged',
        (ev: { target: BleGattCharacteristic }) => {
          const val = ev.target.value;
          if (!val) return;
          const bytes = new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
          pushIncomingAck(bytes);
        }
      );
      subscribedNotifyUuids.push(notifyChar.uuid.toLowerCase());
      onLog?.(`Subscribed to watch ACK notifications (${notifyChar.uuid}).`);
    } catch {
      onLog?.(`Watch notification subscription skipped on ${notifyChar.uuid}.`);
    }
  }

  const writeMode: ConnectedWatchSession['writeMode'] = picked.writeCharacteristic
    ? picked.writeCharacteristic.properties.writeWithoutResponse
      ? 'withoutResponse'
      : picked.writeCharacteristic.properties.write
      ? 'withResponse'
      : 'legacy'
    : 'none';

  const resolvedName =
    device.name?.trim() ||
    [manufacturer, modelNumber].filter(Boolean).join(' ').trim() ||
    `BLE Watch (${device.id.slice(0, 8)})`;

  return {
    device,
    server,
    displayName: resolvedName,
    manufacturer,
    modelNumber,
    batteryPercent,
    ecosystem: detected.ecosystem,
    ecosystemLabel: detected.label,
    discoveredServiceUuids,
    serviceTree,
    characteristicHandles,
    activeServiceUuid: picked.activeServiceUuid,
    controlCharacteristic: picked.controlCharacteristic,
    writeCharacteristic: picked.writeCharacteristic,
    notifyCharacteristic: notifyCandidates[0] ?? picked.notifyCharacteristic,
    subscribedNotifyUuids,
    waitForNotification,
    writeMode,
  };
}

export function overrideSessionCharacteristic(
  session: ConnectedWatchSession,
  serviceUuid: string,
  charUuid: string,
  role: 'write' | 'control'
): ConnectedWatchSession {
  const key = `${serviceUuid.toLowerCase()}/${charUuid.toLowerCase()}`;
  const target = session.characteristicHandles.get(key);
  if (!target) {
    throw new Error(`Characteristic ${charUuid} under service ${serviceUuid} was not found in active GATT session.`);
  }
  if (role === 'control') {
    return {
      ...session,
      activeServiceUuid: serviceUuid.toLowerCase(),
      controlCharacteristic: target,
    };
  }
  const nextWriteMode: ConnectedWatchSession['writeMode'] = target.properties.writeWithoutResponse
    ? 'withoutResponse'
    : target.properties.write
    ? 'withResponse'
    : 'legacy';
  return {
    ...session,
    activeServiceUuid: serviceUuid.toLowerCase(),
    writeCharacteristic: target,
    controlCharacteristic: session.controlCharacteristic ?? target,
    writeMode: nextWriteMode,
  };
}

export function formatDiagnosticReport(params: {
  protocol: WatchBleProtocol;
  scanMode: BleScanMode;
  nameFilter: string;
  requestOptions: BleRequestDeviceOptions;
  extraServiceUuids: string[];
  advertisements: AdvertisementDiagnostic[];
  session: ConnectedWatchSession | null;
  events: ScanDiagnosticEvent[];
}): string {
  const {
    protocol,
    scanMode,
    nameFilter,
    requestOptions,
    extraServiceUuids,
    advertisements,
    session,
    events,
  } = params;

  const summary = {
    generatedAt: new Date().toISOString(),
    protocol,
    scanMode,
    nameFilter: nameFilter.trim() || null,
    extraServiceUuids,
    requestDeviceOptions: requestOptions,
    advertisements,
    connectedSession: session
      ? {
          deviceId: session.device.id,
          deviceName: session.device.name ?? null,
          displayName: session.displayName,
          connected: session.server.connected,
          manufacturer: session.manufacturer,
          modelNumber: session.modelNumber,
          batteryPercent: session.batteryPercent,
          activeServiceUuid: session.activeServiceUuid,
          writeCharacteristic: session.writeCharacteristic?.uuid ?? null,
          controlCharacteristic: session.controlCharacteristic?.uuid ?? null,
          notifyCharacteristic: session.notifyCharacteristic?.uuid ?? null,
          writeMode: session.writeMode,
          serviceTree: session.serviceTree,
        }
      : null,
    interceptEvents: events,
  };

  return JSON.stringify(summary, null, 2);
}

export interface DialTransferPacketPlan {
  startPacket: Uint8Array;
  dataChunks: Uint8Array[];
  commitPacket: Uint8Array;
  crc16: number;
  crc32: number;
  totalBytes: number;
}

export function buildDialTransferPackets(
  payload: Uint8Array,
  protocol: WatchBleProtocol,
  mtuSize: number
): DialTransferPacketPlan {
  const safeMtu = Math.max(20, Math.min(512, Math.floor(mtuSize || 180)));
  const crc16 = crc16Ccitt(payload);
  const crc32Val = crc32(payload);

  if (protocol === 'fitcloud' || protocol === 'universal') {
    const startPacket = new Uint8Array(16);
    const sv = new DataView(startPacket.buffer);
    sv.setUint8(0, 0xab);
    sv.setUint8(1, 0x00);
    sv.setUint8(2, 0x20); // Dial transfer INIT
    sv.setUint8(3, 0x0c);
    sv.setUint32(4, payload.byteLength, true);
    sv.setUint16(8, crc16, true);
    sv.setUint32(10, crc32Val, true);
    sv.setUint16(14, safeMtu, true);

    const dataChunks: Uint8Array[] = [];
    for (let offset = 0; offset < payload.byteLength; offset += safeMtu) {
      dataChunks.push(payload.subarray(offset, Math.min(payload.byteLength, offset + safeMtu)));
    }

    const commitPacket = new Uint8Array(10);
    const cv = new DataView(commitPacket.buffer);
    cv.setUint8(0, 0xab);
    cv.setUint8(1, 0x00);
    cv.setUint8(2, 0x21); // Dial transfer COMMIT
    cv.setUint16(3, crc16, true);
    cv.setUint32(5, crc32Val, true);
    cv.setUint8(9, 0x01);

    return {
      startPacket,
      dataChunks,
      commitPacket,
      crc16,
      crc32: crc32Val,
      totalBytes: payload.byteLength,
    };
  }

  const chunkPayloadCapacity = Math.max(16, safeMtu - 2);
  const dataChunks: Uint8Array[] = [];
  let seq = 0;
  for (let offset = 0; offset < payload.byteLength; offset += chunkPayloadCapacity) {
    const slice = payload.subarray(
      offset,
      Math.min(payload.byteLength, offset + chunkPayloadCapacity)
    );
    const packet = new Uint8Array(2 + slice.byteLength);
    new DataView(packet.buffer).setUint16(0, seq & 0xffff, true);
    packet.set(slice, 2);
    dataChunks.push(packet);
    seq++;
  }

  const startPacket = new Uint8Array(13);
  const sv = new DataView(startPacket.buffer);
  sv.setUint8(0, 0xd1);
  sv.setUint8(1, 0x01); // VeryFit D1 File Metadata Initiation
  sv.setUint32(2, payload.byteLength, true);
  sv.setUint8(6, 0x01); // Compressed .iwf.lz flag
  sv.setUint32(7, crc32Val, true);
  sv.setUint16(11, dataChunks.length & 0xffff, true);

  const commitPacket = new Uint8Array(8);
  const cv = new DataView(commitPacket.buffer);
  cv.setUint8(0, 0xd1);
  cv.setUint8(1, 0x02); // VeryFit D1 Transfer Complete & Apply
  cv.setUint16(2, crc16, true);
  cv.setUint32(4, crc32Val, true);

  return {
    startPacket,
    dataChunks,
    commitPacket,
    crc16,
    crc32: crc32Val,
    totalBytes: payload.byteLength,
  };
}

async function writeCharacteristicPacket(
  char: BleGattCharacteristic,
  bytes: Uint8Array,
  preferResponse: boolean
): Promise<void> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const buffer = copy.buffer;

  if (preferResponse && char.writeValueWithResponse && char.properties.write) {
    await char.writeValueWithResponse(buffer);
    return;
  }
  if (char.writeValueWithoutResponse && char.properties.writeWithoutResponse) {
    await char.writeValueWithoutResponse(buffer);
    return;
  }
  if (char.writeValueWithResponse && char.properties.write) {
    await char.writeValueWithResponse(buffer);
    return;
  }
  if (char.writeValue) {
    await char.writeValue(buffer);
    return;
  }
  throw new Error(`Characteristic ${char.uuid} does not support BLE writes.`);
}

async function writeWithMtuStepDown(
  char: BleGattCharacteristic,
  chunk: Uint8Array,
  preferResponse: boolean,
  onStepDown?: (subSize: number) => void
): Promise<void> {
  try {
    await writeCharacteristicPacket(char, chunk, preferResponse);
  } catch (err) {
    if (chunk.byteLength <= 20) throw err;
    const subSize = chunk.byteLength > 120 ? 120 : 20;
    onStepDown?.(subSize);
    for (let off = 0; off < chunk.byteLength; off += subSize) {
      const part = chunk.subarray(off, Math.min(chunk.byteLength, off + subSize));
      await writeWithMtuStepDown(char, part, preferResponse, onStepDown);
      await new Promise((r) => setTimeout(r, 8));
    }
  }
}

export async function flashDialOverGatt(params: {
  session: ConnectedWatchSession;
  payload: Uint8Array;
  protocol: WatchBleProtocol;
  mtuSize: number;
  signal?: AbortSignal;
  ackTimeoutMs?: number;
  onProgress?: (
    pct: number,
    sentChunks: number,
    totalChunks: number,
    sentBytes: number,
    speedKbPerSec: number
  ) => void;
  onLog?: (msg: string) => void;
}): Promise<{
  crc16: number;
  crc32: number;
  chunksSent: number;
  ackReceived: boolean;
  speedKbPerSec: number;
  durationMs: number;
}> {
  const {
    session,
    payload,
    protocol,
    mtuSize,
    signal,
    ackTimeoutMs = 1500,
    onProgress,
    onLog,
  } = params;

  if (!session.server.connected) {
    throw new Error('Bluetooth GATT connection was lost. Capture and connect the watch again before pushing.');
  }
  if (!session.writeCharacteristic) {
    throw new Error(
      `Connected watch "${session.displayName}" has no writable dial/GATT characteristic. ` +
        `Discovered services: ${session.discoveredServiceUuids.join(', ') || 'none'}. ` +
        `Check the Raw GATT Inspector to pick a writable characteristic or use Quick Apply.`
    );
  }

  const plan = buildDialTransferPackets(payload, protocol, mtuSize);
  const controlChar = session.controlCharacteristic ?? session.writeCharacteristic;
  const writeChar = session.writeCharacteristic;
  const startedAt = Date.now();

  onLog?.(
    protocol === 'veryfit'
      ? `D1 Step 1/4: Sending D1 metadata initiation (${plan.totalBytes.toLocaleString()} B, .iwf.lz, CRC32=0x${plan.crc32
          .toString(16)
          .toUpperCase()}) to ${controlChar.uuid}...`
      : `Sending ${protocol.toUpperCase()} DFU INIT handshake (${plan.totalBytes.toLocaleString()} B, CRC16=0x${plan.crc16
          .toString(16)
          .toUpperCase()}) to ${controlChar.uuid}...`
  );
  await writeCharacteristicPacket(controlChar, plan.startPacket, true);

  let ackReceived = false;
  if (
    protocol === 'veryfit' &&
    session.subscribedNotifyUuids.length > 0 &&
    session.waitForNotification
  ) {
    onLog?.(
      `D1 Step 2/4: Waiting for watch ACK on ${session.subscribedNotifyUuids.join(', ')}...`
    );
    const ack = await session.waitForNotification(ackTimeoutMs);
    if (ack) {
      ackReceived = true;
      onLog?.(`D1 ACK received: [${formatBytesHex(ack)}]. Streaming chunks...`);
    } else {
      onLog?.(`D1 ACK window elapsed (${ackTimeoutMs}ms); proceeding with chunked stream.`);
    }
  }

  let bytesTransmitted = 0;
  let loggedStepDown = false;
  const totalChunks = plan.dataChunks.length;
  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
      throw new Error('Bluetooth transfer canceled by user.');
    }
    if (!session.server.connected) {
      throw new Error(`Watch disconnected at packet ${i + 1}/${totalChunks}.`);
    }

    const chunk = plan.dataChunks[i];
    const requireAck = (i + 1) % 8 === 0 || i === totalChunks - 1;
    await writeWithMtuStepDown(writeChar, chunk, requireAck, (subSize) => {
      if (!loggedStepDown) {
        loggedStepDown = true;
        onLog?.(
          `ATT MTU write exceeded watch limit; automatically stepping down packets to ${subSize}B.`
        );
      }
    });
    bytesTransmitted = Math.min(plan.totalBytes, bytesTransmitted + chunk.byteLength);

    const elapsedSec = Math.max(0.05, (Date.now() - startedAt) / 1000);
    const speedKbPerSec = Number((bytesTransmitted / 1024 / elapsedSec).toFixed(1));
    const pct = Math.max(1, Math.min(99, Math.round(((i + 1) / totalChunks) * 100)));
    onProgress?.(pct, i + 1, totalChunks, bytesTransmitted, speedKbPerSec);

    if (!requireAck) {
      await new Promise((r) => setTimeout(r, 8));
    }
  }

  onLog?.(
    protocol === 'veryfit'
      ? `D1 Step 4/4: Sending D1 Transfer Complete & Apply (CRC32=0x${plan.crc32
          .toString(16)
          .toUpperCase()})...`
      : `Sending DFU checksum commit (CRC32=0x${plan.crc32.toString(16).toUpperCase()})...`
  );
  await writeCharacteristicPacket(controlChar, plan.commitPacket, true);
  const durationMs = Math.max(1, Date.now() - startedAt);
  const finalSpeed = Number((plan.totalBytes / 1024 / (durationMs / 1000)).toFixed(1));
  onProgress?.(100, totalChunks, totalChunks, plan.totalBytes, finalSpeed);

  return {
    crc16: plan.crc16,
    crc32: plan.crc32,
    chunksSent: totalChunks,
    ackReceived,
    speedKbPerSec: finalSpeed,
    durationMs,
  };
}
