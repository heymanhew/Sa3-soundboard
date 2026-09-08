import React from 'react';
import { Activity, Sliders, Music, Zap, RefreshCw, Volume2, Play } from 'lucide-react';
import { SampleRateOption, SoundClip } from '../types';
import { resampleBuffer, playClip } from '../utils/audioEngine';

interface PitchModPanelProps {
  clip: SoundClip | null;
  padLabel: string;
  onUpdateClip: (updated: SoundClip) => void;
}

const SAMPLE_RATES: { rate: SampleRateOption; label: string; desc: string }[] = [
  { rate: 8000, label: '8,000 Hz', desc: 'Lo-Fi / Vintage Phone' },
  { rate: 11025, label: '11,025 Hz', desc: '90s Multimedia' },
  { rate: 16000, label: '16,000 Hz', desc: 'Speech / Radio' },
  { rate: 22050, label: '22,050 Hz', desc: 'Retro Game Chiptune' },
  { rate: 32000, label: '32,000 Hz', desc: 'Broadcast FM' },
  { rate: 44100, label: '44,100 Hz', desc: 'CD Quality (Standard)' },
  { rate: 48000, label: '48,000 Hz', desc: 'Studio Standard' },
  { rate: 96000, label: '96,000 Hz', desc: 'Hi-Res Mastering' },
];

export const PitchModPanel: React.FC<PitchModPanelProps> = ({
  clip,
  padLabel,
  onUpdateClip,
}) => {
  const [isResampling, setIsResampling] = React.useState(false);

  if (!clip) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-center flex flex-col items-center justify-center min-h-[200px] text-slate-500 text-xs">
        <Sliders className="w-8 h-8 mb-2 opacity-30" />
        <span>Select or trigger a pad to adjust pitch modulation and sample rate</span>
      </div>
    );
  }

  // Handle Resampling
  const handleSelectSampleRate = async (rate: SampleRateOption) => {
    if (rate === clip.sampleRate) return;
    setIsResampling(true);
    try {
      const resampled = await resampleBuffer(clip.audioBuffer, rate);
      onUpdateClip({
        ...clip,
        audioBuffer: resampled,
        sampleRate: rate,
        duration: resampled.duration,
        trimStart: Math.min(clip.trimStart, resampled.duration),
        trimEnd: Math.min(clip.trimEnd, resampled.duration),
      });
    } catch (err) {
      console.error('Failed to resample:', err);
    } finally {
      setIsResampling(false);
    }
  };

  const handleAudition = () => {
    playClip(clip);
  };

  return (
    <div
      id="pitch-mod-panel"
      className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Pitch Modulation & Sample Rate
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-purple-300">
                {padLabel}: {clip.name}
              </span>
            </h3>
          </div>
        </div>

        <button
          id="audition-pitched-clip-btn"
          onClick={handleAudition}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
        >
          <Play className="w-3 h-3 fill-current text-purple-400" />
          Audition
        </button>
      </div>

      {/* Pitch Tuning Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Semitones Transpose */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300 flex items-center gap-1">
              <Music className="w-3.5 h-3.5 text-purple-400" />
              Transpose
            </span>
            <span className="font-mono font-bold text-purple-400">
              {clip.pitchSemitones > 0 ? `+${clip.pitchSemitones}` : clip.pitchSemitones} st
            </span>
          </div>
          <input
            id="pitch-semitones-slider"
            type="range"
            min="-24"
            max="24"
            step="1"
            value={clip.pitchSemitones}
            onChange={(e) =>
              onUpdateClip({ ...clip, pitchSemitones: parseInt(e.target.value) })
            }
            className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>-24st (-2 Oct)</span>
            <button
              onClick={() => onUpdateClip({ ...clip, pitchSemitones: 0 })}
              className="hover:text-slate-200"
            >
              Reset
            </button>
            <span>+24st (+2 Oct)</span>
          </div>
        </div>

        {/* Fine Detune Cents */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Fine Detune
            </span>
            <span className="font-mono font-bold text-cyan-400">
              {clip.pitchCents > 0 ? `+${clip.pitchCents}` : clip.pitchCents} cents
            </span>
          </div>
          <input
            id="pitch-cents-slider"
            type="range"
            min="-100"
            max="100"
            step="1"
            value={clip.pitchCents}
            onChange={(e) =>
              onUpdateClip({ ...clip, pitchCents: parseInt(e.target.value) })
            }
            className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>-100ct</span>
            <button
              onClick={() => onUpdateClip({ ...clip, pitchCents: 0 })}
              className="hover:text-slate-200"
            >
              Reset
            </button>
            <span>+100ct</span>
          </div>
        </div>

        {/* Varispeed Playback Rate */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Speed / Varispeed
            </span>
            <span className="font-mono font-bold text-amber-400">
              {clip.playbackRate.toFixed(2)}x
            </span>
          </div>
          <input
            id="playback-rate-slider"
            type="range"
            min="0.25"
            max="2.5"
            step="0.05"
            value={clip.playbackRate}
            onChange={(e) =>
              onUpdateClip({ ...clip, playbackRate: parseFloat(e.target.value) })
            }
            className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>0.25x</span>
            <button
              onClick={() => onUpdateClip({ ...clip, playbackRate: 1.0 })}
              className="hover:text-slate-200"
            >
              1.00x
            </button>
            <span>2.50x</span>
          </div>
        </div>
      </div>

      {/* LFO Pitch Vibrato Modulation */}
      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            LFO Pitch Vibrato
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {clip.vibratoRate > 0 && clip.vibratoDepth > 0
              ? `${clip.vibratoRate.toFixed(1)} Hz | ${(clip.vibratoDepth * 100).toFixed(0)}% depth`
              : 'Disabled (0 Hz)'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono w-24">Rate (Speed):</span>
            <input
              type="range"
              min="0"
              max="16"
              step="0.5"
              value={clip.vibratoRate}
              onChange={(e) =>
                onUpdateClip({ ...clip, vibratoRate: parseFloat(e.target.value) })
              }
              className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono text-slate-300 w-12 text-right">
              {clip.vibratoRate.toFixed(1)} Hz
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono w-24">Depth (Mod):</span>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.02"
              value={clip.vibratoDepth}
              onChange={(e) =>
                onUpdateClip({ ...clip, vibratoDepth: parseFloat(e.target.value) })
              }
              className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono text-slate-300 w-12 text-right">
              {(clip.vibratoDepth * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Custom Sample Rate Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isResampling ? 'animate-spin' : ''}`} />
            Target Sample Rate Resampling
          </span>
          <span className="text-[11px] font-mono text-blue-400">
            Active: {clip.sampleRate} Hz ({clip.channels === 1 ? 'Mono' : 'Stereo'})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SAMPLE_RATES.map(({ rate, label, desc }) => {
            const isCurrent = clip.sampleRate === rate;
            return (
              <button
                key={rate}
                onClick={() => handleSelectSampleRate(rate)}
                disabled={isResampling}
                className={`p-2.5 rounded-xl text-left transition border ${
                  isCurrent
                    ? 'bg-blue-600/20 border-blue-500/60 text-white shadow-sm'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="font-mono text-xs font-bold flex items-center justify-between">
                  <span>{label}</span>
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">{desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
