import { ResolutionSpec } from '../types/watchface';

export interface NativeWatchBridgeApi {
  scanWatches(): void;
  connectFitCloudWatch(macAddress: string): void;
  inspectRawGatt(macAddress: string): void;
  pushFitCloudBin(base64Data: string): void;
  pushVeryFitIwf(base64Data: string, macAddress: string): void;
}

declare global {
  interface Window {
    NativeWatchBridge?: NativeWatchBridgeApi;
  }
}

export interface NativeWatchFoundDetail {
  name: string;
  mac: string;
  rssi: number;
}

export interface NativeWatchStateDetail {
  state: string;
  mac: string;
  lcdWidth: number;
  lcdHeight: number;
  isRound: boolean;
  dialType: number;
}

export interface NativeRawGattCharacteristic {
  uuid: string;
  read: boolean;
  write: boolean;
  writeNoResp: boolean;
  notify: boolean;
}

export interface NativeRawGattService {
  serviceUuid: string;
  characteristics: NativeRawGattCharacteristic[];
}

export interface NativeDfuProgressDetail {
  state?: string;
  percent: number;
  bytesSent?: number;
  totalBytes?: number;
}

export interface NativeDfuCompleteDetail {
  installed: boolean;
  message?: string;
}

export interface NativeWatchErrorDetail {
  message: string;
}

export type NativeWatchEcosystem = 'fitcloud' | 'veryfit';

export interface NativeDfuTransferMeta {
  ecosystem: NativeWatchEcosystem;
  fileName: string;
  totalBytes: number;
  crc16: number;
  crc32: number;
  startedAtMs: number;
}

export interface HardwareResolutionLock {
  mac: string;
  watchName: string;
  lcdWidth: number;
  lcdHeight: number;
  isRound: boolean;
  shape: 'round' | 'squircle';
  dialType: number;
  state: string;
}

export function isNativeApkRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.NativeWatchBridge);
}

export function isNativeConnectedState(state: string | undefined | null): boolean {
  const normalized = (state ?? '').trim().toUpperCase();
  if (!normalized) return false;
  if (
    normalized.includes('DISCONNECT') ||
    normalized.includes('CONNECTING') ||
    normalized.includes('FAILED') ||
    normalized.includes('ERROR')
  ) {
    return false;
  }
  return (
    normalized.includes('CONNECTED') ||
    normalized.includes('READY') ||
    normalized.includes('SYNCHRONIZED')
  );
}

export function upsertNativeFoundWatch(
  existing: NativeWatchFoundDetail[],
  incoming: NativeWatchFoundDetail
): NativeWatchFoundDetail[] {
  const normalizedMac = incoming.mac.trim().toUpperCase();
  if (!normalizedMac) return existing;
  const entry: NativeWatchFoundDetail = {
    name: (incoming.name || 'Unknown Watch').trim(),
    mac: normalizedMac,
    rssi: Number.isFinite(incoming.rssi) ? incoming.rssi : -99,
  };
  const next = existing.filter((d) => d.mac.toUpperCase() !== normalizedMac);
  next.push(entry);
  return next.sort((a, b) => b.rssi - a.rssi);
}

export function createHardwareLockedResolutionSpec(
  lcdWidth: number,
  lcdHeight: number,
  isRound: boolean
): ResolutionSpec {
  const width = Math.max(120, Math.round(lcdWidth));
  const height = Math.max(120, Math.round(lcdHeight));
  const shape = isRound ? 'round' : 'squircle';
  const cornerRadius = isRound
    ? Math.round(Math.min(width, height) / 2)
    : Math.round(Math.min(width, height) * 0.2);

  return {
    id: `${width}x${height}${isRound ? '' : '-square'}`,
    label: formatHardwareLockBadgeText(width, height, isRound),
    width,
    height,
    shape,
    cornerRadius,
    isFullHdMaster: false,
  };
}

export function formatHardwareLockBadgeText(
  lcdWidth: number,
  lcdHeight: number,
  isRound: boolean
): string {
  return `Hardware Locked: ${Math.round(lcdWidth)}×${Math.round(lcdHeight)} (${
    isRound ? 'Round' : 'Squircle'
  })`;
}

export function inferNativeEcosystemFromGatt(
  services: NativeRawGattService[]
): NativeWatchEcosystem {
  const hasVeryFit = services.some((svc) => {
    const u = svc.serviceUuid.toLowerCase();
    return u.includes('00000af0') || u.includes('00000af6');
  });
  return hasVeryFit ? 'veryfit' : 'fitcloud';
}

export function stripBase64DataUrlPrefix(base64OrDataUrl: string): string {
  const trimmed = base64OrDataUrl.trim();
  const commaIdx = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIdx !== -1) {
    return trimmed.slice(commaIdx + 1).trim();
  }
  return trimmed;
}

