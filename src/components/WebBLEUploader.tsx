import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Lock,
  Radio,
  Send,
  ShieldAlert,
  Smartphone,
  Terminal,
  Trash2,
  Watch,
  Wifi,
  X,
} from 'lucide-react';
import { buildFitCloudBin } from '../compilers/fitcloudCompiler';
import { buildVeryFitPackage } from '../compilers/veryfitCompiler';
import { crc16Ccitt, crc32 } from '../compilers/compression';
import { renderStaticBackgroundCanvas } from '../engine/renderer';
import {
  adaptWatchFaceToResolution,
  clampWatchExportResolution,
  RESOLUTION_SPECS,
} from '../presets/watchPresets';
import {
  dispatchNativeWatchFacePush,
  formatHardwareLockBadgeText,
  HardwareResolutionLock,
  inferNativeEcosystemFromGatt,
  isNativeApkRuntime,
  isNativeConnectedState,
  NativeDfuCompleteDetail,
  NativeDfuProgressDetail,
  NativeDfuTransferMeta,
  NativeRawGattService,
  NativeWatchEcosystem,
  NativeWatchErrorDetail,
  NativeWatchFoundDetail,
  NativeWatchStateDetail,
  normalizeNativeDfuComplete,
  normalizeNativeDfuProgress,
  resolveNativeDfuMac,
  upsertNativeFoundWatch,
} from '../types/nativeBridge';
import { ResolutionSpec, SimulationState, WatchFaceConfig } from '../types/watchface';
import {
  AdvertisementDiagnostic,
  BleAdvertisementEventLike,
  BleDevice,
  BleNavigatorApi,
  buildCaptureScanOptions,
  buildDialTransferPackets,
  collectCandidateServices,
  ConnectedWatchSession,
  connectWatchGatt,
  createDiagEvent,
  flashDialOverGatt,
  formatDiagnosticReport,
  listPreviouslyPairedWatches,
  overrideSessionCharacteristic,
  parseAdvertisementEvent,
  parseExtraServiceUuids,
  PROTOCOL_PROFILES,
  ScanDiagnosticEvent,
  uint8ArrayToBase64,
  WatchBleProtocol,
} from '../utils/bleWatchTransfer';

interface WebBLEUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  config: WatchFaceConfig;
  sim: SimulationState;
  hardwareLock?: HardwareResolutionLock | null;
  onHardwareLockChange?: (lock: HardwareResolutionLock | null) => void;
}

type ModalMainTab = 'wizard' | 'quickApply';
type WizardStep = 1 | 2 | 3 | 4;
type DiagSubTab = 'gatt' | 'log';

const QUICK_APPLY_TARGETS: Array<{ id: string; label: string; spec: ResolutionSpec }> = [
  {
    id: '466x466',
    label: '466×466 Round',
    spec: RESOLUTION_SPECS.find((r) => r.id === '466x466')!,
  },
  {
    id: '360x360',
    label: '360×360 Round',
    spec: RESOLUTION_SPECS.find((r) => r.id === '360x360')!,
  },
  {
    id: '368x448',
    label: '368×448 Square',
    spec: RESOLUTION_SPECS.find((r) => r.id === '368x448')!,
  },
  {
    id: '240x284',
    label: '240×284 Square',
    spec: RESOLUTION_SPECS.find((r) => r.id === '240x284')!,
  },
];

function triggerFileDownload(
  bytes: Uint8Array,
  fileName: string,
  mimeType = 'application/octet-stream'
): void {
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode dial PNG image.'));
      },
      'image/png',
      1
    );
  });
}

async function shareOrSavePngFile(
  file: File,
  title: string,
  text: string
): Promise<'shared' | 'downloaded'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const canShare =
      typeof navigator.canShare === 'function'
        ? navigator.canShare({ files: [file] })
        : true;
    if (canShare) {
      try {
        await navigator.share({ files: [file], title, text });
        return 'shared';
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }
      }
    }
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  triggerFileDownload(bytes, file.name, 'image/png');
  return 'downloaded';
}

