import React, { useState } from 'react';
import { Play, Scissors, Download, Trash2, Plus, VolumeX, Mic, Disc } from 'lucide-react';
import { SoundPad, SoundClip } from '../types';
import { decodeAudioBlob, audioBufferToWavBlob } from '../utils/audioEngine';

interface SoundPadGridProps {
  pads: SoundPad[];
  activePadIndex: number | null;
  onSelectPad: (index: number) => void;
  onTriggerPad: (index: number) => void;
  onOpenEditor: (index: number) => void;
  onOpenGenerator: (index: number) => void;
  onClearPad: (index: number) => void;
  onSwapPads: (fromIndex: number, toIndex: number) => void;
  onLoadFileToPad: (index: number, clip: SoundClip) => void;
}

export const SoundPadGrid: React.FC<SoundPadGridProps> = ({
  pads,
  activePadIndex,
  onSelectPad,
  onTriggerPad,
  onOpenEditor,
  onOpenGenerator,
  onClearPad,
  onSwapPads,
  onLoadFileToPad,
}) => {
  const [draggedPadIndex, setDraggedPadIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Drag external file onto pad
  const handleFileDrop = async (e: React.DragEvent, padIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);

    // Check if internal pad drag
    if (draggedPadIndex !== null) {
      if (draggedPadIndex !== padIndex) {
        onSwapPads(draggedPadIndex, padIndex);
      }
      setDraggedPadIndex(null);
      return;
    }

    // External file dropped
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.includes('audio') || file.name.match(/\.(wav|mp3|ogg|flac|m4a|aac)$/i)) {
        try {
          const audioBuffer = await decodeAudioBlob(file);
          const cleanName = file.name.replace(/\.[^/.]+$/, '');
          const newClip: SoundClip = {
            id: `file-${Date.now()}`,
            name: cleanName.slice(0, 24),
            category: 'custom',
            audioBuffer,
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.numberOfChannels,
            trimStart: 0,
            trimEnd: audioBuffer.duration,
            fadeIn: 0.002,
            fadeOut: 0.015,
            pitchSemitones: 0,
            pitchCents: 0,
            playbackRate: 1.0,
            vibratoRate: 0,
            vibratoDepth: 0,
            gain: 1.0,
            isReversed: false,
            isNormalized: false,
            createdAt: Date.now(),
          };
          onLoadFileToPad(padIndex, newClip);
        } catch (err) {
          console.error('Failed to load audio file:', err);
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
  };

  const handleExportPadWav = (e: React.MouseEvent, pad: SoundPad) => {
    e.stopPropagation();
    if (!pad.clip) return;
    const blob = audioBufferToWavBlob(pad.clip.audioBuffer, {
      trimStart: pad.clip.trimStart,
      trimEnd: pad.clip.trimEnd,
      targetSampleRate: pad.clip.sampleRate,
      pitchSemitones: pad.clip.pitchSemitones,
      gain: pad.clip.gain,
      fadeIn: pad.clip.fadeIn,
      fadeOut: pad.clip.fadeOut,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pad_${pad.bankId}${pad.id + 1}_${pad.clip.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="sound-pad-grid"
      className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none"
    >
      {pads.map((pad, idx) => {
        const isSelected = activePadIndex === idx;
        const isLoaded = pad.clip !== null;
        const isOver = dragOverIndex === idx;

        // Visual color mapping based on pad or category
        let accentBorder = 'border-slate-800 hover:border-slate-700';
        let accentGlow = '';
        let badgeColor = 'bg-slate-800 text-slate-400';

        if (isLoaded) {
          switch (pad.clip?.category) {
            case 'sci-fi':
              badgeColor = 'bg-cyan-950 text-cyan-300 border-cyan-500/30';
              break;
            case 'retro':
              badgeColor = 'bg-amber-950 text-amber-300 border-amber-500/30';
              break;
            case 'impact':
              badgeColor = 'bg-rose-950 text-rose-300 border-rose-500/30';
              break;
            case 'ui':
              badgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-500/30';
              break;
            case 'cinematic':
              badgeColor = 'bg-purple-950 text-purple-300 border-purple-500/30';
              break;
            default:
              badgeColor = 'bg-blue-950 text-blue-300 border-blue-500/30';
          }
        }

        if (pad.isPlaying) {
          accentBorder = 'border-emerald-400 ring-2 ring-emerald-500/40 bg-emerald-950/30';
          accentGlow = 'shadow-lg shadow-emerald-500/20';
        } else if (isSelected) {
          accentBorder = 'border-cyan-400/80 ring-1 ring-cyan-500/30 bg-slate-850';
        } else if (isOver) {
          accentBorder = 'border-amber-400 border-dashed bg-amber-950/20';
        }

        return (
          <div
            key={pad.id}
            id={`sound-pad-${pad.bankId}-${pad.id + 1}`}
            draggable={isLoaded}
            onDragStart={() => setDraggedPadIndex(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleFileDrop(e, idx)}
            onClick={() => {
              onSelectPad(idx);
              if (isLoaded) onTriggerPad(idx);
            }}
            className={`group relative h-28 sm:h-32 rounded-2xl bg-slate-900 border p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-150 active:scale-[0.98] ${accentBorder} ${accentGlow}`}
          >
            {/* Top Bar: Key shortcut badge, bank number & quick actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-md bg-slate-950 border border-slate-800 flex items-center justify-center font-mono font-bold text-xs text-slate-200 shadow-inner">
                  {pad.keyShortcut}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {pad.bankId}{pad.id + 1}
                </span>
              </div>

              {/* Hover Quick Action Icons */}
              {isLoaded && (
                <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition">
                  <button
                    title="Trim & Edit Waveform"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPad(idx);
                      onOpenEditor(idx);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title="Export WAV"
                    onClick={(e) => handleExportPadWav(e, pad)}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title="Clear Pad"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearPad(idx);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Middle: Sound Title or Empty Placeholder */}
            <div className="my-auto">
              {isLoaded ? (
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                    {pad.clip?.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border ${badgeColor}`}
                    >
                      {pad.clip?.category}
                    </span>
                    {pad.clip?.pitchSemitones !== 0 && (
                      <span className="text-[9px] font-mono text-purple-400">
                        {pad.clip?.pitchSemitones && pad.clip.pitchSemitones > 0
                          ? `+${pad.clip.pitchSemitones}st`
                          : `${pad.clip?.pitchSemitones}st`}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-600 gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenGenerator(idx);
                    }}
                    className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-emerald-500 hover:text-slate-950 flex items-center justify-center text-slate-400 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-mono">Drop audio or Add</span>
                </div>
              )}
            </div>

            {/* Bottom: Technical metadata & Live Level Indicator */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              {isLoaded ? (
                <>
                  <span>{(pad.clip!.trimEnd - pad.clip!.trimStart).toFixed(2)}s</span>
                  <span className="text-slate-500">{(pad.clip!.sampleRate / 1000).toFixed(1)}k</span>
                </>
              ) : (
                <>
                  <span className="text-slate-600">EMPTY</span>
                  <span className="text-slate-700">--</span>
                </>
              )}
            </div>

            {/* Playing Animation Bar */}
            {pad.isPlaying && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-b-2xl animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
};