export function resolveNativeDfuMac(
  selectedMac?: string | null,
  hardwareLock?: HardwareResolutionLock | null,
  nativeState?: NativeWatchStateDetail | null
): string {
  return (
    (selectedMac || hardwareLock?.mac || nativeState?.mac || '')
      .trim()
      .toUpperCase()
  );
}

export function dispatchNativeWatchFacePush(
  bridge: Partial<NativeWatchBridgeApi> | null | undefined,
  params: {
    ecosystem: NativeWatchEcosystem;
    base64Data: string;
    macAddress?: string;
  }
): 'pushFitCloudBin' | 'pushVeryFitIwf' {
  if (!bridge) {
    throw new Error('NativeWatchBridge is unavailable outside the Android APK.');
  }
  const cleanBase64 = stripBase64DataUrlPrefix(params.base64Data);
  if (!cleanBase64) {
    throw new Error('Compiled watch face binary payload is empty.');
  }

  if (params.ecosystem === 'veryfit') {
    const mac = (params.macAddress ?? '').trim();
    if (!mac) {
      throw new Error(
        'Select a watch MAC address in Step 1 before pushing VeryFit .iwf.lz.'
      );
    }
    if (typeof bridge.pushVeryFitIwf !== 'function') {
      throw new Error('NativeWatchBridge.pushVeryFitIwf is not available.');
    }
    bridge.pushVeryFitIwf(cleanBase64, mac);
    return 'pushVeryFitIwf';
  }

  if (typeof bridge.pushFitCloudBin !== 'function') {
    throw new Error('NativeWatchBridge.pushFitCloudBin is not available.');
  }
  bridge.pushFitCloudBin(cleanBase64);
  return 'pushFitCloudBin';
}

export function normalizeNativeDfuProgress(
  detail: NativeDfuProgressDetail,
  meta: NativeDfuTransferMeta | null,
  nowMs = Date.now()
): {
  percent: number;
  bytesSent: number;
  totalBytes: number;
  speedKbPerSec: number;
  phaseLabel: string;
} {
  const percent = Math.max(0, Math.min(100, Math.round(detail.percent ?? 0)));
  const totalBytes = detail.totalBytes ?? meta?.totalBytes ?? 0;
  const bytesSent =
    detail.bytesSent ?? Math.round((totalBytes * percent) / 100);
  const elapsedSec = meta
    ? Math.max(0.1, (nowMs - meta.startedAtMs) / 1000)
    : 1;
  const speedKbPerSec =
    bytesSent > 0 ? Number((bytesSent / 1024 / elapsedSec).toFixed(1)) : 0;

  const trimmedState = (detail.state ?? '').trim();
  const phaseLabel = trimmedState
    ? `DFU ${trimmedState} (${percent}%)`
    : meta?.ecosystem === 'veryfit'
    ? `Streaming .iwf.lz via Android BLE (${percent}%)`
    : `Streaming .bin via Android BLE (${percent}%)`;

  return {
    percent,
    bytesSent,
    totalBytes,
    speedKbPerSec,
    phaseLabel,
  };
}

export type NormalizedNativeDfuCompletion =
  | { status: 'ignored' }
  | { status: 'failed'; errorMessage: string }
  | {
      status: 'installed';
      summary: {
        fileName: string;
        totalBytes: number;
        chunksSent: number;
        speedKbPerSec: number;
        crc16: number;
        crc32: number;
        method: 'nativeBridge';
      };
    };

export function normalizeNativeDfuComplete(
  detail: NativeDfuCompleteDetail | null | undefined,
  meta: NativeDfuTransferMeta | null,
  nowMs = Date.now()
): NormalizedNativeDfuCompletion {
  if (!detail) return { status: 'ignored' };
  if (detail.installed === false) {
    return {
      status: 'failed',
      errorMessage:
        detail.message?.trim() ||
        'Watch did not confirm DFU installation.',
    };
  }
  if (!detail.installed) return { status: 'ignored' };

  const elapsedSec = meta
    ? Math.max(0.1, (nowMs - meta.startedAtMs) / 1000)
    : 1;
  const totalBytes = meta?.totalBytes ?? 0;
  const defaultFileName =
    meta?.ecosystem === 'veryfit'
      ? 'chronos_watchface.iwf.lz'
      : 'chronos_watchface.bin';

  return {
    status: 'installed',
    summary: {
      fileName: meta?.fileName ?? defaultFileName,
      totalBytes,
      chunksSent: 100,
      speedKbPerSec:
        totalBytes > 0
          ? Number((totalBytes / 1024 / elapsedSec).toFixed(1))
          : 0,
      crc16: meta?.crc16 ?? 0,
      crc32: meta?.crc32 ?? 0,
      method: 'nativeBridge',
    },
  };
}