export const WebBLEUploader: React.FC<WebBLEUploaderProps> = ({
  isOpen,
  onClose,
  config,
  sim,
  hardwareLock = null,
  onHardwareLockChange,
}) => {
  const [mainTab, setMainTab] = useState<ModalMainTab>('wizard');
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  const [protocol, setProtocol] = useState<WatchBleProtocol>('fitcloud');
  const [nameFilter, setNameFilter] = useState('');
  const [useAllFallback, setUseAllFallback] = useState(false);
  const [serviceUuid, setServiceUuid] = useState(
    PROTOCOL_PROFILES.fitcloud.serviceUuid
  );
  const [charUuid, setCharUuid] = useState(
    PROTOCOL_PROFILES.fitcloud.dataCharUuid
  );
  const [extraServiceInput, setExtraServiceInput] = useState('');
  const [mtuSize, setMtuSize] = useState(PROTOCOL_PROFILES.fitcloud.defaultMtu);

  const [rememberedDevices, setRememberedDevices] = useState<BleDevice[]>([]);
  const [advertisements, setAdvertisements] = useState<AdvertisementDiagnostic[]>([]);
  const [session, setSession] = useState<ConnectedWatchSession | null>(null);

  // NativeWatchBridge APK state
  const [nativeFoundWatches, setNativeFoundWatches] = useState<NativeWatchFoundDetail[]>([]);
  const [isNativeScanning, setIsNativeScanning] = useState(false);
  const [selectedMac, setSelectedMac] = useState<string>('');
  const [selectedWatchName, setSelectedWatchName] = useState<string>('');
  const [nativeState, setNativeState] = useState<NativeWatchStateDetail | null>(null);
  const [nativeRawGatt, setNativeRawGatt] = useState<NativeRawGattService[]>([]);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [transferStats, setTransferStats] = useState<{
    sentChunks: number;
    totalChunks: number;
    sentBytes: number;
    totalBytes: number;
    speedKbPerSec: number;
    phaseLabel: string;
  }>({
    sentChunks: 0,
    totalChunks: 0,
    sentBytes: 0,
    totalBytes: 0,
    speedKbPerSec: 0,
    phaseLabel: 'Ready',
  });
  const [installSummary, setInstallSummary] = useState<{
    fileName: string;
    totalBytes: number;
    chunksSent: number;
    speedKbPerSec: number;
    crc16: number;
    crc32: number;
    method: 'ble' | 'nativeBridge';
  } | null>(null);

  const [statusError, setStatusError] = useState<string | null>(null);
  const [diagTab, setDiagTab] = useState<DiagSubTab>('gatt');
  const [copiedReport, setCopiedReport] = useState(false);

  // Quick Apply (Tab 2) states
  const [quickTargetId, setQuickTargetId] = useState<string>(() => {
    if (config.resolution.shape === 'squircle') return '368x448';
    return config.resolution.width === 360 ? '360x360' : '466x466';
  });
  const [quickPreviewUrl, setQuickPreviewUrl] = useState<string | null>(null);
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);

  const [events, setEvents] = useState<ScanDiagnosticEvent[]>(() => [
    createDiagEvent(
      'scan-filter',
      'Watch Capture & Push System armed.',
      'Step 1 filters 0x0AF0, 0xFEE7, 0x180A, 0x180F with acceptAllDevices fallback.'
    ),
  ]);

  const abortRef = useRef<AbortController | null>(null);
  const advAbortRef = useRef<AbortController | null>(null);
  const nativeScanTimerRef = useRef<number | null>(null);
  const disconnectHandlerRef = useRef<(() => void) | null>(null);
  const lastNativeCompileRef = useRef<NativeDfuTransferMeta | null>(null);
  const selectedWatchNameRef = useRef<string>('');
  selectedWatchNameRef.current = selectedWatchName;
  const hardwareLockRef = useRef<HardwareResolutionLock | null>(hardwareLock);
  hardwareLockRef.current = hardwareLock;
  const nativeStateRef = useRef<NativeWatchStateDetail | null>(nativeState);
  nativeStateRef.current = nativeState;
  const onHardwareLockChangeRef = useRef(onHardwareLockChange);
  onHardwareLockChangeRef.current = onHardwareLockChange;

  const isNativeApk = isNativeApkRuntime();

  const extraServiceUuids = useMemo(
    () => parseExtraServiceUuids(extraServiceInput),
    [extraServiceInput]
  );

  const currentCaptureOptions = useMemo(
    () =>
      buildCaptureScanOptions({
        includeAllFallback: useAllFallback,
        nameFilter,
        extraServiceUuids,
      }),
    [useAllFallback, nameFilter, extraServiceUuids]
  );

  const quickSpec = useMemo(() => {
    return (
      QUICK_APPLY_TARGETS.find((t) => t.id === quickTargetId)?.spec ??
      QUICK_APPLY_TARGETS[0].spec
    );
  }, [quickTargetId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      advAbortRef.current?.abort();
      if (nativeScanTimerRef.current !== null) {
        window.clearTimeout(nativeScanTimerRef.current);
      }
    };
  }, []);

  // Global NativeWatchBridge event listeners (active whenever NativeBridge or modal is open)
  useEffect(() => {
    if (!isNativeApk && !isOpen) return;

    const handleNativeWatchFound = (ev: Event) => {
      const detail = (ev as CustomEvent<NativeWatchFoundDetail>).detail;
      if (!detail || !detail.mac) return;
      setNativeFoundWatches((prev) => upsertNativeFoundWatch(prev, detail));
      setEvents((prev) => [
        ...prev.slice(-119),
        createDiagEvent(
          'advertisement',
          `Native found ${detail.name || 'Watch'} (${detail.mac}) · ${detail.rssi} dBm`
        ),
      ]);
    };

    const handleNativeRawGatt = (ev: Event) => {
      const detail = (ev as CustomEvent<NativeRawGattService[]>).detail;
      if (!Array.isArray(detail)) return;
      setNativeRawGatt(detail);
      const detected = inferNativeEcosystemFromGatt(detail);
      setProtocol(detected);
      setMtuSize(PROTOCOL_PROFILES[detected].defaultMtu);
      setEvents((prev) => [
        ...prev.slice(-119),
        createDiagEvent(
          'services',
          `Native raw GATT discovered ${detail.length} service(s) -> ${
            detected === 'veryfit' ? 'VeryFit / IDO (0x0AF0)' : 'FitCloudPro / TopStep'
          }`
        ),
      ]);
    };

    const handleNativeWatchState = (ev: Event) => {
      const detail = (ev as CustomEvent<NativeWatchStateDetail>).detail;
      if (!detail) return;
      setNativeState(detail);
      setEvents((prev) => [
        ...prev.slice(-119),
        createDiagEvent(
          'connect',
          `Native watch state: ${detail.state} (${detail.lcdWidth}×${detail.lcdHeight} ${
            detail.isRound ? 'Round' : 'Squircle'
          })`,
          `mac=${detail.mac} dialType=${detail.dialType}`
        ),
      ]);

      if (
        isNativeConnectedState(detail.state) &&
        detail.lcdWidth > 0 &&
        detail.lcdHeight > 0
      ) {
        setIsConnecting(false);
        setIsNativeScanning(false);
        setStatusError(null);
        if (detail.mac) {
          setSelectedMac(detail.mac.toUpperCase());
        }
        onHardwareLockChangeRef.current?.({
          mac: (detail.mac || '').toUpperCase(),
          watchName:
            selectedWatchNameRef.current || detail.mac || 'Connected Watch',
          lcdWidth: Math.round(detail.lcdWidth),
          lcdHeight: Math.round(detail.lcdHeight),
          isRound: Boolean(detail.isRound),
          shape: detail.isRound ? 'round' : 'squircle',
          dialType: detail.dialType ?? 0,
          state: detail.state,
        });
        setWizardStep((prev) => (prev < 3 ? 3 : prev));
      } else if ((detail.state ?? '').toUpperCase().includes('DISCONNECT')) {
        setIsConnecting(false);
        setIsFlashing(false);
      }
    };

    const handleNativeDfuProgress = (ev: Event) => {
      const detail = (ev as CustomEvent<NativeDfuProgressDetail>).detail;
      if (!detail) return;
      const normalized = normalizeNativeDfuProgress(
        detail,
        lastNativeCompileRef.current
      );
      setIsFlashing(true);
      setStatusError(null);
      setWizardStep(3);
      setProgress(normalized.percent);
      setTransferStats({
        sentChunks: normalized.percent,
        totalChunks: 100,
        sentBytes: normalized.bytesSent,
        totalBytes: normalized.totalBytes,
        speedKbPerSec: normalized.speedKbPerSec,
        phaseLabel: normalized.phaseLabel,
      });
      if (
        normalized.percent === 0 ||
        normalized.percent === 50 ||
        normalized.percent === 100
      ) {
        setEvents((prev) => [
          ...prev.slice(-119),
          createDiagEvent('transfer', normalized.phaseLabel),
        ]);
      }
    };

    const handleNativeDfuComplete = (ev: Event) => {
      const detail = (ev as CustomEvent<NativeDfuCompleteDetail>).detail;
      const result = normalizeNativeDfuComplete(
        detail,
        lastNativeCompileRef.current
      );
      if (result.status === 'ignored') return;
      if (result.status === 'failed') {
        setIsFlashing(false);
        setStatusError(result.errorMessage);
        setEvents((prev) => [
          ...prev.slice(-119),
          createDiagEvent('error', `Native DFU incomplete: ${result.errorMessage}`),
        ]);
        return;
      }

      setIsFlashing(false);
      setStatusError(null);
      setProgress(100);
      setInstallSummary(result.summary);
      setEvents((prev) => [
        ...prev.slice(-119),
        createDiagEvent('transfer', 'Native DFU complete: Watch Face Installed on Watch!'),
      ]);
      setWizardStep(4);
    };

    const handleNativeWatchError = (ev: Event) => {
      const detail = (ev as CustomEvent<NativeWatchErrorDetail>).detail;
      const msg = detail?.message || 'Native Bluetooth operation failed.';
      setIsConnecting(false);
      setIsNativeScanning(false);
      setIsFlashing(false);
      setStatusError(msg);
      setEvents((prev) => [
        ...prev.slice(-119),
        createDiagEvent('error', `Native Bridge Error: ${msg}`),
      ]);
    };

    window.addEventListener('native-watch-found', handleNativeWatchFound);
    window.addEventListener('native-raw-gatt', handleNativeRawGatt);
    window.addEventListener('native-watch-state', handleNativeWatchState);
    window.addEventListener('native-dfu-progress', handleNativeDfuProgress);
    window.addEventListener('native-dfu-complete', handleNativeDfuComplete);
    window.addEventListener('native-watch-error', handleNativeWatchError);

    return () => {
      window.removeEventListener('native-watch-found', handleNativeWatchFound);
      window.removeEventListener('native-raw-gatt', handleNativeRawGatt);
      window.removeEventListener('native-watch-state', handleNativeWatchState);
      window.removeEventListener('native-dfu-progress', handleNativeDfuProgress);
      window.removeEventListener('native-dfu-complete', handleNativeDfuComplete);
      window.removeEventListener('native-watch-error', handleNativeWatchError);
    };
  }, [isNativeApk, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setQuickTargetId(
      config.resolution.shape === 'squircle'
        ? config.resolution.id === '240x284'
          ? '240x284'
          : '368x448'
        : config.resolution.width === 360
        ? '360x360'
        : '466x466'
    );
    if (!isNativeApk && typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      const navBle = (navigator as unknown as { bluetooth: BleNavigatorApi })
        .bluetooth;
      listPreviouslyPairedWatches(navBle).then(setRememberedDevices);
    }
  }, [
    isOpen,
    isNativeApk,
    config.resolution.id,
    config.resolution.shape,
    config.resolution.width,
  ]);

  // Render clean dial plate (hands & digits stripped) for Quick Apply preview
  useEffect(() => {
    if (!isOpen || mainTab !== 'quickApply') return;
    try {
      const adapted = adaptWatchFaceToResolution(config, quickSpec);
      const canvas = renderStaticBackgroundCanvas(adapted, sim);
      setQuickPreviewUrl(canvas.toDataURL('image/png'));
    } catch {
      setQuickPreviewUrl(null);
    }
  }, [isOpen, mainTab, config, sim, quickSpec]);

  if (!isOpen) return null;

  const hasWebBluetooth =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const isInIframe =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  const pushDiag = (ev: ScanDiagnosticEvent) => {
    setEvents((prev) => [...prev.slice(-119), ev]);
  };

  const appendLog = (
    msg: string,
    stage: ScanDiagnosticEvent['stage'] = 'transfer'
  ) => {
    pushDiag(createDiagEvent(stage, msg));
  };

  const stopAdvertisementWatcher = () => {
    if (advAbortRef.current) {
      advAbortRef.current.abort();
      advAbortRef.current = null;
    }
  };

  const attachAdvertisementWatcher = async (device: BleDevice) => {
    if (typeof device.watchAdvertisements !== 'function') return;
    stopAdvertisementWatcher();
    const ac = new AbortController();
    advAbortRef.current = ac;

    const onAdv = (rawEv: BleAdvertisementEventLike) => {
      const parsed = parseAdvertisementEvent(rawEv);
      setAdvertisements((prev) => {
        const filtered = prev.filter((item) => item.deviceId !== parsed.deviceId);
        return [parsed, ...filtered].slice(0, 6);
      });
      pushDiag(
        createDiagEvent(
          'advertisement',
          `Adv from ${parsed.deviceName || parsed.deviceId} (${parsed.rssi ?? '?'} dBm)`,
          JSON.stringify({ uuids: parsed.uuids })
        )
      );
    };

    device.addEventListener?.('advertisementreceived', onAdv);
    try {
      await device.watchAdvertisements({ signal: ac.signal });
    } catch {
      // ignore if browser refuses background advertisement watcher
    }
  };

  const handleDisconnect = () => {
    stopAdvertisementWatcher();
    if (session) {
      if (disconnectHandlerRef.current && session.device.removeEventListener) {
        session.device.removeEventListener(
          'gattserverdisconnected',
          disconnectHandlerRef.current
        );
      }
      try {
        if (session.server.connected) {
          session.server.disconnect();
        }
      } catch {
        // ignore disconnect errors
      }
      appendLog(`Disconnected from ${session.displayName}.`, 'connect');
    }
    setSession(null);
    setSelectedMac('');
    setSelectedWatchName('');
    setNativeState(null);
    setNativeRawGatt([]);
    onHardwareLockChange?.(null);
    setIsConnecting(false);
    setIsFlashing(false);
    setProgress(0);
    setWizardStep(1);
  };

  const handleSwitchProtocol = (next: WatchBleProtocol) => {
    setProtocol(next);
    setServiceUuid(PROTOCOL_PROFILES[next].serviceUuid);
    setCharUuid(PROTOCOL_PROFILES[next].dataCharUuid);
    setMtuSize(PROTOCOL_PROFILES[next].defaultMtu);
    setStatusError(null);
  };

  const getSlug = () =>
    config.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'watchface';

  const getLockedOrCurrentSpec = (): ResolutionSpec => {
    return clampWatchExportResolution(config.resolution, hardwareLock);
  };

  const compilePayload = async (
    targetProto: WatchBleProtocol = protocol
  ): Promise<{ bytes: Uint8Array; fileName: string }> => {
    const slug = getSlug();
    const targetSpec = getLockedOrCurrentSpec();
    const exportConfig =
      config.resolution.width === targetSpec.width &&
      config.resolution.height === targetSpec.height &&
      config.resolution.shape === targetSpec.shape
        ? config
        : adaptWatchFaceToResolution(config, targetSpec);

    if (targetProto === 'fitcloud' || targetProto === 'universal') {
      return {
        bytes: buildFitCloudBin(exportConfig, sim),
        fileName: `${slug}_${targetSpec.width}x${targetSpec.height}_tbui.bin`,
      };
    }
    const pkg = await buildVeryFitPackage(exportConfig, sim, 'lz4');
    return {
      bytes: pkg.iwfLzBytes,
      fileName: `${slug}_${targetSpec.width}x${targetSpec.height}.iwf.lz`,
    };
  };

  const connectCapturedDevice = async (device: BleDevice) => {
    attachAdvertisementWatcher(device);

    const onDisconnected = () => {
      pushDiag(
        createDiagEvent(
          'error',
          `BLE GATT link dropped from ${device.name || device.id}.`
        )
      );
      setSession(null);
      setIsFlashing(false);
    };
    disconnectHandlerRef.current = onDisconnected;
    device.addEventListener?.('gattserverdisconnected', onDisconnected);

    const candidateServiceUuids = collectCandidateServices({
      customServiceUuid: serviceUuid,
      extraServiceUuids,
    });

    const connectedSession = await connectWatchGatt({
      device,
      protocol,
      preferredServiceUuid: serviceUuid,
      preferredCharUuid: charUuid,
      candidateServiceUuids,
      onDiag: pushDiag,
      onLog: (m) => appendLog(m, 'services'),
      onNotification: (bytes) => {
        const hex = Array.from(bytes.slice(0, 16))
          .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');
        appendLog(
          `[Watch ACK] ${hex}${bytes.length > 16 ? ` (+${bytes.length - 16}B)` : ''}`,
          'transfer'
        );
      },
    });

    setSession(connectedSession);

    // Sync protocol profile to auto-detected watch ecosystem
    if (connectedSession.ecosystem === 'veryfit') {
      setProtocol('veryfit');
      setMtuSize(PROTOCOL_PROFILES.veryfit.defaultMtu);
    } else if (connectedSession.ecosystem === 'fitcloud') {
      setProtocol('fitcloud');
      setMtuSize(PROTOCOL_PROFILES.fitcloud.defaultMtu);
    }

    if (connectedSession.activeServiceUuid) {
      setServiceUuid(connectedSession.activeServiceUuid);
    }
    if (connectedSession.writeCharacteristic) {
      setCharUuid(connectedSession.writeCharacteristic.uuid);
    }

    // Advance straight to Step 2 (Handshake Verification Telemetry) — NEVER claim connected if GATT is read-only
    setWizardStep(2);

    if (!connectedSession.writeCharacteristic) {
      setStatusError(
        `Captured "${connectedSession.displayName}", but no writable dial GATT channel was verified (${connectedSession.discoveredServiceUuids.length} service(s) found). Select a writable characteristic in Raw GATT Inspector or use Quick Apply (100% Compatible).`
      );
    } else {
      setStatusError(null);
    }
  };

  const handleSelectNativeWatch = (watch: NativeWatchFoundDetail) => {
    if (!window.NativeWatchBridge) return;
    if (nativeScanTimerRef.current !== null) {
      window.clearTimeout(nativeScanTimerRef.current);
      nativeScanTimerRef.current = null;
    }
    setIsNativeScanning(false);
    setStatusError(null);
    setInstallSummary(null);
    setNativeRawGatt([]);
    setNativeState(null);
    setSelectedMac(watch.mac);
    setSelectedWatchName(watch.name || watch.mac);
    setIsConnecting(true);
    setWizardStep(2);

    appendLog(
      `Connecting NativeWatchBridge -> ${watch.name} (${watch.mac}) & dumping GATT...`,
      'connect'
    );
    try {
      window.NativeWatchBridge.connectFitCloudWatch(watch.mac);
      window.NativeWatchBridge.inspectRawGatt(watch.mac);
    } catch (err) {
      setIsConnecting(false);
      setStatusError(
        `Native connection failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleScanAndCapture = async (forceAcceptAll = false, overrideDevice?: BleDevice) => {
    setStatusError(null);
    setInstallSummary(null);
    setProgress(0);

    if (isNativeApk && window.NativeWatchBridge) {
      setNativeFoundWatches([]);
      setIsNativeScanning(true);
      if (nativeScanTimerRef.current !== null) {
        window.clearTimeout(nativeScanTimerRef.current);
      }
      nativeScanTimerRef.current = window.setTimeout(() => {
        setIsNativeScanning(false);
      }, 15_000);
      appendLog('Started NativeWatchBridge.scanWatches() (15s BLE scan)...', 'scan-filter');
      try {
        window.NativeWatchBridge.scanWatches();
      } catch (err) {
        setIsNativeScanning(false);
        setStatusError(
          `Native scan error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      return;
    }

    if (!hasWebBluetooth) {
      const msg =
        'Web Bluetooth is blocked in this browser/frame. Open in standalone Chrome or switch to the "Quick Apply (100% Compatible)" tab.';
      setStatusError(msg);
      pushDiag(createDiagEvent('error', msg));
      return;
    }

    // Clean any existing session without bouncing step back unexpectedly
    if (session?.server.connected) {
      try {
        session.server.disconnect();
      } catch {
        // ignore
      }
      setSession(null);
    }

    setIsConnecting(true);

    try {
      if (overrideDevice) {
        await connectCapturedDevice(overrideDevice);
        return;
      }

      const navBle = (navigator as unknown as { bluetooth: BleNavigatorApi })
        .bluetooth;
      const scanOpts = buildCaptureScanOptions({
        includeAllFallback: forceAcceptAll || useAllFallback,
        nameFilter,
        extraServiceUuids,
      });

      pushDiag(
        createDiagEvent(
          'scan-filter',
          scanOpts.acceptAllDevices
            ? 'Scanning ALL nearby BLE devices (acceptAllDevices fallback)...'
            : 'Scanning for smartwatch services (0x0AF0, 0xFEE7, 0x180A, 0x180F)...',
          JSON.stringify({
            filtersCount: scanOpts.filters?.length ?? 0,
            acceptAllDevices: Boolean(scanOpts.acceptAllDevices),
            optionalServicesCount: scanOpts.optionalServices?.length ?? 0,
          })
        )
      );

      const device = await navBle.requestDevice(scanOpts);
      await connectCapturedDevice(device);
      listPreviouslyPairedWatches(navBle).then(setRememberedDevices);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|chosen/i.test(msg)) {
        pushDiag(
          createDiagEvent(
            'scan-filter',
            'Watch chooser closed before selecting a device.',
            'If your watch did not show up, click "Scan All BLE (Fallback)" or use "Quick Apply (100% Compatible)".'
          )
        );
      } else {
        setStatusError(`Watch capture failed: ${msg}`);
        pushDiag(createDiagEvent('error', `Capture error: ${msg}`));
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOverrideCharacteristic = (
    svcUuid: string,
    targetCharUuid: string,
    role: 'write' | 'control'
  ) => {
    if (!session) return;
    try {
      const next = overrideSessionCharacteristic(
        session,
        svcUuid,
        targetCharUuid,
        role
      );
      setSession(next);
      setServiceUuid(svcUuid);
      if (role === 'write') {
        setCharUuid(targetCharUuid);
        setStatusError(null);
      }
      pushDiag(
        createDiagEvent(
          'characteristics',
          `Verified override: ${role === 'write' ? 'Write Channel' : 'Control'} -> ${targetCharUuid}`
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusError(msg);
    }
  };

  const handlePushNativeWatchFace = async () => {
    if (!window.NativeWatchBridge) {
      setStatusError('NativeWatchBridge is unavailable outside the Android APK.');
      return;
    }
    const targetEcosystem: NativeWatchEcosystem =
      protocol === 'veryfit' ? 'veryfit' : 'fitcloud';
    const targetMac = resolveNativeDfuMac(
      selectedMac,
      hardwareLockRef.current,
      nativeStateRef.current
    );
    if (targetEcosystem === 'veryfit' && !targetMac) {
      setStatusError(
        'Select a watch MAC address in Step 1 before pushing VeryFit .iwf.lz.'
      );
      return;
    }

    setStatusError(null);
    setInstallSummary(null);
    setWizardStep(3);
    setIsFlashing(true);
    setProgress(0);
    setTransferStats({
      sentChunks: 0,
      totalChunks: 100,
      sentBytes: 0,
      totalBytes: 0,
      speedKbPerSec: 0,
      phaseLabel:
        targetEcosystem === 'veryfit'
          ? `Compiling VeryFit .iwf.lz for ${targetMac}...`
          : 'Compiling FitCloudPro .bin (TBUI)...',
    });

    await new Promise<void>((resolve) => window.setTimeout(resolve, 16));

    try {
      const { bytes, fileName } = await compilePayload(targetEcosystem);
      const base64Data = uint8ArrayToBase64(bytes);
      lastNativeCompileRef.current = {
        ecosystem: targetEcosystem,
        fileName,
        totalBytes: bytes.byteLength,
        crc16: crc16Ccitt(bytes),
        crc32: crc32(bytes),
        startedAtMs: Date.now(),
      };
      setTransferStats({
        sentChunks: 0,
        totalChunks: 100,
        sentBytes: 0,
        totalBytes: bytes.byteLength,
        speedKbPerSec: 0,
        phaseLabel:
          targetEcosystem === 'veryfit'
            ? `Native VeryFit Push (${targetMac})...`
            : 'Native TopStep FcDfuManager Push...',
      });

      const method = dispatchNativeWatchFacePush(window.NativeWatchBridge, {
        ecosystem: targetEcosystem,
        base64Data,
        macAddress: targetMac,
      });
      appendLog(
        `Calling NativeWatchBridge.${method} (${fileName}, ${(
          bytes.byteLength / 1024
        ).toFixed(1)} KB${targetEcosystem === 'veryfit' ? `, mac=${targetMac}` : ''})`,
        'transfer'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIsFlashing(false);
      setStatusError(msg);
      pushDiag(createDiagEvent('error', `Native push failed: ${msg}`));
    }
  };

  const handleStartPushWatchFace = async () => {
    if (isNativeApk) {
      await handlePushNativeWatchFace();
      return;
    }

    if (!session || !session.server.connected || !session.writeCharacteristic) {
      setStatusError(
        'Cannot push yet: verify a connected GATT watch with a bound write channel first.'
      );
      return;
    }

    setStatusError(null);
    setInstallSummary(null);
    setWizardStep(3);
    setIsFlashing(true);
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;

    await new Promise<void>((resolve) => window.setTimeout(resolve, 16));

    try {
      const { bytes, fileName } = await compilePayload(protocol);
      const plan = buildDialTransferPackets(bytes, protocol, mtuSize);
      setTransferStats({
        sentChunks: 0,
        totalChunks: plan.dataChunks.length,
        sentBytes: 0,
        totalBytes: bytes.byteLength,
        speedKbPerSec: 0,
        phaseLabel:
          protocol === 'veryfit'
            ? 'D1 Metadata Init & Awaiting 0x0AF7 ACK...'
            : 'FitCloudPro DFU Handshake...',
      });

      const res = await flashDialOverGatt({
        session,
        payload: bytes,
        protocol,
        mtuSize,
        signal: controller.signal,
        onLog: (m) => appendLog(m, 'transfer'),
        onProgress: (pct, sentChunks, totalChunks, sentBytes, speedKbPerSec) => {
          setProgress(pct);
          setTransferStats({
            sentChunks,
            totalChunks,
            sentBytes,
            totalBytes: bytes.byteLength,
            speedKbPerSec,
            phaseLabel:
              pct >= 100
                ? 'Applying Watch Face...'
                : protocol === 'veryfit'
                ? 'Streaming .iwf.lz D1 Chunks'
                : 'Streaming .bin DFU Blocks',
          });
        },
      });

      setInstallSummary({
        fileName,
        totalBytes: bytes.byteLength,
        chunksSent: res.chunksSent,
        speedKbPerSec: res.speedKbPerSec,
        crc16: res.crc16,
        crc32: res.crc32,
        method: 'ble',
      });
      setWizardStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusError(msg);
      pushDiag(createDiagEvent('error', `Push stopped: ${msg}`));
    } finally {
      abortRef.current = null;
      setIsFlashing(false);
    }
  };

  const handleCancelFlash = () => {
    abortRef.current?.abort();
  };

  const handleQuickApplyExportPng = async () => {
    setQuickFeedback(null);
    try {
      const adapted = adaptWatchFaceToResolution(config, quickSpec);
      const canvas = renderStaticBackgroundCanvas(adapted, sim);
      const blob = await canvasToPngBlob(canvas);
      const fileName = `${getSlug()}_${quickSpec.width}x${quickSpec.height}_dial.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const outcome = await shareOrSavePngFile(
        file,
        `${config.name} (${quickSpec.width}×${quickSpec.height})`,
        'Open in FitCloudPro or VeryFit -> Custom Dial'
      );
      setQuickFeedback(
        outcome === 'shared'
          ? `Shared clean ${quickSpec.width}×${quickSpec.height} PNG! Select Gallery/Photos or your Watch App, then tap Open FitCloudPro / VeryFit below.`
          : `Saved clean ${quickSpec.width}×${quickSpec.height} PNG ("${fileName}") to your Gallery/Downloads! Now tap Open FitCloudPro or Open VeryFit below.`
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setQuickFeedback(
        `Could not export PNG: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleDownloadWatchBinary = async () => {
    const { bytes, fileName } = await compilePayload(protocol);
    triggerFileDownload(bytes, fileName);
    appendLog(
      `Downloaded ${fileName} (${(bytes.byteLength / 1024).toFixed(1)} KB).`,
      'transfer'
    );
  };

  const handleCopyDiagnosticReport = async () => {
    const report = formatDiagnosticReport({
      protocol,
      scanMode: useAllFallback ? 'all' : 'smartwatch',
      nameFilter,
      requestOptions: currentCaptureOptions,
      extraServiceUuids,
      advertisements,
      session,
      events,
    });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        triggerFileDownload(
          new TextEncoder().encode(report),
          `watch_handshake_report_${Date.now()}.json`,
          'application/json'
        );
      }
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch {
      triggerFileDownload(
        new TextEncoder().encode(report),
        `watch_handshake_report_${Date.now()}.json`,
        'application/json'
      );
    }
  };

  const isNativeConnected = Boolean(
    isNativeApk &&
      (hardwareLock || (nativeState && isNativeConnectedState(nativeState.state)))
  );
  const isWatchConnected = Boolean(session?.server.connected) || isNativeConnected;
  const isGattVerified =
    Boolean(isWatchConnected && session?.writeCharacteristic) || isNativeConnected;
  const extLabel = protocol === 'veryfit' ? '.iwf.lz' : '.bin';
  const totalInspectedServices = isNativeApk
    ? nativeRawGatt.length
    : session
    ? session.serviceTree.length
    : 0;

  const stepLabels: Array<{ id: WizardStep; title: string }> = [
    { id: 1, title: '1. Release & Capture' },
    { id: 2, title: '2. GATT Handshake' },
    { id: 3, title: '3. BLE Push' },
    { id: 4, title: '4. Installed' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="webble-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-[#0e131d] border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-800 bg-[#121826] shrink-0">
          <div className="flex items-center gap-2.5">
            {isGattVerified ? (
              <BluetoothConnected className="w-5 h-5 text-emerald-400" />
            ) : (
              <Bluetooth className="w-5 h-5 text-sky-400" />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="webble-modal-title"
                  className="text-sm sm:text-base font-bold text-slate-100 font-display"
                >
                  Capture &amp; Push to Watch
                </h2>
                {isNativeApk && (
                  <span
                    data-testid="native-bridge-ready-badge"
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 border border-emerald-500/50 px-2 py-0.5 text-[10px] font-bold text-emerald-200"
                  >
                    <Cpu className="w-3 h-3 text-emerald-400" />
                    Native Android Bluetooth Bridge Ready
                  </span>
                )}
                {hardwareLock && (
                  <span
                    data-testid="modal-hardware-lock-badge"
                    className="inline-flex items-center gap-1 rounded-md bg-sky-500/20 border border-sky-500/50 px-2 py-0.5 text-[10px] font-bold text-sky-200"
                  >
                    <Lock className="w-3 h-3 text-sky-400" />
                    {formatHardwareLockBadgeText(
                      hardwareLock.lcdWidth,
                      hardwareLock.lcdHeight,
                      hardwareLock.isRound
                    )}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {config.name} · {config.resolution.width}×{config.resolution.height}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close Capture and Push Modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top-Level Tab Switcher */}
        <div
          role="tablist"
          aria-label="Watch Push Mode"
          className="grid grid-cols-2 gap-2 px-5 pt-3 pb-2 bg-[#0e131d] border-b border-slate-800/80 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'wizard'}
            onClick={() => setMainTab('wizard')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
              mainTab === 'wizard'
                ? 'bg-sky-600/20 border-sky-500 text-white'
                : 'bg-[#111622] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4 text-sky-400 shrink-0" />
            Direct BLE Capture &amp; Push
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'quickApply'}
            onClick={() => setMainTab('quickApply')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
              mainTab === 'quickApply'
                ? 'bg-emerald-600/20 border-emerald-500 text-white'
                : 'bg-[#111622] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
            Quick Apply (100% Compatible)
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {mainTab === 'quickApply' ? (
            /* ============================================================
               TAB 2: QUICK APPLY (100% COMPATIBLE BACKUP VIA STOCK APP)
               ============================================================ */
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/45 p-3.5 text-emerald-100 leading-relaxed">
                <strong>Guaranteed Fallback for Encrypted Firmwares:</strong> If
                your watch firmware blocks third-party BLE DFU writes, export the
                exact pixel-matched clean dial background below (with your
                photo, bezel &amp; color grading—zero hands or digits) and apply
                it via Custom Dial in FitCloudPro or VeryFit in 5 seconds.
              </div>

              {/* Clean Dial Preview + Pixel Resolution Picker */}
              <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl bg-[#111622] border border-slate-800 p-4">
                <div className="w-28 h-28 rounded-xl bg-[#070a10] border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                  {quickPreviewUrl ? (
                    <img
                      src={quickPreviewUrl}
                      alt="Clean Dial Background Preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  )}
                </div>

                <div className="flex-1 space-y-2.5 w-full">
                  <div>
                    <div className="text-sm font-bold text-white">
                      {config.name} (Clean Dial Plate)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Hands &amp; digits automatically removed so the watch adds
                      live time. Pick your watch&apos;s exact resolution:
                    </div>
                  </div>

                  <div
                    role="group"
                    aria-label="Export Pixel Resolution"
                    className="grid grid-cols-2 gap-1.5"
                  >
                    {QUICK_APPLY_TARGETS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={quickTargetId === item.id}
                        onClick={() => setQuickTargetId(item.id)}
                        className={`px-2.5 py-1.5 rounded-lg border font-mono text-[11px] font-semibold text-left cursor-pointer ${
                          quickTargetId === item.id
                            ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200'
                            : 'bg-[#0b0f17] border-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {quickFeedback && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-950/45 border border-emerald-700/60 p-3 text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{quickFeedback}</div>
                </div>
              )}

              {/* 1-Tap Clean Dial Gallery Export */}
              <button
                type="button"
                onClick={handleQuickApplyExportPng}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-sm font-bold text-white cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Save Clean Dial PNG ({quickSpec.width}×{quickSpec.height}) to Gallery
              </button>

              {/* Open Stock Companion App Android Intent Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href="intent://#Intent;package=com.topstep.fitcloudpro;end"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#162033] hover:bg-[#1d2b45] border border-sky-500/50 px-4 py-2.5 text-xs font-semibold text-sky-100"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                  Open FitCloudPro
                </a>

                <a
                  href="intent://#Intent;package=com.watch.life;end"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#162033] hover:bg-[#1d2b45] border border-indigo-500/50 px-4 py-2.5 text-xs font-semibold text-indigo-100"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                  Open VeryFit
                </a>
              </div>

              <div className="rounded-xl bg-[#111622] border border-slate-800 p-3.5 space-y-1.5 text-[11px] text-slate-300">
                <div className="font-bold uppercase tracking-wider text-slate-200">
                  How to Apply in 5 Seconds
                </div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    Tap <strong>Save Clean Dial PNG</strong> above to save your{' '}
                    {quickSpec.width}×{quickSpec.height} dial into your Phone Gallery.
                  </li>
                  <li>
                    Tap <strong>Open FitCloudPro</strong> or{' '}
                    <strong>Open VeryFit</strong> above.
                  </li>
                  <li>
                    Open <strong>Watch Faces → Custom Dial</strong>, pick the saved
                    PNG, and tap <strong>Sync to Watch</strong>.
                  </li>
                </ol>
              </div>
            </div>
          ) : (
            /* ============================================================
               TAB 1: 4-STEP WATCH CAPTURE, HANDSHAKE & BLE PUSH WIZARD
               ============================================================ */
            <>
              {/* 4-Step Wizard Stepper */}
              <nav
                aria-label="Watch Capture Wizard Steps"
                className="grid grid-cols-2 sm:grid-cols-4 gap-1.5"
              >
                {stepLabels.map((st) => {
                  const isActive = wizardStep === st.id;
                  const isDone = wizardStep > st.id;
                  const canJump =
                    st.id === 1 ||
                    (st.id === 2 && isWatchConnected) ||
                    (st.id === 3 && isGattVerified) ||
                    (st.id === 4 && Boolean(installSummary));
                  return (
                    <button
                      key={st.id}
                      type="button"
                      disabled={!canJump || isFlashing}
                      onClick={() => canJump && setWizardStep(st.id)}
                      className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold text-left flex items-center justify-between gap-1 cursor-pointer disabled:cursor-default ${
                        isActive
                          ? 'bg-sky-600/25 border-sky-500 text-white'
                          : isDone
                          ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                          : 'bg-[#111622] border-slate-800 text-slate-500'
                      }`}
                    >
                      <span className="truncate">{st.title}</span>
                      {isDone && <Check className="w-3 h-3 shrink-0 text-emerald-400" />}
                    </button>
                  );
                })}
              </nav>

              {!isNativeApk && (isInIframe || !hasWebBluetooth) && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 p-3 text-amber-200">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>
                        {!hasWebBluetooth
                          ? 'Web Bluetooth Unavailable Here:'
                          : 'Inside Embedded Frame:'}
                      </strong>{' '}
                      Open in standalone Chrome for direct BLE scanning, or use{' '}
                      <strong>Quick Apply (100% Compatible)</strong>.
                    </div>
                  </div>
                  {typeof window !== 'undefined' && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Full Tab
                    </a>
                  )}
                </div>
              )}

              {statusError && (
                <div
                  role="alert"
                  className="flex flex-col gap-2 rounded-xl bg-rose-950/45 border border-rose-700/60 p-3 text-rose-200"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">{statusError}</div>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setMainTab('quickApply')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                    >
                      Switch to Quick Apply (100% Compatible)
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1 — RELEASE & CAPTURE WATCH */}
              {wizardStep === 1 && (
                <div className="rounded-xl bg-[#111622] border border-slate-800 p-4 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Watch className="w-4 h-4 text-sky-400" />
                      Step 1 — Release &amp; Capture Watch
                    </h3>
                    <p className="text-slate-400">
                      Smartwatches stop advertising BLE GATT services while locked
                      to their stock companion app. Complete this 10-second check
                      before scanning:
                    </p>
                  </div>

                  {/* Pre-Scan Checklist */}
                  <ol className="space-y-2 rounded-xl bg-[#0b0f17] border border-slate-800 p-3.5 text-slate-200">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-sky-600/25 border border-sky-500/50 text-sky-300 font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span>
                        Force-close <strong>FitCloudPro</strong> or{' '}
                        <strong>VeryFit</strong> (or tap{' '}
                        <em>Disconnect / Unbind</em> inside the stock app so the
                        watch starts broadcasting).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-sky-600/25 border border-sky-500/50 text-sky-300 font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span>
                        Keep the watch screen <strong>awake within 1 meter</strong>{' '}
                        of your phone.
                      </span>
                    </li>
                  </ol>

                  {isNativeApk ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          data-testid="scan-capture-watch-btn"
                          disabled={isConnecting}
                          onClick={() => handleScanAndCapture(false)}
                          className="flex-1 min-w-[210px] inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-3 text-sm font-bold text-white cursor-pointer disabled:opacity-50"
                        >
                          <Radio className="w-4 h-4" />
                          {isConnecting
                            ? 'Connecting & Inspecting GATT...'
                            : isNativeScanning
                            ? 'Scanning Nearby Watches...'
                            : 'Scan & Capture Watch'}
                        </button>
                      </div>

                      {(isNativeScanning || nativeFoundWatches.length > 0) && (
                        <div className="rounded-xl bg-[#0b0f17] border border-slate-800 p-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                            <span>
                              Nearby Watches Found ({nativeFoundWatches.length})
                            </span>
                            {isNativeScanning && (
                              <span className="text-sky-300">
                                Scanning BLE advertisements...
                              </span>
                            )}
                          </div>

                          {nativeFoundWatches.length === 0 ? (
                            <div className="py-4 text-center text-slate-400">
                              Listening for nearby smartwatch BLE beacons...
                            </div>
                          ) : (
                            <div
                              data-testid="native-watch-list"
                              className="space-y-1.5 max-h-52 overflow-y-auto"
                            >
                              {nativeFoundWatches.map((watch) => {
                                const isPicked =
                                  selectedMac &&
                                  selectedMac.toUpperCase() === watch.mac.toUpperCase();
                                return (
                                  <button
                                    key={watch.mac}
                                    type="button"
                                    data-testid={`native-watch-item-${watch.mac}`}
                                    disabled={isConnecting}
                                    onClick={() => handleSelectNativeWatch(watch)}
                                    className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer disabled:opacity-50 ${
                                      isPicked
                                        ? 'bg-sky-600/20 border-sky-500 text-white'
                                        : 'bg-[#111622] hover:bg-[#171e2e] border-slate-700/80 text-slate-100'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-bold text-xs text-white truncate">
                                        {watch.name || 'Unknown Watch'}
                                      </div>
                                      <div className="font-mono text-[11px] text-slate-400">
                                        {watch.mac}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/60 border border-emerald-700/50 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                                        <Wifi className="w-3 h-3" />
                                        {watch.rssi} dBm
                                      </span>
                                      <span className="text-[11px] font-semibold text-sky-300">
                                        Connect →
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Optional Name Filter & Fallback Toggle */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block space-y-1">
                          <span className="text-slate-400">
                            Optional Watch Name Prefix (e.g. S71, IDW19)
                          </span>
                          <input
                            type="text"
                            value={nameFilter}
                            onChange={(e) => setNameFilter(e.target.value)}
                            placeholder="Leave blank for 0x0AF0/0xFEE7/0x180A/0x180F"
                            className="w-full rounded-lg bg-[#0b0f17] border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
                          />
                        </label>

                        <label className="flex items-center gap-2.5 rounded-lg bg-[#0b0f17] border border-slate-800 px-3 py-2 text-slate-300 cursor-pointer self-end min-h-[34px]">
                          <input
                            type="checkbox"
                            checked={useAllFallback}
                            onChange={(e) => setUseAllFallback(e.target.checked)}
                            className="rounded accent-sky-500"
                          />
                          <span>
                            Show all nearby BLE devices (<code>acceptAllDevices</code>)
                          </span>
                        </label>
                      </div>

                      {/* Primary Scan & Capture CTA + Broad Fallback */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          data-testid="scan-capture-watch-btn"
                          disabled={isConnecting}
                          onClick={() => handleScanAndCapture(false)}
                          className="flex-1 min-w-[210px] inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-3 text-sm font-bold text-white cursor-pointer disabled:opacity-50"
                        >
                          <Radio className="w-4 h-4" />
                          {isConnecting
                            ? 'Verifying GATT Services...'
                            : 'Scan & Capture Watch'}
                        </button>

                        <button
                          type="button"
                          disabled={isConnecting}
                          onClick={() => handleScanAndCapture(true)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3.5 py-3 text-xs font-semibold text-slate-200 cursor-pointer disabled:opacity-50"
                        >
                          Scan All BLE (Fallback)
                        </button>
                      </div>

                      {rememberedDevices.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                          <span className="text-slate-400">Previously captured:</span>
                          {rememberedDevices.map((dev) => (
                            <button
                              key={dev.id}
                              type="button"
                              disabled={isConnecting}
                              onClick={() => handleScanAndCapture(false, dev)}
                              className="px-2.5 py-1 rounded-lg bg-sky-600/20 border border-sky-500/50 text-sky-200 font-semibold cursor-pointer"
                            >
                              Reconnect {dev.name || dev.id.slice(0, 8)}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* STEP 2 — AUTO-DETECT WATCH ECOSYSTEM & VERIFY GATT HANDSHAKE */}
              {wizardStep === 2 && (session || isNativeApk) && (
                <div className="rounded-xl bg-[#111622] border border-slate-800 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                        Step 2 — Watch Ecosystem &amp; GATT Handshake
                      </h3>
                      <p className="text-slate-400">
                        {isNativeApk
                          ? isGattVerified
                            ? 'Native Android BLE handshake & hardware LCD resolution verified.'
                            : 'Connecting to watch & awaiting hardware LCD telemetry...'
                          : isGattVerified
                          ? 'Real GATT write & notify characteristics verified and bound.'
                          : 'GATT connected, waiting for verified writable channel.'}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-lg border font-semibold ${
                        isGattVerified
                          ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                          : 'bg-amber-950/60 border-amber-600/60 text-amber-300'
                      }`}
                    >
                      {isGattVerified
                        ? 'Verified & Connected'
                        : isNativeApk
                        ? 'Handshaking...'
                        : 'Unverified / Read-Only'}
                    </span>
                  </div>

                  {/* Real Telemetry Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 font-sans">
                        Bluetooth Name
                      </div>
                      <div className="text-slate-100 font-bold mt-0.5 truncate">
                        {isNativeApk
                          ? selectedWatchName ||
                            hardwareLock?.watchName ||
                            selectedMac ||
                            'Scanning...'
                          : session?.displayName}
                      </div>
                    </div>

                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 font-sans">
                        Connection State
                      </div>
                      <div
                        className={`font-bold mt-0.5 ${
                          isGattVerified ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {isNativeApk
                          ? nativeState?.state || (isConnecting ? 'CONNECTING' : 'PENDING')
                          : session?.server.connected
                          ? isGattVerified
                            ? 'GATT Bound'
                            : 'Read-Only'
                          : 'Disconnected'}
                      </div>
                    </div>

                    {isNativeApk ? (
                      <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2.5">
                        <div className="text-[10px] text-slate-400 font-sans">
                          Hardware Screen
                        </div>
                        <div className="text-sky-300 font-bold mt-0.5 truncate">
                          {hardwareLock
                            ? `${hardwareLock.lcdWidth}×${hardwareLock.lcdHeight} (${
                                hardwareLock.isRound ? 'Round' : 'Squircle'
                              })`
                            : 'Detecting...'}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2.5">
                        <div className="text-[10px] text-slate-400 font-sans">
                          MTU Chunk Size
                        </div>
                        <div className="text-sky-300 font-bold mt-0.5 flex items-center gap-1">
                          <input
                            type="number"
                            aria-label="MTU Chunk Size"
                            min={20}
                            max={512}
                            value={mtuSize}
                            onChange={(e) => setMtuSize(Number(e.target.value))}
                            className="w-16 bg-transparent border-b border-slate-700 text-sky-300 focus:outline-none"
                          />
                          <span>B</span>
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2.5">
                      <div className="text-[10px] text-slate-400 font-sans">
                        {isNativeApk ? 'Watch MAC' : 'Verified Write Channel'}
                      </div>
                      <div className="text-slate-100 font-bold mt-0.5 truncate">
                        {isNativeApk
                          ? selectedMac || hardwareLock?.mac || 'Pending'
                          : session?.writeCharacteristic
                          ? session.writeCharacteristic.uuid.slice(0, 8)
                          : 'None'}
                      </div>
                    </div>
                  </div>

                  {/* Auto-Detected Ecosystem + Target Override */}
                  <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Auto-Detected Ecosystem
                        </div>
                        <div className="text-xs font-bold text-sky-300">
                          {isNativeApk
                            ? protocol === 'veryfit'
                              ? `VeryFit / IDO Native (${nativeRawGatt.length} GATT svc)`
                              : `FitCloudPro / TopStep Native (${nativeRawGatt.length} GATT svc)`
                            : session?.ecosystemLabel}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(['veryfit', 'fitcloud'] as const).map((target) => (
                          <button
                            key={target}
                            type="button"
                            onClick={() => handleSwitchProtocol(target)}
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                              protocol === target
                                ? 'bg-sky-600/25 border-sky-500 text-white'
                                : 'bg-[#111622] border-slate-700 text-slate-400'
                            }`}
                          >
                            {target === 'veryfit'
                              ? 'VeryFit (.iwf.lz)'
                              : 'FitCloudPro (.bin)'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {session && session.subscribedNotifyUuids.length > 0 && (
                      <div className="text-[11px] font-mono text-emerald-300">
                        Subscribed Notify Channels:{' '}
                        {session.subscribedNotifyUuids
                          .map((u) => `0x${u.slice(4, 8).toUpperCase()}`)
                          .join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Step 2 Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-2 font-medium text-slate-300 cursor-pointer"
                    >
                      <BluetoothOff className="w-3.5 h-3.5" />
                      Release Watch
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!isGattVerified}
                        onClick={handleStartPushWatchFace}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 font-bold text-white cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Push Watch Face ({extLabel})
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3 — REAL CHUNKED BLE PUSH ENGINE */}
              {wizardStep === 3 && (
                <div className="rounded-xl bg-[#111622] border border-slate-800 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Send className="w-4 h-4 text-sky-400" />
                        Step 3 —{' '}
                        {protocol === 'veryfit'
                          ? 'VeryFit D1 State Machine Push'
                          : 'FitCloudPro DFU Chunked Push'}
                      </h3>
                      <p className="text-slate-400 font-mono text-[11px] mt-0.5">
                        {transferStats.phaseLabel}
                      </p>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-lg font-bold text-emerald-300">
                        {progress}%
                      </div>
                      <div className="text-[11px] text-sky-300">
                        {transferStats.speedKbPerSec} KB/s
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-3 rounded-full bg-[#090c12] border border-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2">
                      <div className="text-slate-400">Chunks</div>
                      <div className="text-slate-100 font-bold">
                        {transferStats.sentChunks} / {transferStats.totalChunks}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2">
                      <div className="text-slate-400">Bytes Streamed</div>
                      <div className="text-slate-100 font-bold">
                        {transferStats.sentBytes.toLocaleString()} /{' '}
                        {transferStats.totalBytes.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2">
                      <div className="text-slate-400">Speed</div>
                      <div className="text-emerald-300 font-bold">
                        {transferStats.speedKbPerSec} KB/s
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {isNativeApk ? (
                      isFlashing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-2 rounded-xl bg-sky-950/60 border border-sky-600/60 px-4 py-2.5 font-semibold text-sky-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
                            Streaming via Native Android BLE ({progress}%)
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsFlashing(false);
                              appendLog('Native DFU wait reset by user.', 'transfer');
                            }}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold cursor-pointer"
                          >
                            Reset Wait
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-testid="native-push-to-watch-btn"
                          onClick={handlePushNativeWatchFace}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 font-bold text-white cursor-pointer"
                        >
                          <Send className="w-4 h-4" />
                          Push to Watch ({extLabel})
                        </button>
                      )
                    ) : isFlashing ? (
                      <button
                        type="button"
                        onClick={handleCancelFlash}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 font-semibold text-white cursor-pointer"
                      >
                        Cancel Transfer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartPushWatchFace}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2.5 font-semibold text-white cursor-pointer"
                      >
                        Retry Chunked Push
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isFlashing}
                      onClick={() => setWizardStep(2)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer disabled:opacity-45"
                    >
                      Back to Step 2
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4 — WATCH FACE INSTALLED */}
              {wizardStep === 4 && installSummary && (
                <div className="rounded-xl bg-emerald-950/30 border border-emerald-600/60 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">
                        Watch Face Installed on Watch!
                      </h3>
                      <p className="text-emerald-200 text-xs">
                        {installSummary.fileName} applied to{' '}
                        {selectedWatchName || session?.displayName || 'your smartwatch'} via{' '}
                        {installSummary.method === 'nativeBridge'
                          ? 'Android Native Bluetooth Bridge'
                          : 'BLE GATT Push'}
                        .
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2">
                      <div className="text-slate-400">Size</div>
                      <div className="text-slate-100 font-bold">
                        {(installSummary.totalBytes / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2">
                      <div className="text-slate-400">Packets</div>
                      <div className="text-slate-100 font-bold">
                        {installSummary.chunksSent}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2">
                      <div className="text-slate-400">CRC16 / CRC32</div>
                      <div className="text-sky-300 font-bold truncate">
                        0x{installSummary.crc16.toString(16).toUpperCase()}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#0b0f17] border border-slate-800 p-2">
                      <div className="text-slate-400">Speed</div>
                      <div className="text-emerald-300 font-bold">
                        {installSummary.speedKbPerSec} KB/s
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold cursor-pointer"
                    >
                      Push Again
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsible Raw GATT & Descriptor Diagnostic Inspector */}
              <details
                data-testid="raw-gatt-inspector"
                className="rounded-xl bg-[#090c12] border border-slate-800 overflow-hidden"
              >
                <summary className="flex items-center justify-between px-3.5 py-2.5 bg-[#111622] cursor-pointer select-none font-semibold text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    Raw GATT Inspector (
                    {totalInspectedServices > 0 ? `${totalInspectedServices} svc` : 'Ready'})
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </summary>

                <div className="p-3 space-y-2.5 border-t border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div role="tablist" className="flex items-center gap-1">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={diagTab === 'gatt'}
                        onClick={() => setDiagTab('gatt')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          diagTab === 'gatt'
                            ? 'bg-sky-600/25 border border-sky-500/60 text-sky-200'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Activity className="w-3 h-3" />
                        Raw GATT &amp; Descriptors ({totalInspectedServices})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={diagTab === 'log'}
                        onClick={() => setDiagTab('log')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          diagTab === 'log'
                            ? 'bg-emerald-600/25 border border-emerald-500/60 text-emerald-200'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Terminal className="w-3 h-3" />
                        Intercept Log ({events.length})
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        aria-label="Extra Service UUIDs"
                        value={extraServiceInput}
                        onChange={(e) => setExtraServiceInput(e.target.value)}
                        placeholder="Extra UUIDs: ff10, ae30..."
                        className="w-44 rounded bg-[#0b0f17] border border-slate-700 px-2 py-1 font-mono text-[10px] text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleCopyDiagnosticReport}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0b0f17] border border-slate-700 text-slate-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        {copiedReport ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Report
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label="Clear Intercept Log"
                        onClick={() => setEvents([])}
                        className="inline-flex items-center px-2 py-1 rounded bg-[#0b0f17] border border-slate-700 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {diagTab === 'gatt' ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto font-mono text-[11px]">
                      {isNativeApk ? (
                        nativeRawGatt.length > 0 ? (
                          <div data-testid="native-raw-gatt-table" className="space-y-2">
                            {nativeRawGatt.map((svc) => (
                              <div
                                key={svc.serviceUuid}
                                className="rounded-lg bg-[#111622] border border-slate-800 p-2.5 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2 text-sky-300 font-bold">
                                  <span className="truncate">SVC {svc.serviceUuid}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    {svc.characteristics.length} char
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {svc.characteristics.map((c) => (
                                    <div
                                      key={c.uuid}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#0b0f17] border border-slate-800/80 px-2 py-1.5"
                                    >
                                      <span className="text-slate-200 break-all">
                                        {c.uuid}
                                      </span>
                                      <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
                                        {c.read && (
                                          <span className="px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-200">
                                            READ
                                          </span>
                                        )}
                                        {c.write && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-600/25 border border-emerald-500/50 text-emerald-200">
                                            WRITE
                                          </span>
                                        )}
                                        {c.writeNoResp && (
                                          <span className="px-1.5 py-0.5 rounded bg-sky-600/25 border border-sky-500/50 text-sky-200">
                                            WRITE NO RESP
                                          </span>
                                        )}
                                        {c.notify && (
                                          <span className="px-1.5 py-0.5 rounded bg-amber-600/25 border border-amber-500/50 text-amber-200">
                                            NOTIFY
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-3 text-center text-slate-400">
                            Scan &amp; tap a watch in Step 1 to inspect native GATT
                            services and READ/WRITE/WRITE NO RESP/NOTIFY capabilities.
                          </div>
                        )
                      ) : session && session.serviceTree.length > 0 ? (
                        session.serviceTree.map((svc) => (
                          <div
                            key={svc.uuid}
                            className="rounded-lg bg-[#111622] border border-slate-800 p-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-sky-300 font-bold">
                              <span className="truncate">SVC {svc.uuid}</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                {svc.source}
                              </span>
                            </div>
                            {svc.characteristics.map((c) => {
                              const canWrite =
                                c.properties.includes('WRITE') ||
                                c.properties.includes('WRITE_NO_RSP');
                              return (
                                <div
                                  key={c.uuid}
                                  className="rounded bg-[#0b0f17] border border-slate-800/80 p-1.5 space-y-1"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span className="text-slate-200 break-all">
                                      {c.uuid} [{c.properties.join(',')}]
                                    </span>
                                    {canWrite && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOverrideCharacteristic(
                                              svc.uuid,
                                              c.uuid,
                                              'write'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/50 text-emerald-200 text-[10px] cursor-pointer"
                                        >
                                          Use as TX
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOverrideCharacteristic(
                                              svc.uuid,
                                              c.uuid,
                                              'control'
                                            )
                                          }
                                          className="px-1.5 py-0.5 rounded bg-sky-600/20 border border-sky-500/50 text-sky-200 text-[10px] cursor-pointer"
                                        >
                                          Use as CTRL
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {c.descriptors.map((d) => (
                                    <div
                                      key={d.uuid}
                                      className="text-[10px] text-amber-300 pl-2"
                                    >
                                      DESC {d.uuid} ({d.knownName})
                                      {d.rawHex ? ` = [${d.rawHex}]` : ''}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        ))
                      ) : (
                        <div className="py-3 text-center text-slate-400">
                          Scan &amp; capture a watch in Step 1 to inspect raw GATT
                          services, characteristics, and 0x2902 descriptors.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[10px]">
                      {events.map((ev, i) => (
                        <div
                          key={i}
                          className="rounded bg-[#111622] border border-slate-800/80 px-2 py-1"
                        >
                          <span className="text-slate-500 mr-1.5">
                            {ev.timestamp}
                          </span>
                          <span className="text-sky-300 uppercase mr-1.5">
                            [{ev.stage}]
                          </span>
                          <span className="text-slate-200">{ev.summary}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-[#121826] shrink-0 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <button
            type="button"
            onClick={handleDownloadWatchBinary}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Save Compiled {extLabel} File
          </button>

          <span>
            {protocol === 'veryfit'
              ? 'Target: VeryFit / IDO (.iwf.lz D1 State Machine)'
              : 'Target: FitCloudPro / TopStep (.bin DFU)'}
          </span>
        </div>
      </div>
    </div>
  );
};
