export type SampleRateOption = 8000 | 11025 | 16000 | 22050 | 32000 | 44100 | 48000 | 96000;

export interface SoundClip {
  id: string;
  name: string;
  category: 'sci-fi' | 'retro' | 'impact' | 'ui' | 'foley' | 'cinematic' | 'custom';
  audioBuffer: AudioBuffer;
  duration: number;
  sampleRate: number;
  channels: number;
  // Trimming parameters (in seconds)
  trimStart: number;
  trimEnd: number;
  fadeIn: number;  // seconds
  fadeOut: number; // seconds
  // Pitch & Modulation
  pitchSemitones: number; // -24 to +24
  pitchCents: number;     // -100 to +100
  playbackRate: number;   // 0.25 to 4.0
  vibratoRate: number;    // Hz (0 to 20)
  vibratoDepth: number;   // cents or ratio (0 to 1)
  // Gain & Processing
  gain: number;           // 0 to 2.0 (1.0 = 0dB)
  isReversed: boolean;
  isNormalized: boolean;
  sourcePrompt?: string;
  createdAt: number;
}

export interface SoundPad {
  id: number; // 0 to 15 (per bank)
  bankId: 'A' | 'B' | 'C' | 'D';
  keyShortcut: string;
  color: string;
  clip: SoundClip | null;
  isPlaying: boolean;
  isMuted: boolean;
  isSolo: boolean;
  volume: number; // 0 to 1.0
  chokeGroup?: number;
}

export type BankId = 'A' | 'B' | 'C' | 'D';

export interface BatchProcessingOptions {
  trimSilence: boolean;
  silenceThresholdDb: number; // e.g. -45 dB
  normalizeGain: boolean;
  targetPeakDb: number;       // e.g. -0.1 dB
  targetSampleRate: SampleRateOption | null;
  pitchShiftSemitones: number;
  addFadeIn: number;          // seconds
  addFadeOut: number;         // seconds
}

export interface SfxRecipe {
  title: string;
  category: 'sci-fi' | 'retro' | 'impact' | 'ui' | 'foley' | 'cinematic';
  baseFreq: number;
  endFreq: number;
  oscType: OscillatorType;
  pitchEnv: 'drop' | 'rise' | 'siren' | 'stable' | 'chirp' | 'sweep';
  noiseMix: number;
  noiseType?: 'white' | 'pink' | 'crackle';
  attack: number;
  decay: number;
  filterCutoff: number;
  filterType: BiquadFilterType;
  harmonics: number[];
  reverbMix: number;
  distortion: number;
  vibratoRate: number;
  vibratoDepth: number;
  subBass?: number;
}

export interface SA3ModelInfo {
  repo: string;
  title: string;
  description: string;
  modelVariants: Array<{
    name: string;
    weightsSize: string;
    ramRequirement: string;
    sampleRate: number;
    recommended: boolean;
    description: string;
  }>;
  architecture: {
    dit: string;
    vae: string;
    conditioner: string;
    runtime: string;
  };
  androidIntegration: {
    ndk: string;
    abi: string;
    audioSubsystem: string;
    jniFunctions: string[];
  };
}
