import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Volume2,
  VolumeX,
  Sliders,
  Scissors,
  Download,
  Layers,
  Smartphone,
  Keyboard,
  Folder,
  Play,
  Square,
  RefreshCw,
  Plus,
  Radio,
  Music,
} from 'lucide-react';
import { BankId, SoundClip, SoundPad } from './types';
import { SoundPadGrid } from './components/SoundPadGrid';
import { WaveformEditor } from './components/WaveformEditor';
import { BatchEditModal } from './components/BatchEditModal';
import { SfxGeneratorModal } from './components/SfxGeneratorModal';
import { PitchModPanel } from './components/PitchModPanel';
import { AndroidSa3GuideModal } from './components/AndroidSa3GuideModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ClipLibraryDrawer } from './components/ClipLibraryDrawer';
import { generateDefaultBankAClips } from './utils/sfxSynthesizer';
import { playClip, stopAllVoices, audioBufferToWavBlob, ensureAudioUnlocked } from './utils/audioEngine';

const KEYBOARD_MAPPING = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];

// Create 16 pads for a bank
function createBankPads(bankId: BankId, initialClips?: SoundClip[]): SoundPad[] {
  return Array.from({ length: 16 }, (_, idx) => ({
    id: idx,
    bankId,
    keyShortcut: KEYBOARD_MAPPING[idx].toUpperCase(),
    color: '#10b981',
    clip: initialClips && initialClips[idx] ? initialClips[idx] : null,
    isPlaying: false,
    isMuted: false,
    isSolo: false,
    volume: 1.0,
  }));
}

