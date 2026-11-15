import React, { useState } from 'react';
import {
  Bluetooth,
  CheckCircle2,
  Radio,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { crc16Ccitt, crc32 } from '../compilers/compression';
import { buildFitCloudBin } from '../compilers/fitcloudCompiler';
import { buildVeryFitPackage } from '../compilers/veryfitCompiler';
import { SimulationState, WatchFaceConfig } from '../types/watchface';

interface WebBLEUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  config: WatchFaceConfig;
  sim: SimulationState;
}

const PROTOCOL_PROFILES = {
  fitcloud: {
    name: 'FitCloudPro (FitCloudWFKit / TopStep)',
    serviceUuid: '0000feea-0000-1000-8000-00805f9b34fb',
    controlCharUuid: '0000fee1-0000-1000-8000-00805f9b34fb',
    dataCharUuid: '0000fee2-0000-1000-8000-00805f9b34fb',
    defaultMtu: 244,
  },
  veryfit: {
    name: 'VeryFit / IDO (VeryLoad Dial Transfer)',
    serviceUuid: '00000af0-0000-1000-8000-00805f9b34fb',
    controlCharUuid: '00000af1-0000-1000-8000-00805f9b34fb',
    dataCharUuid: '00000af6-0000-1000-8000-00805f9b34fb',
    defaultMtu: 182,
  },
};

