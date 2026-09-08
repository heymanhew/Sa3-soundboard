import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose }) => {
  const PAD_GRID_ROWS = [
    [
      { key: '1', pad: 'Pad 1' },
      { key: '2', pad: 'Pad 2' },
      { key: '3', pad: 'Pad 3' },
      { key: '4', pad: 'Pad 4' },
    ],
    [
      { key: 'Q', pad: 'Pad 5' },
      { key: 'W', pad: 'Pad 6' },
      { key: 'E', pad: 'Pad 7' },
      { key: 'R', pad: 'Pad 8' },
    ],
    [
      { key: 'A', pad: 'Pad 9' },
      { key: 'S', pad: 'Pad 10' },
      { key: 'D', pad: 'Pad 11' },
      { key: 'F', pad: 'Pad 12' },
    ],
    [
      { key: 'Z', pad: 'Pad 13' },
      { key: 'X', pad: 'Pad 14' },
      { key: 'C', pad: 'Pad 15' },
      { key: 'V', pad: 'Pad 16' },
    ],
  ];

  const ACTION_SHORTCUTS = [
    { key: 'Space', desc: 'Instant Stop All Audio (Panic)' },
    { key: '[  /  ]', desc: 'Cycle Soundboard Banks (A / B / C / D)' },
    { key: 'T', desc: 'Open Real-time Waveform Trim Editor' },
    { key: 'G', desc: 'Open SA3 Small SFX Model Generator' },
    { key: 'B', desc: 'Open Batch Audio Processor & Exporter' },
    { key: 'E', desc: 'Export Active Pad as 16-bit WAV' },
    { key: 'M', desc: 'Mute / Unmute Active Pad' },
    { key: 'Del / Bksp', desc: 'Clear / Remove Clip from Active Pad' },
    { key: '?', desc: 'Toggle this Shortcuts Guide' },
  ];

  return (
    <div
      id="keyboard-shortcuts-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
    >
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Keyboard Shortcuts</h2>
              <p className="text-xs text-slate-400">Trigger playback and navigate the studio with zero latency</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {/* 4x4 Grid Matrix representation */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-3">
              4x4 Soundboard Trigger Grid
            </span>
            <div className="grid grid-cols-4 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              {PAD_GRID_ROWS.flat().map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-900 border border-slate-700/80 text-center"
                >
                  <kbd className="w-7 h-7 rounded bg-slate-800 border border-slate-600 flex items-center justify-center font-mono font-bold text-xs text-emerald-400 shadow-inner">
                    {item.key}
                  </kbd>
                  <span className="text-[10px] font-mono text-slate-400 mt-1">{item.pad}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation & Action Hotkeys */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-3">
              Navigation & Global Actions
            </span>
            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden text-xs">
              {ACTION_SHORTCUTS.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3">
                  <span className="text-slate-300">{item.desc}</span>
                  <kbd className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-amber-300 font-bold">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
