import { SampleRateOption, SoundClip } from '../types';

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Ensure context is running on user interaction
export function ensureAudioUnlocked(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// Convert AudioBuffer to 16-bit PCM WAV Blob with full RIFF headers
export function audioBufferToWavBlob(
  buffer: AudioBuffer,
  options?: {
    trimStart?: number;
    trimEnd?: number;
    targetSampleRate?: number;
    gain?: number;
    fadeIn?: number;
    fadeOut?: number;
    pitchSemitones?: number;
  }
): Blob {
  const sampleRate = options?.targetSampleRate || buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const originalRate = buffer.sampleRate;

  const trimStart = Math.max(0, options?.trimStart ?? 0);
  const trimEnd = Math.min(buffer.duration, options?.trimEnd ?? buffer.duration);
  const durationSec = Math.max(0.01, trimEnd - trimStart);

  // If sample rate changed, calculate appropriate output length
  const rateRatio = sampleRate / originalRate;
  const startSample = Math.floor(trimStart * originalRate);
  const endSample = Math.min(buffer.length, Math.floor(trimEnd * originalRate));
  const rawSampleCount = Math.max(1, endSample - startSample);
  const outSampleCount = Math.floor(rawSampleCount * rateRatio);

  const gain = options?.gain ?? 1.0;
  const fadeInSamples = Math.floor((options?.fadeIn ?? 0) * sampleRate);
  const fadeOutSamples = Math.floor((options?.fadeOut ?? 0) * sampleRate);

  // Prepare interleaved 16-bit PCM data
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = outSampleCount * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // Write RIFF identifier
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // Write fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample

  // Write data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Read channel data
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < outSampleCount; i++) {
    // Linear interpolation resampling
    const srcIndex = startSample + i / rateRatio;
    const idx0 = Math.min(endSample - 1, Math.floor(srcIndex));
    const idx1 = Math.min(endSample - 1, idx0 + 1);
    const frac = srcIndex - idx0;

    // Apply fade in / fade out envelopes
    let env = 1.0;
    if (fadeInSamples > 0 && i < fadeInSamples) {
      env *= i / fadeInSamples;
    }
    if (fadeOutSamples > 0 && i > outSampleCount - fadeOutSamples) {
      env *= (outSampleCount - i) / fadeOutSamples;
    }

    for (let ch = 0; ch < numChannels; ch++) {
      const data = channelData[ch];
      const s0 = data[idx0] || 0;
      const s1 = data[idx1] || s0;
      const interpolated = (s0 + (s1 - s0) * frac) * gain * env;

      // Clamp between -1.0 and 1.0
      const clamped = Math.max(-1.0, Math.min(1.0, interpolated));
      // Convert to 16-bit signed integer (-32768 to 32767)
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Offline resample AudioBuffer to another sample rate
export async function resampleBuffer(
  buffer: AudioBuffer,
  targetSampleRate: SampleRateOption
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate) {
    return buffer;
  }

  const duration = buffer.duration;
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil(duration * targetSampleRate),
    targetSampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  return await offlineCtx.startRendering();
}

// Render processed audio buffer with trimming, gain, fades, reverse applied
export async function renderProcessedBuffer(
  clip: SoundClip,
  overrideSampleRate?: SampleRateOption
): Promise<AudioBuffer> {
  const sourceBuffer = clip.audioBuffer;
  const sampleRate = overrideSampleRate || clip.sampleRate || sourceBuffer.sampleRate;
  const trimStart = Math.max(0, clip.trimStart);
  const trimEnd = Math.min(sourceBuffer.duration, clip.trimEnd);
  const duration = Math.max(0.02, trimEnd - trimStart);

  const offlineCtx = new OfflineAudioContext(
    sourceBuffer.numberOfChannels,
    Math.ceil(duration * sampleRate),
    sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  // Pitch calculation
  const semitoneRate = Math.pow(2, (clip.pitchSemitones + clip.pitchCents / 100) / 12);
  source.playbackRate.value = semitoneRate * clip.playbackRate;

  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = clip.gain;

  // Apply Fades
  const now = 0;
  if (clip.fadeIn > 0) {
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(clip.gain, now + clip.fadeIn);
  }
  if (clip.fadeOut > 0) {
    const fadeStartTime = Math.max(0, duration - clip.fadeOut);
    gainNode.gain.setValueAtTime(clip.gain, fadeStartTime);
    gainNode.gain.linearRampToValueAtTime(0, duration);
  }

  source.connect(gainNode);
  gainNode.connect(offlineCtx.destination);

  // Start from trimStart
  source.start(0, trimStart, duration);

  const rendered = await offlineCtx.startRendering();

  // If reversed, reverse rendered channels
  if (clip.isReversed) {
    return reverseBuffer(rendered);
  }

  return rendered;
}

// Reverse AudioBuffer channels
export function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = getAudioContext();
  const reversed = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dest = reversed.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      dest[i] = src[buffer.length - 1 - i];
    }
  }

  return reversed;
}

// Peak normalize AudioBuffer to target Peak dB (default -0.1 dB = 0.988)
export function normalizeBuffer(buffer: AudioBuffer, targetPeakDb = -0.1): AudioBuffer {
  const targetLinear = Math.pow(10, targetPeakDb / 20);
  let maxPeak = 0;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
  }

  if (maxPeak === 0 || maxPeak === targetLinear) {
    return buffer;
  }

  const multiplier = targetLinear / maxPeak;
  const ctx = getAudioContext();
  const normalized = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dest = normalized.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dest[i] = src[i] * multiplier;
    }
  }

  return normalized;
}

