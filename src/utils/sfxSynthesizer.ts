import { SfxRecipe, SoundClip } from '../types';
import { getAudioContext } from './audioEngine';

// Generates an AudioBuffer based on a synthesis recipe
export function synthesizeRecipe(
  recipe: SfxRecipe,
  duration = 1.2,
  sampleRate = 44100
): AudioBuffer {
  const ctx = getAudioContext();
  const numChannels = 2;
  const length = Math.floor(duration * sampleRate);
  const buffer = ctx.createBuffer(numChannels, length, sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const {
    baseFreq = 220,
    endFreq = 80,
    oscType = 'sawtooth',
    pitchEnv = 'drop',
    noiseMix = 0.2,
    noiseType = 'white',
    attack = 0.01,
    decay = 0.8,
    filterCutoff = 3500,
    harmonics = [1.0, 0.5, 0.2],
    reverbMix = 0.2,
    distortion = 0.05,
    vibratoRate = 4.0,
    vibratoDepth = 0.02,
    subBass = 0.3,
  } = recipe;

  let phase = 0;
  let subPhase = 0;
  let prevNoise = 0;

  // Simple feedback delay comb for simulated reverb space
  const delaySamples = Math.floor(0.045 * sampleRate);
  const delayBufferL = new Float32Array(delaySamples);
  const delayBufferR = new Float32Array(delaySamples);
  let delayIdx = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const progress = i / length;

    // Amplitude Envelope (ADSR style)
    let amp = 0;
    if (t < attack) {
      amp = t / Math.max(0.001, attack);
    } else {
      const decayTime = t - attack;
      amp = Math.exp(-decayTime / Math.max(0.05, decay));
    }

    // Pitch Envelope
    let currentFreq = baseFreq;
    if (pitchEnv === 'drop') {
      currentFreq = baseFreq + (endFreq - baseFreq) * Math.pow(progress, 0.6);
    } else if (pitchEnv === 'rise') {
      currentFreq = baseFreq + (endFreq - baseFreq) * Math.pow(progress, 1.4);
    } else if (pitchEnv === 'chirp') {
      currentFreq = baseFreq * (1 + 2 * Math.exp(-t * 18)) + endFreq * progress;
    } else if (pitchEnv === 'siren') {
      currentFreq = (baseFreq + endFreq) / 2 + (endFreq - baseFreq) / 2 * Math.sin(t * 15);
    } else if (pitchEnv === 'sweep') {
      currentFreq = baseFreq * Math.pow(endFreq / Math.max(20, baseFreq), progress);
    }

    // Vibrato
    if (vibratoRate > 0 && vibratoDepth > 0) {
      currentFreq *= 1 + Math.sin(2 * Math.PI * vibratoRate * t) * vibratoDepth;
    }

    // Phase increment
    const phaseInc = (2 * Math.PI * currentFreq) / sampleRate;
    phase = (phase + phaseInc) % (2 * Math.PI);

    // Sub-bass phase
    const subPhaseInc = (2 * Math.PI * (currentFreq * 0.5)) / sampleRate;
    subPhase = (subPhase + subPhaseInc) % (2 * Math.PI);

    // Oscillator waveform calculation
    let osc = 0;
    if (oscType === 'sine') {
      osc = Math.sin(phase);
    } else if (oscType === 'triangle') {
      osc = (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else if (oscType === 'sawtooth') {
      osc = 2 * (phase / (2 * Math.PI)) - 1;
    } else if (oscType === 'square') {
      osc = Math.sin(phase) >= 0 ? 0.9 : -0.9;
    }

    // Harmonics addition
    for (let h = 0; h < harmonics.length; h++) {
      const harmonicMul = h + 2;
      const hAmp = harmonics[h];
      if (hAmp > 0) {
        osc += Math.sin(phase * harmonicMul) * hAmp * 0.4;
      }
    }

    // Sub bass sine
    if (subBass > 0) {
      osc += Math.sin(subPhase) * subBass * 0.5;
    }

    // Noise Generator
    let noise = Math.random() * 2 - 1;
    if (noiseType === 'pink') {
      noise = 0.7 * prevNoise + 0.3 * noise;
      prevNoise = noise;
    } else if (noiseType === 'crackle') {
      noise = Math.random() > 0.92 ? (Math.random() * 2 - 1) : 0;
    }

    // Mix Oscillator and Noise
    let drySignal = (1 - noiseMix) * osc + noiseMix * noise;

    // Filter simulation (one-pole low-pass based on filterCutoff)
    const effectiveCutoff = Math.min(sampleRate * 0.45, filterCutoff * (1 - progress * 0.4));
    const rc = 1.0 / (2 * Math.PI * effectiveCutoff);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);
    prevNoise = prevNoise + alpha * (drySignal - prevNoise);
    drySignal = prevNoise;

    // Soft Saturation / Distortion
    if (distortion > 0) {
      drySignal = Math.tanh(drySignal * (1 + distortion * 4));
    }

    // Combined amplitude
    let sampleVal = drySignal * amp * 0.85;

    // Space / Reverb simulation using delay comb
    const delayedL = delayBufferL[delayIdx];
    const delayedR = delayBufferR[delayIdx];
    delayBufferL[delayIdx] = sampleVal + delayedR * 0.35;
    delayBufferR[delayIdx] = sampleVal + delayedL * 0.28;
    delayIdx = (delayIdx + 1) % delaySamples;

    const outL = sampleVal * (1 - reverbMix * 0.4) + delayedL * reverbMix;
    const outR = sampleVal * (1 - reverbMix * 0.4) + delayedR * reverbMix;

    left[i] = Math.max(-1, Math.min(1, outL));
    right[i] = Math.max(-1, Math.min(1, outR));
  }

  return buffer;
}

// Built-in Sound Design Presets matching SA3 Small SFX Model
export const PRESET_RECIPES: Record<string, SfxRecipe & { duration: number }> = {
  laser_blaster: {
    title: 'Laser Blaster',
    category: 'sci-fi',
    duration: 0.35,
    baseFreq: 1800,
    endFreq: 90,
    oscType: 'sawtooth',
    pitchEnv: 'chirp',
    noiseMix: 0.15,
    attack: 0.002,
    decay: 0.25,
    filterCutoff: 5200,
    filterType: 'lowpass',
    harmonics: [0.8, 0.4, 0.1],
    reverbMix: 0.18,
    distortion: 0.2,
    vibratoRate: 0,
    vibratoDepth: 0,
    subBass: 0.2,
  },
  plasma_cannon: {
    title: 'Plasma Cannon',
    category: 'sci-fi',
    duration: 0.8,
    baseFreq: 520,
    endFreq: 35,
    oscType: 'square',
    pitchEnv: 'drop',
    noiseMix: 0.45,
    attack: 0.005,
    decay: 0.65,
    filterCutoff: 3800,
    filterType: 'lowpass',
    harmonics: [0.9, 0.5, 0.2],
    reverbMix: 0.35,
    distortion: 0.35,
    vibratoRate: 8,
    vibratoDepth: 0.04,
    subBass: 0.8,
  },
  retro_coin: {
    title: 'Retro 8-bit Coin',
    category: 'retro',
    duration: 0.4,
    baseFreq: 987.77, // B5
    endFreq: 1318.51, // E6
    oscType: 'square',
    pitchEnv: 'rise',
    noiseMix: 0.0,
    attack: 0.001,
    decay: 0.3,
    filterCutoff: 8000,
    filterType: 'lowpass',
    harmonics: [0.2, 0.0, 0.0],
    reverbMix: 0.1,
    distortion: 0.0,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  retro_powerup: {
    title: 'Chiptune Powerup',
    category: 'retro',
    duration: 0.65,
    baseFreq: 220,
    endFreq: 880,
    oscType: 'triangle',
    pitchEnv: 'rise',
    noiseMix: 0.05,
    attack: 0.01,
    decay: 0.55,
    filterCutoff: 6500,
    filterType: 'lowpass',
    harmonics: [0.6, 0.3, 0.1],
    reverbMix: 0.2,
    distortion: 0.05,
    vibratoRate: 12,
    vibratoDepth: 0.06,
  },
  cinematic_boom: {
    title: 'Cinematic Sub Drop',
    category: 'cinematic',
    duration: 2.2,
    baseFreq: 95,
    endFreq: 25,
    oscType: 'sine',
    pitchEnv: 'drop',
    noiseMix: 0.25,
    noiseType: 'pink',
    attack: 0.01,
    decay: 1.8,
    filterCutoff: 1800,
    filterType: 'lowpass',
    harmonics: [0.7, 0.3, 0.1],
    reverbMix: 0.45,
    distortion: 0.15,
    vibratoRate: 0,
    vibratoDepth: 0,
    subBass: 1.0,
  },
  heavy_impact: {
    title: 'Heavy Anvil Hit',
    category: 'impact',
    duration: 0.9,
    baseFreq: 440,
    endFreq: 60,
    oscType: 'triangle',
    pitchEnv: 'drop',
    noiseMix: 0.5,
    attack: 0.002,
    decay: 0.7,
    filterCutoff: 4500,
    filterType: 'lowpass',
    harmonics: [1.0, 0.8, 0.4],
    reverbMix: 0.3,
    distortion: 0.25,
    vibratoRate: 0,
    vibratoDepth: 0,
    subBass: 0.6,
  },
  ui_click: {
    title: 'Haptic Click',
    category: 'ui',
    duration: 0.08,
    baseFreq: 1200,
    endFreq: 300,
    oscType: 'sine',
    pitchEnv: 'drop',
    noiseMix: 0.2,
    attack: 0.001,
    decay: 0.05,
    filterCutoff: 6000,
    filterType: 'highpass',
    harmonics: [0.3, 0.1, 0.0],
    reverbMix: 0.05,
    distortion: 0.0,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  ui_confirm: {
    title: 'Futuristic Confirm',
    category: 'ui',
    duration: 0.45,
    baseFreq: 523.25, // C5
    endFreq: 1046.5,  // C6
    oscType: 'sine',
    pitchEnv: 'sweep',
    noiseMix: 0.05,
    attack: 0.005,
    decay: 0.35,
    filterCutoff: 7000,
    filterType: 'lowpass',
    harmonics: [0.5, 0.25, 0.1],
    reverbMix: 0.25,
    distortion: 0.0,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  thunder_burst: {
    title: 'Thunder Clap',
    category: 'foley',
    duration: 1.8,
    baseFreq: 120,
    endFreq: 30,
    oscType: 'sawtooth',
    pitchEnv: 'drop',
    noiseMix: 0.85,
    noiseType: 'pink',
    attack: 0.008,
    decay: 1.5,
    filterCutoff: 2200,
    filterType: 'lowpass',
    harmonics: [0.4, 0.2, 0.1],
    reverbMix: 0.5,
    distortion: 0.4,
    vibratoRate: 6,
    vibratoDepth: 0.05,
    subBass: 0.8,
  },
  alien_communicator: {
    title: 'Alien Chatter',
    category: 'sci-fi',
    duration: 0.75,
    baseFreq: 440,
    endFreq: 1760,
    oscType: 'triangle',
    pitchEnv: 'siren',
    noiseMix: 0.1,
    attack: 0.02,
    decay: 0.6,
    filterCutoff: 4200,
    filterType: 'bandpass',
    harmonics: [0.8, 0.5, 0.2],
    reverbMix: 0.3,
    distortion: 0.1,
    vibratoRate: 16,
    vibratoDepth: 0.35,
  },
  cyber_whoosh: {
    title: 'Cyberpunk Whoosh',
    category: 'cinematic',
    duration: 1.1,
    baseFreq: 80,
    endFreq: 2400,
    oscType: 'sawtooth',
    pitchEnv: 'rise',
    noiseMix: 0.65,
    attack: 0.25,
    decay: 0.75,
    filterCutoff: 3600,
    filterType: 'lowpass',
    harmonics: [0.7, 0.4, 0.2],
    reverbMix: 0.35,
    distortion: 0.2,
    vibratoRate: 3,
    vibratoDepth: 0.05,
  },
  wood_tap: {
    title: 'Wood Percussion',
    category: 'foley',
    duration: 0.22,
    baseFreq: 380,
    endFreq: 120,
    oscType: 'sine',
    pitchEnv: 'drop',
    noiseMix: 0.35,
    attack: 0.001,
    decay: 0.15,
    filterCutoff: 2800,
    filterType: 'lowpass',
    harmonics: [0.8, 0.2, 0.05],
    reverbMix: 0.12,
    distortion: 0.05,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  error_buzzer: {
    title: 'Cyber Glitch Error',
    category: 'ui',
    duration: 0.35,
    baseFreq: 130,
    endFreq: 95,
    oscType: 'sawtooth',
    pitchEnv: 'drop',
    noiseMix: 0.3,
    attack: 0.005,
    decay: 0.28,
    filterCutoff: 3000,
    filterType: 'lowpass',
    harmonics: [1.0, 0.8, 0.5],
    reverbMix: 0.1,
    distortion: 0.6,
    vibratoRate: 20,
    vibratoDepth: 0.15,
  },
  warp_jump: {
    title: 'Warp Jump Gate',
    category: 'sci-fi',
    duration: 1.4,
    baseFreq: 120,
    endFreq: 3600,
    oscType: 'sawtooth',
    pitchEnv: 'sweep',
    noiseMix: 0.4,
    attack: 0.1,
    decay: 1.1,
    filterCutoff: 6000,
    filterType: 'lowpass',
    harmonics: [0.8, 0.5, 0.3],
    reverbMix: 0.4,
    distortion: 0.25,
    vibratoRate: 10,
    vibratoDepth: 0.1,
    subBass: 0.5,
  },
  arcade_jump: {
    title: 'Arcade Jump 8-bit',
    category: 'retro',
    duration: 0.28,
    baseFreq: 150,
    endFreq: 600,
    oscType: 'square',
    pitchEnv: 'rise',
    noiseMix: 0.0,
    attack: 0.002,
    decay: 0.24,
    filterCutoff: 7500,
    filterType: 'lowpass',
    harmonics: [0.4, 0.1, 0.0],
    reverbMix: 0.12,
    distortion: 0.0,
    vibratoRate: 0,
    vibratoDepth: 0,
  },
  crystal_bell: {
    title: 'Crystal Chime',
    category: 'foley',
    duration: 1.5,
    baseFreq: 1760, // A6
    endFreq: 1760,
    oscType: 'sine',
    pitchEnv: 'stable',
    noiseMix: 0.05,
    attack: 0.002,
    decay: 1.3,
    filterCutoff: 9000,
    filterType: 'lowpass',
    harmonics: [0.9, 0.6, 0.4],
    reverbMix: 0.45,
    distortion: 0.02,
    vibratoRate: 5,
    vibratoDepth: 0.015,
  },
};

// Create initial sound clip from a recipe
export function createClipFromRecipe(
  id: string,
  recipe: SfxRecipe & { duration?: number },
  prompt?: string
): SoundClip {
  const duration = recipe.duration || 1.0;
  const audioBuffer = synthesizeRecipe(recipe, duration, 44100);

  return {
    id,
    name: recipe.title,
    category: recipe.category,
    audioBuffer,
    duration,
    sampleRate: 44100,
    channels: 2,
    trimStart: 0,
    trimEnd: duration,
    fadeIn: 0.005,
    fadeOut: 0.015,
    pitchSemitones: 0,
    pitchCents: 0,
    playbackRate: 1.0,
    vibratoRate: recipe.vibratoRate || 0,
    vibratoDepth: recipe.vibratoDepth || 0,
    gain: 1.0,
    isReversed: false,
    isNormalized: false,
    sourcePrompt: prompt || recipe.title,
    createdAt: Date.now(),
  };
}

// Generate the standard 16 preset clips for Bank A
export function generateDefaultBankAClips(): SoundClip[] {
  const presetKeys = Object.keys(PRESET_RECIPES);
  return presetKeys.slice(0, 16).map((key, index) => {
    const preset = PRESET_RECIPES[key];
    return createClipFromRecipe(`clip-bankA-${index}`, preset, preset.title);
  });
}
