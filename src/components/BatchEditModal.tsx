import React, { useState } from 'react';
import JSZip from 'jszip';
import { Layers, Download, Check, Sparkles, Volume2, ArrowUpDown, Clock, Disc } from 'lucide-react';
import { SoundPad, SampleRateOption, SoundClip } from '../types';
import { audioBufferToWavBlob, detectSilence, normalizeBuffer, resampleBuffer, renderProcessedBuffer } from '../utils/audioEngine';

interface BatchEditModalProps {
  pads: SoundPad[];
  currentBank: string;
  onUpdatePads: (updatedPads: SoundPad[]) => void;
  onClose: () => void;
}

export const BatchEditModal: React.FC<BatchEditModalProps> = ({
  pads,
  currentBank,
  onUpdatePads,
  onClose,
}) => {
  // Only pads with assigned audio clips can be batch-edited
  const loadedPads = pads.filter((p) => p.clip !== null);

  const [selectedPadIds, setSelectedPadIds] = useState<number[]>(
    loadedPads.filter((p) => p.bankId === currentBank).map((p) => p.id)
  );

  // Batch Operation Toggles
  const [autoTrimSilence, setAutoTrimSilence] = useState(true);
  const [silenceThresholdDb, setSilenceThresholdDb] = useState(-45);

  const [normalizeGain, setNormalizeGain] = useState(true);

  const [applyResample, setApplyResample] = useState(false);
  const [targetSampleRate, setTargetSampleRate] = useState<SampleRateOption>(44100);

  const [applyPitchShift, setApplyPitchShift] = useState(false);
  const [batchPitchSemitones, setBatchPitchSemitones] = useState(0);

  const [applyFades, setApplyFades] = useState(true);
  const [fadeInSec, setFadeInSec] = useState(0.005);
  const [fadeOutSec, setFadeOutSec] = useState(0.015);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  // Toggle selection
  const toggleSelectPad = (id: number) => {
    setSelectedPadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllInBank = () => {
    const bankPadIds = loadedPads.filter((p) => p.bankId === currentBank).map((p) => p.id);
    setSelectedPadIds(bankPadIds);
  };

  const selectAllLoaded = () => {
    setSelectedPadIds(loadedPads.map((p) => p.id));
  };

  const clearSelection = () => {
    setSelectedPadIds([]);
  };

  // Run Batch Processing
  const handleApplyBatchEdit = async () => {
    if (selectedPadIds.length === 0) return;
    setIsProcessing(true);
    setProgressMsg('Applying batch transformations...');

    try {
      const updatedPads = [...pads];

      for (let i = 0; i < selectedPadIds.length; i++) {
        const padId = selectedPadIds[i];
        const padIndex = updatedPads.findIndex((p) => p.id === padId);
        if (padIndex === -1 || !updatedPads[padIndex].clip) continue;

        let clip = { ...updatedPads[padIndex].clip! };
        setProgressMsg(`Processing Pad ${clip.name} (${i + 1}/${selectedPadIds.length})...`);

        // 1. Auto-trim silence
        if (autoTrimSilence) {
          const bounds = detectSilence(clip.audioBuffer, silenceThresholdDb);
          clip.trimStart = bounds.start;
          clip.trimEnd = bounds.end;
        }

        // 2. Normalize gain
        if (normalizeGain) {
          clip.audioBuffer = normalizeBuffer(clip.audioBuffer, -0.1);
          clip.isNormalized = true;
        }

        // 3. Pitch shift
        if (applyPitchShift && batchPitchSemitones !== 0) {
          clip.pitchSemitones = Math.max(-24, Math.min(24, clip.pitchSemitones + batchPitchSemitones));
        }

        // 4. Uniform fades
        if (applyFades) {
          clip.fadeIn = fadeInSec;
          clip.fadeOut = fadeOutSec;
        }

        // 5. Resample if selected
        if (applyResample && targetSampleRate !== clip.sampleRate) {
          const resampled = await resampleBuffer(clip.audioBuffer, targetSampleRate);
          clip.audioBuffer = resampled;
          clip.sampleRate = targetSampleRate;
          clip.duration = resampled.duration;
          clip.trimStart = Math.min(clip.trimStart, resampled.duration);
          clip.trimEnd = Math.min(clip.trimEnd, resampled.duration);
        }

        updatedPads[padIndex] = {
          ...updatedPads[padIndex],
          clip,
        };
      }

      onUpdatePads(updatedPads);
      setProgressMsg('Batch transformation complete!');
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error(err);
      setProgressMsg('Batch processing error: ' + err.message);
      setIsProcessing(false);
    }
  };

  // Batch Export to ZIP
  const handleBatchExportZip = async () => {
    if (selectedPadIds.length === 0) return;
    setIsProcessing(true);
    setProgressMsg('Rendering and bundling WAV files into ZIP...');

    try {
      const zip = new JSZip();
      const folder = zip.folder(`SA3_Soundboard_Bank_${currentBank}`);

      for (let i = 0; i < selectedPadIds.length; i++) {
        const padId = selectedPadIds[i];
        const pad = pads.find((p) => p.id === padId);
        if (!pad || !pad.clip) continue;

        setProgressMsg(`Exporting WAV ${i + 1}/${selectedPadIds.length}: ${pad.clip.name}...`);

        const rendered = await renderProcessedBuffer(pad.clip, applyResample ? targetSampleRate : undefined);
        const wavBlob = audioBufferToWavBlob(rendered, {
          targetSampleRate: applyResample ? targetSampleRate : pad.clip.sampleRate,
          gain: pad.clip.gain,
        });

        const safeName = pad.clip.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const fileName = `pad_${pad.bankId}${String(pad.id + 1).padStart(2, '0')}_${safeName}_${pad.clip.sampleRate}Hz.wav`;

        folder?.file(fileName, wavBlob);
      }

      setProgressMsg('Compressing ZIP archive...');
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);

      const a = document.createElement('a');
      a.href = url;
      a.download = `SA3_Soundboard_Bank_${currentBank}_Export_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setProgressMsg('Download ready!');
      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setProgressMsg('Export error: ' + err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div
      id="batch-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
    >
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Batch Audio Editor & Trimmer</h2>
              <p className="text-xs text-slate-400">
                Process, trim silence, resample, normalize, and export multiple clips at once
              </p>
            </div>
          </div>

          <button
            id="close-batch-modal-btn"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            Close
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Step 1: Select Pads */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Disc className="w-3.5 h-3.5 text-cyan-400" />
                Select Clips ({selectedPadIds.length} of {loadedPads.length} selected)
              </span>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={selectAllInBank}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400"
                >
                  Bank {currentBank} Only
                </button>
                <button
                  onClick={selectAllLoaded}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  All Loaded
                </button>
                <button
                  onClick={clearSelection}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto p-2 bg-slate-950/70 rounded-xl border border-slate-800">
              {loadedPads.map((pad) => {
                const isSelected = selectedPadIds.includes(pad.id);
                return (
                  <button
                    key={pad.id}
                    onClick={() => toggleSelectPad(pad.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg text-left text-xs transition border ${
                      isSelected
                        ? 'bg-cyan-950/50 border-cyan-500/60 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${
                        isSelected ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'border-slate-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="truncate">
                      <span className="font-mono text-[10px] text-cyan-400 mr-1">
                        {pad.bankId}{pad.id + 1}
                      </span>
                      <span className="truncate font-medium">{pad.clip?.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Batch Operation Options */}
          <div className="space-y-4 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Batch Transformations
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option: Auto Trim Silence */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Auto-Trim Silence
                  </span>
                  <input
                    type="checkbox"
                    checked={autoTrimSilence}
                    onChange={(e) => setAutoTrimSilence(e.target.checked)}
                    className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                  <span>Threshold:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="-60"
                      max="-25"
                      step="5"
                      value={silenceThresholdDb}
                      onChange={(e) => setSilenceThresholdDb(parseInt(e.target.value))}
                      disabled={!autoTrimSilence}
                      className="w-20 accent-emerald-500 h-1 bg-slate-800 rounded"
                    />
                    <span>{silenceThresholdDb} dB</span>
                  </div>
                </div>
              </div>

              {/* Option: Normalize Gain */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                    Peak Normalization
                  </span>
                  <input
                    type="checkbox"
                    checked={normalizeGain}
                    onChange={(e) => setNormalizeGain(e.target.checked)}
                    className="accent-blue-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-slate-400">
                  Boosts amplitude to maximum loudness (-0.1 dB peak) without distortion.
                </p>
              </div>

              {/* Option: Resample */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Convert Sample Rate
                  </span>
                  <input
                    type="checkbox"
                    checked={applyResample}
                    onChange={(e) => setApplyResample(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <div className="flex items-center justify-between pt-1">
                  <select
                    value={targetSampleRate}
                    onChange={(e) => setTargetSampleRate(parseInt(e.target.value) as SampleRateOption)}
                    disabled={!applyResample}
                    className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  >
                    <option value={8000}>8,000 Hz (Lo-Fi)</option>
                    <option value={11025}>11,025 Hz (Vintage 90s)</option>
                    <option value={22050}>22,050 Hz (Retro Game)</option>
                    <option value={44100}>44,100 Hz (CD Standard)</option>
                    <option value={48000}>48,000 Hz (Studio / Film)</option>
                    <option value={96000}>96,000 Hz (Hi-Res)</option>
                  </select>
                </div>
              </div>

              {/* Option: Pitch Shift */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
                    Batch Pitch Shift
                  </span>
                  <input
                    type="checkbox"
                    checked={applyPitchShift}
                    onChange={(e) => setApplyPitchShift(e.target.checked)}
                    className="accent-purple-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                  <span>Transpose:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={batchPitchSemitones}
                      onChange={(e) => setBatchPitchSemitones(parseInt(e.target.value))}
                      disabled={!applyPitchShift}
                      className="w-20 accent-purple-500 h-1 bg-slate-800 rounded"
                    />
                    <span className="w-12 text-right">
                      {batchPitchSemitones > 0 ? `+${batchPitchSemitones}` : batchPitchSemitones} st
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {progressMsg && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              {progressMsg}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/70">
          <button
            id="batch-export-zip-btn"
            onClick={handleBatchExportZip}
            disabled={selectedPadIds.length === 0 || isProcessing}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 border border-slate-700"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Export Selected as ZIP (.WAV)
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              id="apply-batch-edit-btn"
              onClick={handleApplyBatchEdit}
              disabled={selectedPadIds.length === 0 || isProcessing}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition disabled:opacity-50 shadow-md shadow-cyan-500/10"
            >
              Apply to {selectedPadIds.length} Clip{selectedPadIds.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