// Detect start and end of non-silent audio
export function detectSilence(
  buffer: AudioBuffer,
  thresholdDb = -45
): { start: number; end: number } {
  const threshold = Math.pow(10, thresholdDb / 20);
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;

  let firstIndex = 0;
  let lastIndex = length - 1;

  // Window size for RMS / peak detection
  const windowSize = Math.floor(sampleRate * 0.005); // 5ms windows

  // Find start
  for (let i = 0; i < length; i += windowSize) {
    let windowPeak = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      const endWin = Math.min(length, i + windowSize);
      for (let j = i; j < endWin; j++) {
        const abs = Math.abs(data[j]);
        if (abs > windowPeak) windowPeak = abs;
      }
    }
    if (windowPeak >= threshold) {
      firstIndex = Math.max(0, i - windowSize); // keep slight pre-roll
      break;
    }
  }

  // Find end
  for (let i = length - 1; i >= 0; i -= windowSize) {
    let windowPeak = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      const startWin = Math.max(0, i - windowSize);
      for (let j = startWin; j <= i; j++) {
        const abs = Math.abs(data[j]);
        if (abs > windowPeak) windowPeak = abs;
      }
    }
    if (windowPeak >= threshold) {
      lastIndex = Math.min(length - 1, i + windowSize);
      break;
    }
  }

  const startSec = firstIndex / sampleRate;
  const endSec = Math.max(startSec + 0.05, lastIndex / sampleRate);

  return { start: startSec, end: endSec };
}

// Active voices tracking for stop all / choke groups
interface ActiveVoice {
  id: string;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  stop: () => void;
  startTime: number;
  duration: number;
}

const activeVoices = new Map<string, ActiveVoice>();

export function stopAllVoices(): void {
  activeVoices.forEach((voice) => {
    try {
      voice.stop();
    } catch {}
  });
  activeVoices.clear();
}

export function stopVoice(id: string): void {
  const voice = activeVoices.get(id);
  if (voice) {
    try {
      voice.stop();
    } catch {}
    activeVoices.delete(id);
  }
}

// Play sound clip with pitch modulation, trimming, and real-time audio routing
export function playClip(
  clip: SoundClip,
  options?: {
    voiceId?: string;
    onEnded?: () => void;
    overridePitchSemitones?: number;
    overrideSampleRate?: number;
    loop?: boolean;
    startOffset?: number; // relative to trimStart
  }
): { stop: () => void; getProgress: () => number } {
  const ctx = getAudioContext();
  ensureAudioUnlocked();

  const voiceId = options?.voiceId || `voice-${Date.now()}-${Math.random()}`;
  stopVoice(voiceId);

  const source = ctx.createBufferSource();
  source.buffer = clip.audioBuffer;

  // Pitch calculation
  const semitones = options?.overridePitchSemitones ?? clip.pitchSemitones;
  const totalCents = semitones * 100 + clip.pitchCents;
  const pitchRatio = Math.pow(2, totalCents / 1200) * clip.playbackRate;
  source.playbackRate.value = pitchRatio;

  // LFO Vibrato modulation if enabled
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (clip.vibratoRate > 0 && clip.vibratoDepth > 0) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = clip.vibratoRate;
    lfoGain = ctx.createGain();
    // 100 cents = 1 semitone vibrato depth scale
    lfoGain.gain.value = clip.vibratoDepth * 80;
    lfo.connect(lfoGain);
    lfoGain.connect(source.detune);
    lfo.start();
  }

  // Master Gain & Fades
  const gainNode = ctx.createGain();
  gainNode.gain.value = clip.gain;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  const trimStart = Math.max(0, clip.trimStart);
  const trimEnd = Math.min(clip.audioBuffer.duration, clip.trimEnd);
  const effectiveDuration = Math.max(0.01, (trimEnd - trimStart) / pitchRatio);

  const offset = trimStart + (options?.startOffset || 0);
  const playDuration = Math.max(0.01, trimEnd - offset);

  const startTime = ctx.currentTime;

  // Apply Fades
  if (clip.fadeIn > 0) {
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(clip.gain, startTime + clip.fadeIn);
  }
  if (clip.fadeOut > 0) {
    const fadeStart = startTime + Math.max(0, playDuration / pitchRatio - clip.fadeOut);
    gainNode.gain.setValueAtTime(clip.gain, fadeStart);
    gainNode.gain.linearRampToValueAtTime(0, startTime + playDuration / pitchRatio);
  }

  source.loop = Boolean(options?.loop);
  if (source.loop) {
    source.loopStart = trimStart;
    source.loopEnd = trimEnd;
  }

  let stopped = false;
  const stopFunc = () => {
    if (stopped) return;
    stopped = true;
    try {
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.015);
      setTimeout(() => {
        try {
          source.stop();
          source.disconnect();
          lfo?.stop();
          lfo?.disconnect();
          lfoGain?.disconnect();
          gainNode.disconnect();
        } catch {}
      }, 20);
    } catch {}
    activeVoices.delete(voiceId);
    if (options?.onEnded) options.onEnded();
  };

  source.onended = () => {
    if (!stopped) {
      stopped = true;
      activeVoices.delete(voiceId);
      if (options?.onEnded) options.onEnded();
    }
  };

  source.start(0, offset, source.loop ? undefined : playDuration);

  activeVoices.set(voiceId, {
    id: voiceId,
    sourceNode: source,
    gainNode,
    stop: stopFunc,
    startTime,
    duration: effectiveDuration,
  });

  return {
    stop: stopFunc,
    getProgress: () => {
      if (stopped) return 0;
      const elapsed = (ctx.currentTime - startTime) * pitchRatio;
      return Math.min(1.0, elapsed / (trimEnd - trimStart));
    },
  };
}

// Decode audio file blob/arrayBuffer into AudioBuffer
export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}
