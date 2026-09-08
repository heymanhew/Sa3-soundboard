import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Square, Scissors, Volume2, RotateCcw, Download, ZoomIn, ZoomOut, Sparkles, Sliders } from 'lucide-react';
import { SoundClip } from '../types';
import { audioBufferToWavBlob, playClip, normalizeBuffer, reverseBuffer, detectSilence, renderProcessedBuffer } from '../utils/audioEngine';

interface WaveformEditorProps {
  clip: SoundClip;
  padNumber: number;
  bankId: string;
  onUpdateClip: (updated: SoundClip) => void;
  onClose: () => void;
}

export const WaveformEditor: React.FC<WaveformEditorProps> = ({
  clip,
  padNumber,
  bankId,
  onUpdateClip,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPos, setPlayheadPos] = useState(0); // 0 to 1 relative to duration
  const [zoom, setZoom] = useState(1); // 1x to 6x
  const [isLooping, setIsLooping] = useState(false);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);

  const activePlaybackRef = useRef<{ stop: () => void; getProgress: () => number } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const duration = clip.audioBuffer.duration;
  const trimStart = clip.trimStart;
  const trimEnd = clip.trimEnd;

  // Draw Waveform onto Canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    for (let x = 0; x < width; x += width / 8) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();

    const channelData = clip.audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const samplesPerPixel = Math.max(1, Math.floor(totalSamples / (width * zoom)));

    const startX = (trimStart / duration) * width;
    const endX = (trimEnd / duration) * width;

    // Dim non-selected regions
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Highlight active selection
    const selGradient = ctx.createLinearGradient(startX, 0, endX, 0);
    selGradient.addColorStop(0, 'rgba(16, 185, 129, 0.08)'); // emerald
    selGradient.addColorStop(1, 'rgba(59, 130, 246, 0.08)'); // blue
    ctx.fillStyle = selGradient;
    ctx.fillRect(startX, 0, endX - startX, height);

    // Draw waveform bars
    const midY = height / 2;
    for (let x = 0; x < width; x++) {
      const sampleIdx = Math.floor((x / width) * totalSamples);
      let min = 1.0;
      let max = -1.0;

      for (let s = 0; s < samplesPerPixel; s++) {
        const val = channelData[sampleIdx + s] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const isInsideTrim = x >= startX && x <= endX;
      const barTop = midY + min * (midY - 8);
      const barBottom = midY + max * (midY - 8);

      ctx.fillStyle = isInsideTrim ? '#10b981' : '#475569'; // emerald vs slate
      ctx.fillRect(x, barTop, 1, Math.max(1, barBottom - barTop));
    }

    // Draw Fade In curve
    if (clip.fadeIn > 0) {
      const fadeInX = startX + (clip.fadeIn / duration) * width;
      ctx.strokeStyle = '#38bdf8'; // sky
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, height);
      ctx.lineTo(fadeInX, 8);
      ctx.stroke();
    }

    // Draw Fade Out curve
    if (clip.fadeOut > 0) {
      const fadeOutX = endX - (clip.fadeOut / duration) * width;
      ctx.strokeStyle = '#f43f5e'; // rose
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fadeOutX, 8);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }

    // Trim Start Handle (Green line & top badge)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.fillRect(startX - 5, 0, 10, 16);
    ctx.fillRect(startX - 5, height - 16, 10, 16);

    // Trim End Handle (Blue line & top badge)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(endX - 5, 0, 10, 16);
    ctx.fillRect(endX - 5, height - 16, 10, 16);

    // Playhead line
    if (isPlaying) {
      const playheadX = playheadPos * width;
      ctx.strokeStyle = '#fbbf24'; // amber-400
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // playhead head
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(playheadX, 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [clip, duration, trimStart, trimEnd, zoom, isPlaying, playheadPos]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Handle Play / Stop
  const handlePlayToggle = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const stopPlayback = () => {
    if (activePlaybackRef.current) {
      activePlaybackRef.current.stop();
      activePlaybackRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsPlaying(false);
    setPlayheadPos(trimStart / duration);
  };

  const startPlayback = () => {
    stopPlayback();
    setIsPlaying(true);

    const voice = playClip(clip, {
      loop: isLooping,
      onEnded: () => {
        if (!isLooping) {
          setIsPlaying(false);
          setPlayheadPos(trimStart / duration);
        }
      },
    });

    activePlaybackRef.current = voice;

    const updateFrame = () => {
      if (activePlaybackRef.current) {
        const progress = activePlaybackRef.current.getProgress();
        const currentSec = trimStart + progress * (trimEnd - trimStart);
        setPlayheadPos(currentSec / duration);
        animFrameRef.current = requestAnimationFrame(updateFrame);
      }
    };
    animFrameRef.current = requestAnimationFrame(updateFrame);
  };

  // Drag handles logic on canvas
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const clickSec = (x / width) * duration;

    const startX = (trimStart / duration) * width;
    const endX = (trimEnd / duration) * width;

    // Check hit on start or end handle (tolerance 12px)
    if (Math.abs(x - startX) <= 14) {
      setActiveHandle('start');
    } else if (Math.abs(x - endX) <= 14) {
      setActiveHandle('end');
    } else {
      // Clicked inside/outside: set trim start if left, or end if right
      if (clickSec < (trimStart + trimEnd) / 2) {
        onUpdateClip({
          ...clip,
          trimStart: Math.max(0, Math.min(clickSec, trimEnd - 0.02)),
        });
      } else {
        onUpdateClip({
          ...clip,
          trimEnd: Math.min(duration, Math.max(clickSec, trimStart + 0.02)),
        });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeHandle || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const sec = (x / rect.width) * duration;

    if (activeHandle === 'start') {
      const newStart = Math.max(0, Math.min(sec, trimEnd - 0.02));
      onUpdateClip({ ...clip, trimStart: newStart });
    } else if (activeHandle === 'end') {
      const newEnd = Math.min(duration, Math.max(sec, trimStart + 0.02));
      onUpdateClip({ ...clip, trimEnd: newEnd });
    }
  };

  const handleMouseUp = () => {
    setActiveHandle(null);
  };

  // Destructive Crop: renders new AudioBuffer containing only trimmed segment
  const handleCropToTrim = async () => {
    stopPlayback();
    const processed = await renderProcessedBuffer(clip);
    onUpdateClip({
      ...clip,
      audioBuffer: processed,
      duration: processed.duration,
      trimStart: 0,
      trimEnd: processed.duration,
      fadeIn: 0.002,
      fadeOut: 0.005,
    });
  };

  // Reset Trim to full length
  const handleResetTrim = () => {
    onUpdateClip({
      ...clip,
      trimStart: 0,
      trimEnd: clip.duration,
      fadeIn: 0.002,
      fadeOut: 0.005,
    });
  };

  // Normalize
  const handleNormalize = () => {
    const normalized = normalizeBuffer(clip.audioBuffer, -0.1);
    onUpdateClip({
      ...clip,
      audioBuffer: normalized,
      isNormalized: true,
    });
  };

  // Reverse
  const handleReverse = () => {
    const reversed = reverseBuffer(clip.audioBuffer);
    onUpdateClip({
      ...clip,
      audioBuffer: reversed,
      isReversed: !clip.isReversed,
    });
  };

  // Auto-Detect Silence and snap trim handles
  const handleAutoTrimSilence = () => {
    const bounds = detectSilence(clip.audioBuffer, -42);
    onUpdateClip({
      ...clip,
      trimStart: bounds.start,
      trimEnd: bounds.end,
    });
  };

  // Export current clip as WAV
  const handleExportWav = () => {
    const blob = audioBufferToWavBlob(clip.audioBuffer, {
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      targetSampleRate: clip.sampleRate,
      gain: clip.gain,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      pitchSemitones: clip.pitchSemitones,
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clip.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${clip.sampleRate}hz.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="waveform-editor-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
      onMouseUp={handleMouseUp}
    >
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-sm">
              {bankId}{padNumber + 1}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {clip.name}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {clip.sampleRate} Hz
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Duration: {clip.duration.toFixed(3)}s | Active Selection: {(trimEnd - trimStart).toFixed(3)}s
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="export-single-wav-btn"
              onClick={handleExportWav}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Export WAV
            </button>
            <button
              id="close-waveform-btn"
              onClick={() => {
                stopPlayback();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 text-xs font-medium transition border border-slate-700"
            >
              Done
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div ref={containerRef} className="relative p-6 bg-slate-950 flex flex-col gap-3">
          <div className="relative w-full h-44 rounded-xl border border-slate-800 overflow-hidden cursor-crosshair">
            <canvas
              ref={canvasRef}
              className="w-full h-full block"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
            />

            {/* Timecode markers */}
            <div className="absolute bottom-2 left-3 text-[10px] font-mono text-emerald-400 bg-black/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
              IN: {trimStart.toFixed(3)}s
            </div>
            <div className="absolute bottom-2 right-3 text-[10px] font-mono text-blue-400 bg-black/60 px-1.5 py-0.5 rounded border border-blue-500/30">
              OUT: {trimEnd.toFixed(3)}s
            </div>
          </div>

          {/* Transport & Zoom Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <button
                id="waveform-play-toggle-btn"
                onClick={handlePlayToggle}
                className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition shadow-sm ${
                  isPlaying
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                {isPlaying ? 'Stop' : 'Play Selection'}
              </button>

              <button
                id="loop-toggle-btn"
                onClick={() => setIsLooping(!isLooping)}
                className={`px-3 py-2 rounded-lg font-mono transition border ${
                  isLooping
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Loop: {isLooping ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400">
              <ZoomOut className="w-3.5 h-3.5" />
              <input
                type="range"
                min="1"
                max="6"
                step="0.5"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-20 accent-emerald-500 cursor-pointer h-1 bg-slate-700 rounded-lg"
              />
              <ZoomIn className="w-3.5 h-3.5" />
              <span className="font-mono text-[11px] text-slate-300 ml-1">{zoom}x</span>
            </div>
          </div>
        </div>

        {/* Editing Tools Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-6 bg-slate-900/90 border-t border-slate-800">
          <button
            id="crop-selection-btn"
            onClick={handleCropToTrim}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800 hover:bg-emerald-950 hover:border-emerald-500/50 hover:text-emerald-300 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Scissors className="w-3.5 h-3.5 text-emerald-400" />
            Crop to Trim
          </button>

          <button
            id="auto-trim-silence-btn"
            onClick={handleAutoTrimSilence}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800 hover:bg-cyan-950 hover:border-cyan-500/50 hover:text-cyan-300 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Auto-Detect Silence
          </button>

          <button
            id="normalize-btn"
            onClick={handleNormalize}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800 hover:bg-blue-950 hover:border-blue-500/50 hover:text-blue-300 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Volume2 className="w-3.5 h-3.5 text-blue-400" />
            Normalize (-0.1dB)
          </button>

          <button
            id="reverse-btn"
            onClick={handleReverse}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-800 hover:bg-purple-950 hover:border-purple-500/50 hover:text-purple-300 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
            Reverse Audio
          </button>
        </div>

        {/* Fades and Gain Adjustments */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono">Fade In:</span>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.005"
                value={clip.fadeIn}
                onChange={(e) => onUpdateClip({ ...clip, fadeIn: parseFloat(e.target.value) })}
                className="w-20 accent-sky-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-slate-300 w-12">{(clip.fadeIn * 1000).toFixed(0)}ms</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono">Fade Out:</span>
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.01"
                value={clip.fadeOut}
                onChange={(e) => onUpdateClip({ ...clip, fadeOut: parseFloat(e.target.value) })}
                className="w-20 accent-rose-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-slate-300 w-12">{(clip.fadeOut * 1000).toFixed(0)}ms</span>
            </div>
          </div>

          <button
            id="reset-trim-btn"
            onClick={handleResetTrim}
            className="text-slate-400 hover:text-slate-200 font-mono text-[11px] underline"
          >
            Reset Markers
          </button>
        </div>
      </div>
    </div>
  );
};