export default function App() {
  // Soundboard Banks: A, B, C, D
  const [currentBank, setCurrentBank] = useState<BankId>('A');

  // Banks data storage
  const [banksData, setBanksData] = useState<Record<BankId, SoundPad[]>>(() => {
    const defaultClips = generateDefaultBankAClips();
    return {
      A: createBankPads('A', defaultClips),
      B: createBankPads('B'),
      C: createBankPads('C'),
      D: createBankPads('D'),
    };
  });

  // Sound Library pool
  const [clipLibrary, setClipLibrary] = useState<SoundClip[]>(() => {
    return generateDefaultBankAClips();
  });

  // Selected pad index (0 to 15)
  const [selectedPadIndex, setSelectedPadIndex] = useState<number>(0);

  // Active playing voices tracking for visual feedback
  const [playingPadIndices, setPlayingPadIndices] = useState<Set<number>>(new Set());

  // Modal states
  const [showWaveformEditor, setShowWaveformEditor] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [showAndroidGuideModal, setShowAndroidGuideModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showLibraryDrawer, setShowLibraryDrawer] = useState(false);

  const currentPads = banksData[currentBank];
  const activePad = currentPads[selectedPadIndex] || null;
  const activeClip = activePad?.clip || null;

  // Trigger pad playback with zero latency
  const triggerPadPlayback = useCallback(
    (index: number) => {
      ensureAudioUnlocked();
      const pad = currentPads[index];
      if (!pad || !pad.clip || pad.isMuted) return;

      // Update playing state
      setPlayingPadIndices((prev) => new Set(prev).add(index));

      // Trigger Web Audio API voice
      playClip(pad.clip, {
        voiceId: `pad-${currentBank}-${index}`,
        onEnded: () => {
          setPlayingPadIndices((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        },
      });
    },
    [currentBank, currentPads]
  );

  // Stop all audio
  const handleStopAll = useCallback(() => {
    stopAllVoices();
    setPlayingPadIndices(new Set());
  }, []);

  // Update active clip in current pad
  const handleUpdateActiveClip = (updatedClip: SoundClip) => {
    setBanksData((prev) => {
      const bankPads = [...prev[currentBank]];
      bankPads[selectedPadIndex] = {
        ...bankPads[selectedPadIndex],
        clip: updatedClip,
      };
      return {
        ...prev,
        [currentBank]: bankPads,
      };
    });

    // Also update library if clip exists there
    setClipLibrary((prev) =>
      prev.map((c) => (c.id === updatedClip.id ? updatedClip : c))
    );
  };

  // Update all pads in current bank (e.g. after batch edit)
  const handleUpdateBankPads = (updatedPads: SoundPad[]) => {
    setBanksData((prev) => ({
      ...prev,
      [currentBank]: updatedPads,
    }));
  };

  // Swap pads
  const handleSwapPads = (fromIdx: number, toIdx: number) => {
    setBanksData((prev) => {
      const bankPads = [...prev[currentBank]];
      const temp = bankPads[fromIdx].clip;
      bankPads[fromIdx] = { ...bankPads[fromIdx], clip: bankPads[toIdx].clip };
      bankPads[toIdx] = { ...bankPads[toIdx], clip: temp };
      return { ...prev, [currentBank]: bankPads };
    });
  };

  // Assign clip to pad
  const handleAssignClipToPad = (padIdx: number, clip: SoundClip) => {
    setBanksData((prev) => {
      const bankPads = [...prev[currentBank]];
      bankPads[padIdx] = { ...bankPads[padIdx], clip };
      return { ...prev, [currentBank]: bankPads };
    });
    setSelectedPadIndex(padIdx);

    // Also add to library if not already present
    setClipLibrary((prev) => {
      if (prev.some((c) => c.id === clip.id)) return prev;
      return [clip, ...prev];
    });
  };

  // Clear Pad
  const handleClearPad = (index: number) => {
    setBanksData((prev) => {
      const bankPads = [...prev[currentBank]];
      bankPads[index] = { ...bankPads[index], clip: null };
      return { ...prev, [currentBank]: bankPads };
    });
  };

  // Export Active Pad WAV
  const handleExportActivePadWav = () => {
    if (!activeClip) return;
    const blob = audioBufferToWavBlob(activeClip.audioBuffer, {
      trimStart: activeClip.trimStart,
      trimEnd: activeClip.trimEnd,
      targetSampleRate: activeClip.sampleRate,
      pitchSemitones: activeClip.pitchSemitones,
      gain: activeClip.gain,
      fadeIn: activeClip.fadeIn,
      fadeOut: activeClip.fadeOut,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pad_${currentBank}${selectedPadIndex + 1}_${activeClip.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Check 4x4 pad triggers
      const padIdx = KEYBOARD_MAPPING.indexOf(key);
      if (padIdx !== -1) {
        e.preventDefault();
        setSelectedPadIndex(padIdx);
        triggerPadPlayback(padIdx);
        return;
      }

      // Space -> Stop All
      if (e.code === 'Space') {
        e.preventDefault();
        handleStopAll();
        return;
      }

      // Navigation & Modal triggers
      if (key === '[') {
        e.preventDefault();
        const banks: BankId[] = ['A', 'B', 'C', 'D'];
        const currentIdx = banks.indexOf(currentBank);
        const prevIdx = (currentIdx - 1 + banks.length) % banks.length;
        setCurrentBank(banks[prevIdx]);
      } else if (key === ']') {
        e.preventDefault();
        const banks: BankId[] = ['A', 'B', 'C', 'D'];
        const currentIdx = banks.indexOf(currentBank);
        const nextIdx = (currentIdx + 1) % banks.length;
        setCurrentBank(banks[nextIdx]);
      } else if (key === 't') {
        e.preventDefault();
        if (activeClip) setShowWaveformEditor(true);
      } else if (key === 'g') {
        e.preventDefault();
        setShowGeneratorModal(true);
      } else if (key === 'b') {
        e.preventDefault();
        setShowBatchModal(true);
      } else if (key === 'e') {
        e.preventDefault();
        handleExportActivePadWav();
      } else if (key === '?') {
        e.preventDefault();
        setShowShortcutsModal(true);
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        handleClearPad(selectedPadIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentBank, activeClip, selectedPadIndex, triggerPadPlayback, handleStopAll]);

  // Combine pad isPlaying with playingPadIndices
  const displayPads = currentPads.map((pad, idx) => ({
    ...pad,
    isPlaying: playingPadIndices.has(idx),
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand & Active Model Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Radio className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  SA3 Soundboard Studio
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Small SFX GGUF
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono hidden sm:block">
                Stable Audio 3 C++ Engine • Real-time Trimmer • Custom Sample Rates
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2">
            {/* Panic Stop Button */}
            <button
              id="stop-all-audio-btn"
              onClick={handleStopAll}
              title="Stop All Audio (Space)"
              className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden md:inline">Stop (Space)</span>
            </button>

            {/* Batch Edit Button */}
            <button
              id="open-batch-edit-btn"
              onClick={() => setShowBatchModal(true)}
              title="Batch Edit & Trim (B)"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline">Batch Trim</span>
            </button>

            {/* Generate SFX Button */}
            <button
              id="open-sfx-generator-btn"
              onClick={() => setShowGeneratorModal(true)}
              title="Generate Sound Effect (G)"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-sm shadow-emerald-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate SFX</span>
            </button>

            {/* Clip Library Drawer Toggle */}
            <button
              id="toggle-library-btn"
              onClick={() => setShowLibraryDrawer(true)}
              title="Sound Library"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition border border-slate-700"
            >
              <Folder className="w-4 h-4 text-blue-400" />
            </button>

            {/* Android Guide Button */}
            <button
              id="open-android-guide-btn"
              onClick={() => setShowAndroidGuideModal(true)}
              title="sa3.cpp & Android Architecture Guide"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition border border-slate-700"
            >
              <Smartphone className="w-4 h-4 text-purple-400" />
            </button>

            {/* Keyboard Shortcuts Button */}
            <button
              id="open-shortcuts-btn"
              onClick={() => setShowShortcutsModal(true)}
              title="Keyboard Shortcuts (?)"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition border border-slate-700"
            >
              <Keyboard className="w-4 h-4 text-amber-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Bank Tabs & Quick Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase text-slate-400 mr-1">
              Bank:
            </span>
            {(['A', 'B', 'C', 'D'] as BankId[]).map((bank) => {
              const isActive = currentBank === bank;
              const clipCount = banksData[bank].filter((p) => p.clip !== null).length;
              return (
                <button
                  key={bank}
                  onClick={() => setCurrentBank(bank)}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 border ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span>Bank {bank}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {clipCount}/16
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
            <span>Keys 1-4, Q-R, A-F, Z-V trigger pads</span>
            <span>•</span>
            <span>Drag & drop audio directly onto pads</span>
          </div>
        </div>

        {/* 4x4 Pad Grid */}
        <SoundPadGrid
          pads={displayPads}
          activePadIndex={selectedPadIndex}
          onSelectPad={(idx) => setSelectedPadIndex(idx)}
          onTriggerPad={(idx) => triggerPadPlayback(idx)}
          onOpenEditor={(idx) => {
            setSelectedPadIndex(idx);
            setShowWaveformEditor(true);
          }}
          onOpenGenerator={(idx) => {
            setSelectedPadIndex(idx);
            setShowGeneratorModal(true);
          }}
          onClearPad={handleClearPad}
          onSwapPads={handleSwapPads}
          onLoadFileToPad={(idx, clip) => handleAssignClipToPad(idx, clip)}
        />

        {/* Bottom Section: Active Pad Inspector, Waveform Quick Bar & Pitch Modulation */}
        {activeClip ? (
          <div className="space-y-4 pt-2">
            {/* Active Pad Quick Actions Bar */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs">
                  {currentBank}{selectedPadIndex + 1}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {activeClip.name}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {activeClip.sampleRate} Hz
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Duration: {(activeClip.trimEnd - activeClip.trimStart).toFixed(3)}s | Category: {activeClip.category}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="open-trim-editor-btn"
                  onClick={() => setShowWaveformEditor(true)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Trim Waveform (T)
                </button>

                <button
                  id="export-active-wav-btn"
                  onClick={handleExportActivePadWav}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  Export WAV (E)
                </button>

                <button
                  id="play-active-pad-btn"
                  onClick={() => triggerPadPlayback(selectedPadIndex)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
                  Play
                </button>
              </div>
            </div>

            {/* Pitch Modulation & Custom Sample Rate Panel */}
            <PitchModPanel
              clip={activeClip}
              padLabel={`${currentBank}${selectedPadIndex + 1}`}
              onUpdateClip={handleUpdateActiveClip}
            />
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-300">Pad {currentBank}{selectedPadIndex + 1} is empty</h3>
              <p className="text-xs text-slate-500">
                Generate an AI sound effect or drag-and-drop an audio file to populate this pad
              </p>
            </div>
            <button
              onClick={() => setShowGeneratorModal(true)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
            >
              Generate SFX with SA3 Model
            </button>
          </div>
        )}
      </main>

      {/* Footer info */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-6 py-4 text-center text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto w-full">
        <span>SA3 Soundboard Studio • Stable Audio 3 C++ GGUF & Android Architecture</span>
        <div className="flex items-center gap-4 text-slate-400">
          <button onClick={() => setShowShortcutsModal(true)} className="hover:text-white">
            Shortcuts [?]
          </button>
          <button onClick={() => setShowAndroidGuideModal(true)} className="hover:text-white">
            sa3.cpp Guide
          </button>
          <button onClick={() => setShowBatchModal(true)} className="hover:text-white">
            Batch Export
          </button>
        </div>
      </footer>

      {/* Modals and Drawers */}
      {showWaveformEditor && activeClip && (
        <WaveformEditor
          clip={activeClip}
          padNumber={selectedPadIndex}
          bankId={currentBank}
          onUpdateClip={handleUpdateActiveClip}
          onClose={() => setShowWaveformEditor(false)}
        />
      )}

      {showBatchModal && (
        <BatchEditModal
          pads={currentPads}
          currentBank={currentBank}
          onUpdatePads={handleUpdateBankPads}
          onClose={() => setShowBatchModal(false)}
        />
      )}

      {showGeneratorModal && (
        <SfxGeneratorModal
          currentBank={currentBank}
          selectedPadIndex={selectedPadIndex}
          pads={currentPads}
          onAssignToPad={(padIdx, clip) => handleAssignClipToPad(padIdx, clip)}
          onClose={() => setShowGeneratorModal(false)}
        />
      )}

      {showAndroidGuideModal && (
        <AndroidSa3GuideModal onClose={() => setShowAndroidGuideModal(false)} />
      )}

      {showShortcutsModal && (
        <KeyboardShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {showLibraryDrawer && (
        <ClipLibraryDrawer
          library={clipLibrary}
          onSelectClipToPad={(clip) => handleAssignClipToPad(selectedPadIndex, clip)}
          onAddClipToLibrary={(clip) => setClipLibrary((prev) => [clip, ...prev])}
          onDeleteClipFromLibrary={(id) => setClipLibrary((prev) => prev.filter((c) => c.id !== id))}
          onClose={() => setShowLibraryDrawer(false)}
        />
      )}
    </div>
  );
}
