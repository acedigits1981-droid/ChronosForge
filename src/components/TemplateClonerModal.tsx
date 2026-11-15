import React, { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  FileCode2,
  FileUp,
  Sparkles,
  X,
} from 'lucide-react';
import { buildFitCloudBin } from '../compilers/fitcloudCompiler';
import {
  cloneIntoReferenceTemplate,
  inspectReferenceWatchFace,
} from '../compilers/templateCloner';
import {
  ParsedTemplateInfo,
  SimulationState,
  WatchFaceConfig,
} from '../types/watchface';

interface TemplateClonerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: WatchFaceConfig;
  sim: SimulationState;
  onDownloadBytes: (bytes: Uint8Array, fileName: string) => void;
}

export const TemplateClonerModal: React.FC<TemplateClonerModalProps> = ({
  isOpen,
  onClose,
  config,
  sim,
  onDownloadBytes,
}) => {
  const [parsed, setParsed] = useState<ParsedTemplateInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setStatusMessage('Parsing reference firmware container...');
    try {
      const buf = await file.arrayBuffer();
      const info = await inspectReferenceWatchFace(
        file.name,
        new Uint8Array(buf)
      );
      setParsed(info);
      setStatusMessage(
        `Verified ${info.format.toUpperCase()} (${info.width}×${info.height}) — Ready for hardware-safe injection.`
      );
    } catch (err) {
      setStatusMessage(
        `Failed to parse container: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadSampleFitCloudTemplate = async () => {
    setIsProcessing(true);
    try {
      const sampleBin = buildFitCloudBin(
        config,
        sim,
        undefined,
        'TBUI_IDW19_OEM'
      );
      const info = await inspectReferenceWatchFace(
        'official_fitcloud_reference_466x466.bin',
        sampleBin
      );
      setParsed(info);
      setStatusMessage(
        'Loaded verified FitCloudPro TBUI reference container (466×466).'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloneAndDownload = async () => {
    if (!parsed) return;
    setIsProcessing(true);
    try {
      const res = await cloneIntoReferenceTemplate(parsed, config, sim);
      onDownloadBytes(res.bytes, res.outputFileName);
      setStatusMessage(res.summary);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloner-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-[#0e131d] border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#121826]">
          <div className="flex items-center gap-2.5">
            <FileCode2 className="w-5 h-5 text-amber-400" />
            <h2
              id="cloner-modal-title"
              className="text-base font-bold text-slate-100 font-display"
            >
              Reference Watch Face Template Cloner (.bin / .iwf / .iwf.lz)
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Template Cloner"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Upload an official <code className="text-amber-300">.bin</code>{' '}
            (FitCloudPro TBUI) or <code className="text-sky-300">.iwf / .iwf.lz</code>{' '}
            (VeryFit / IDO) file extracted from your specific smartwatch model.
            ChronosForge inspects its exact resolution, header version, magic
            bytes, and element descriptor offsets, then injects your newly
            designed dial background, 3D hands, and custom numeral glyphs into
            that verified container.
          </p>

          {/* Upload Dropzone + Sample Reference Button */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex-1 min-w-[240px] flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 hover:border-amber-500/70 bg-[#131926] px-4 py-4 cursor-pointer transition-colors">
              <FileUp className="w-4 h-4 text-amber-400" />
              <span className="font-medium text-slate-200">
                Choose Official .bin, .iwf, or .iwf.lz File
              </span>
              <input
                type="file"
                accept=".bin,.iwf,.lz,.zip"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleLoadSampleFitCloudTemplate}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-4 font-medium text-slate-200 cursor-pointer whitespace-nowrap"
            >
              Load Sample FitCloudPro (.bin) Reference
            </button>
          </div>

          {statusMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-700/50 px-3.5 py-2.5 text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {parsed && (
            <div className="space-y-4">
              {/* Parsed Container Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                <div className="bg-[#131926] border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-sans">
                    Container Format
                  </div>
                  <div className="text-amber-400 font-semibold mt-0.5">
                    {parsed.format.toUpperCase()}
                  </div>
                </div>
                <div className="bg-[#131926] border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-sans">
                    Hardware Resolution
                  </div>
                  <div className="text-slate-100 font-semibold mt-0.5">
                    {parsed.width}×{parsed.height}px
                  </div>
                </div>
                <div className="bg-[#131926] border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-sans">
                    Magic Signature
                  </div>
                  <div className="text-sky-400 font-semibold mt-0.5 truncate">
                    {parsed.magicSignature}
                  </div>
                </div>
                <div className="bg-[#131926] border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-sans">
                    Model / Clib ID
                  </div>
                  <div className="text-emerald-400 font-semibold mt-0.5 truncate">
                    {parsed.modelId}
                  </div>
                </div>
              </div>

              {/* Descriptor Table */}
              {parsed.tbuiElements && parsed.tbuiElements.length > 0 && (
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <div className="bg-[#141b29] px-3.5 py-2 font-semibold text-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-orange-400" />
                      Parsed TBUI Element Offset Table ({parsed.tbuiElements.length} slots)
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {parsed.rawBytes.byteLength.toLocaleString()} bytes
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/70 bg-[#0d111a] font-mono text-[11px]">
                    {parsed.tbuiElements.map((el) => (
                      <div
                        key={el.index}
                        className="grid grid-cols-5 px-3.5 py-2 text-slate-300"
                      >
                        <span className="text-orange-400">#{el.index}</span>
                        <span className="col-span-2 truncate">{el.typeLabel}</span>
                        <span>
                          ({el.x},{el.y}) {el.width}×{el.height}
                        </span>
                        <span className="text-right text-slate-400">
                          0x{el.dataOffset.toString(16).toUpperCase()} ({el.pixelFormat})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action CTA */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleCloneAndDownload}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 text-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Inject Current Dial & Export Verified Hardware Container
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