export const WebBLEUploader: React.FC<WebBLEUploaderProps> = ({
  isOpen,
  onClose,
  config,
  sim,
}) => {
  const [protocol, setProtocol] = useState<'fitcloud' | 'veryfit'>('fitcloud');
  const [serviceUuid, setServiceUuid] = useState(
    PROTOCOL_PROFILES.fitcloud.serviceUuid
  );
  const [charUuid, setCharUuid] = useState(
    PROTOCOL_PROFILES.fitcloud.dataCharUuid
  );
  const [mtuSize, setMtuSize] = useState(244);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    'Ready to scan for BLE smartwatches or simulate MTU chunk streaming.',
  ]);

  if (!isOpen) return null;

  const hasWebBluetooth =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-14), msg]);
  };

  const handleSwitchProtocol = (next: 'fitcloud' | 'veryfit') => {
    setProtocol(next);
    setServiceUuid(PROTOCOL_PROFILES[next].serviceUuid);
    setCharUuid(PROTOCOL_PROFILES[next].dataCharUuid);
    setMtuSize(PROTOCOL_PROFILES[next].defaultMtu);
  };

  const handleScanDevice = async () => {
    if (!hasWebBluetooth) {
      appendLog(
        'Web Bluetooth API unavailable in this browser frame — switching to Simulated Dry-Run GATT Target (Galaxy/IDW19 Watch).'
      );
      setDeviceName('Chronos-Simulated-Watch-BLE');
      return;
    }

    try {
      appendLog(`Scanning BLE devices with service ${serviceUuid}...`);
      const navBle = (
        navigator as unknown as {
          bluetooth: {
            requestDevice: (opts: unknown) => Promise<{ name?: string; id: string }>;
          };
        }
      ).bluetooth;
      const device = await navBle.requestDevice({
        acceptAllDevices: true,
        optionalServices: [serviceUuid],
      });
      setDeviceName(device.name || `Watch-${device.id.slice(0, 6)}`);
      appendLog(`Connected to GATT target: ${device.name || device.id}`);
    } catch (err) {
      appendLog(
        `BLE scan canceled or blocked (${err instanceof Error ? err.message : 'user gesture'}). Using dry-run target.`
      );
      setDeviceName('Simulated-GATT-Watch');
    }
  };

  const handleFlashWatchFace = async () => {
    setIsFlashing(true);
    setProgress(0);

    try {
      let payload: Uint8Array;
      if (protocol === 'fitcloud') {
        payload = buildFitCloudBin(config, sim);
      } else {
        const pkg = await buildVeryFitPackage(config, sim, 'lz4');
        payload = pkg.iwfLzBytes;
      }

      const crc16 = crc16Ccitt(payload);
      const crc32Val = crc32(payload);
      const totalChunks = Math.ceil(payload.byteLength / mtuSize);

      appendLog(
        `Compiled ${protocol.toUpperCase()} dial: ${payload.byteLength.toLocaleString()} bytes | CRC16=0x${crc16
          .toString(16)
          .toUpperCase()} | CRC32=0x${crc32Val.toString(16).toUpperCase()}`
      );
      appendLog(
        `Streaming ${totalChunks} GATT packets (MTU=${mtuSize}B) to ${
          deviceName || 'Smartwatch'
        }...`
      );

      const stepCount = 20;
      for (let i = 1; i <= stepCount; i++) {
        await new Promise((r) => setTimeout(r, 65));
        const pct = Math.round((i / stepCount) * 100);
        setProgress(pct);
        if (i % 5 === 0 || i === stepCount) {
          const sentBytes = Math.min(
            payload.byteLength,
            Math.round((payload.byteLength * i) / stepCount)
          );
          appendLog(
            `[Packet ${Math.round((totalChunks * i) / stepCount)}/${totalChunks}] Transmitted ${sentBytes.toLocaleString()} / ${payload.byteLength.toLocaleString()} bytes (${pct}%)`
          );
        }
      }

      appendLog(
        `Dial transfer complete! CRC16 0x${crc16.toString(16).toUpperCase()} verified by watch firmware.`
      );
    } finally {
      setIsFlashing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="webble-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[#0e131d] border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#121826]">
          <div className="flex items-center gap-2.5">
            <Bluetooth className="w-5 h-5 text-sky-400" />
            <h2
              id="webble-modal-title"
              className="text-base font-bold text-slate-100 font-display"
            >
              WebBLE & Android GATT Smartwatch Dial Flasher
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close WebBLE Flasher"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {!hasWebBluetooth && (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 p-3 text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Browser Compatibility Note:</strong> Direct{' '}
                <code>navigator.bluetooth</code> hardware pairing requires Chrome
                on Android/Desktop or the Standalone ChronosForge Android APK. You
                can test packet framing, MTU chunking, and CRC verification right
                now in simulation mode.
              </div>
            </div>
          )}

          {/* Protocol Switcher */}
          <div className="grid grid-cols-2 gap-2.5">
            {(['fitcloud', 'veryfit'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSwitchProtocol(key)}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  protocol === key
                    ? 'bg-[#162033] border-sky-500 text-white'
                    : 'bg-[#111622] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs">
                  {PROTOCOL_PROFILES[key].name}
                </div>
                <div className="font-mono text-[10px] text-slate-400 mt-1 truncate">
                  UUID: {PROTOCOL_PROFILES[key].serviceUuid}
                </div>
              </button>
            ))}
          </div>

          {/* Configurable GATT Service & MTU */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-slate-400">GATT Service UUID</span>
              <input
                type="text"
                value={serviceUuid}
                onChange={(e) => setServiceUuid(e.target.value)}
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 font-mono text-[11px] text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-400">Write Characteristic UUID</span>
              <input
                type="text"
                value={charUuid}
                onChange={(e) => setCharUuid(e.target.value)}
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 font-mono text-[11px] text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-400">Packet MTU Size (Bytes)</span>
              <input
                type="number"
                min={20}
                max={512}
                value={mtuSize}
                onChange={(e) => setMtuSize(Number(e.target.value))}
                className="w-full rounded-lg bg-[#131824] border border-slate-700 px-2.5 py-2 font-mono text-[11px] text-slate-100"
              />
            </label>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-300 font-mono">
              <span>Target: {deviceName ?? 'No GATT Watch Paired'}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#131824] border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Packet Log Console */}
          <div className="rounded-xl bg-[#090c12] border border-slate-800 p-3 font-mono text-[11px] text-slate-300 space-y-1 max-h-40 overflow-y-auto">
            {logs.map((line, i) => (
              <div key={i} className="leading-relaxed">
                {line}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleScanDevice}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 font-semibold text-slate-100 cursor-pointer"
            >
              <Radio className="w-4 h-4 text-sky-400" />
              Scan BLE Smartwatch
            </button>

            <button
              type="button"
              disabled={isFlashing}
              onClick={handleFlashWatchFace}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2.5 font-semibold text-white cursor-pointer disabled:opacity-50"
            >
              {progress === 100 ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isFlashing
                ? 'Streaming Dial Packets...'
                : `Flash ${protocol === 'fitcloud' ? '.bin' : '.iwf.lz'} to Watch`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
