import React, { useState } from 'react';
import { Sparkles, Play, Square, Check, RefreshCw, Cpu, Disc } from 'lucide-react';
import { SampleRateOption, SoundClip, SoundPad } from '../types';
import { synthesizeRecipe, PRESET_RECIPES } from '../utils/sfxSynthesizer';
import { playClip } from '../utils/audioEngine';

interface SfxGeneratorModalProps {
  currentBank: string;
  selectedPadIndex: number;
  pads: SoundPad[];
  onAssignToPad: (padIndex: number, clip: SoundClip) => void;
  onClose: () => void;
}

const PROMPT_SUGGESTIONS = [
  'Futuristic laser blaster with sub rumble',
  '8-bit retro jump sound with harmonic pitch bend',
  'Deep cinematic sub impact with reverb tail',
  'Futuristic UI confirm chime chord',
  'Heavy metallic mech footstep on steel plate',
  'Thunderclap crackle with distance delay',
  'Cyberpunk warp drive spooling down',
  'Alien biosensor frequency chirp',
];

export const SfxGeneratorModal: React.FC<SfxGeneratorModalProps> = ({
  currentBank,
  selectedPadIndex,
  pads,
  onAssignToPad,
  onClose,
}) => {
  const [prompt, setPrompt] = useState('Futuristic laser blaster with sub rumble');
  const [category, setCategory] = useState<'sci-fi' | 'retro' | 'impact' | 'ui' | 'foley' | 'cinematic'>('sci-fi');
  const [duration, setDuration] = useState(1.2);
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(44100);
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [modelVariant, setModelVariant] = useState('sa3-small-sfx-q4');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedClip, setGeneratedClip] = useState<SoundClip | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const activeVoiceRef = React.useRef<{ stop: () => void } | null>(null);

  const [targetPadIndex, setTargetPadIndex] = useState(selectedPadIndex);

  // Generate Sound Effect
  const handleGenerate = async () => {
    setIsGenerating(true);
    if (activeVoiceRef.current) {
      activeVoiceRef.current.stop();
      activeVoiceRef.current = null;
    }
    setIsPlayingPreview(false);

    try {
      // Call server recipe generator
      let recipe;
      try {
        const res = await fetch('/api/sfx/generate-recipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            category,
            duration,
            sampleRate,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          recipe = data.recipe;
        }
      } catch {
        // Fallback to local
      }

      // If no server response, fallback to local preset or procedural synthesis
      if (!recipe) {
        const lower = prompt.toLowerCase();
        let fallbackKey = 'laser_blaster';
        if (lower.includes('coin') || lower.includes('8-bit') || lower.includes('retro')) fallbackKey = 'retro_coin';
        else if (lower.includes('boom') || lower.includes('sub') || lower.includes('cinematic')) fallbackKey = 'cinematic_boom';
        else if (lower.includes('impact') || lower.includes('hit') || lower.includes('punch')) fallbackKey = 'heavy_impact';
        else if (lower.includes('ui') || lower.includes('click') || lower.includes('confirm')) fallbackKey = 'ui_confirm';
        else if (lower.includes('thunder')) fallbackKey = 'thunder_burst';
        else if (lower.includes('whoosh') || lower.includes('warp')) fallbackKey = 'cyber_whoosh';

        recipe = PRESET_RECIPES[fallbackKey];
      }

      const audioBuffer = synthesizeRecipe(recipe, duration, sampleRate);

      const newClip: SoundClip = {
        id: `gen-${Date.now()}`,
        name: recipe.title || prompt.slice(0, 24),
        category,
        audioBuffer,
        duration: audioBuffer.duration,
        sampleRate,
        channels: 2,
        trimStart: 0,
        trimEnd: audioBuffer.duration,
        fadeIn: 0.002,
        fadeOut: 0.015,
        pitchSemitones: 0,
        pitchCents: 0,
        playbackRate: 1.0,
        vibratoRate: recipe.vibratoRate || 0,
        vibratoDepth: recipe.vibratoDepth || 0,
        gain: 1.0,
        isReversed: false,
        isNormalized: true,
        sourcePrompt: prompt,
        createdAt: Date.now(),
      };

      setGeneratedClip(newClip);

      // Automatically audition preview
      const voice = playClip(newClip, {
        onEnded: () => setIsPlayingPreview(false),
      });
      activeVoiceRef.current = voice;
      setIsPlayingPreview(true);
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTogglePreview = () => {
    if (!generatedClip) return;
    if (isPlayingPreview) {
      if (activeVoiceRef.current) {
        activeVoiceRef.current.stop();
        activeVoiceRef.current = null;
      }
      setIsPlayingPreview(false);
    } else {
      const voice = playClip(generatedClip, {
        onEnded: () => setIsPlayingPreview(false),
      });
      activeVoiceRef.current = voice;
      setIsPlayingPreview(true);
    }
  };

  const handleAssign = () => {
    if (!generatedClip) return;
    onAssignToPad(targetPadIndex, generatedClip);
    onClose();
  };

  return (
    <div
      id="sfx-generator-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
    >
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                SA3 Small SFX Model Generator
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                  GGUF Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Generate sound effects from text prompts using the Small SFX architecture
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Prompt Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>Sound Prompt</span>
              <span className="text-[11px] text-slate-400 font-mono">Natural Language SFX</span>
            </label>
            <div className="relative">
              <textarea
                id="sfx-prompt-input"
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Heavy mechanical door pneumatic hiss with metallic echo..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition resize-none"
              />
            </div>

            {/* Prompt Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PROMPT_SUGGESTIONS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setPrompt(item)}
                  className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 hover:text-emerald-300 text-[11px] text-slate-400 transition truncate max-w-xs border border-slate-700/60"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Model & Style Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Model Quantization</label>
              <select
                value={modelVariant}
                onChange={(e) => setModelVariant(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              >
                <option value="sa3-small-sfx-q4">SA3 Small SFX (Q4_0 - Mobile Fast)</option>
                <option value="sa3-small-sfx-q8">SA3 Small SFX (Q8_0 - Studio Quality)</option>
                <option value="sa3-foley-pro">SA3 Foley & Environmental (Q4_K)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Category Archetype</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 capitalize"
              >
                <option value="sci-fi">Sci-Fi & Energy</option>
                <option value="retro">Retro & 8-Bit Chiptune</option>
                <option value="impact">Impact & Sub Bass</option>
                <option value="ui">Haptic UI & Chimes</option>
                <option value="foley">Acoustic Foley</option>
                <option value="cinematic">Cinematic Risers & Whooshes</option>
              </select>
            </div>
          </div>

          {/* Parameters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
            <div>
              <span className="text-[11px] text-slate-400 font-mono block">Duration: {duration.toFixed(2)}s</span>
              <input
                type="range"
                min="0.2"
                max="5.0"
                step="0.1"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded mt-2 cursor-pointer"
              />
            </div>

            <div>
              <span className="text-[11px] text-slate-400 font-mono block">Steps: {steps}</span>
              <input
                type="range"
                min="15"
                max="50"
                step="5"
                value={steps}
                onChange={(e) => setSteps(parseInt(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded mt-2 cursor-pointer"
              />
            </div>

            <div>
              <span className="text-[11px] text-slate-400 font-mono block">CFG: {cfgScale.toFixed(1)}</span>
              <input
                type="range"
                min="3.0"
                max="12.0"
                step="0.5"
                value={cfgScale}
                onChange={(e) => setCfgScale(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded mt-2 cursor-pointer"
              />
            </div>

            <div>
              <span className="text-[11px] text-slate-400 font-mono block">Sample Rate</span>
              <select
                value={sampleRate}
                onChange={(e) => setSampleRate(parseInt(e.target.value) as SampleRateOption)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 font-mono mt-1"
              >
                <option value={22050}>22.05 kHz</option>
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48.0 kHz</option>
                <option value={96000}>96.0 kHz</option>
              </select>
            </div>
          </div>

          {/* Action Trigger Button */}
          <button
            id="start-generate-sfx-btn"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg shadow-emerald-500/10"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Synthesizing Sound Effect via SA3 Model...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Audio Clip
              </>
            )}
          </button>

          {/* Preview & Assign Section if generated */}
          {generatedClip && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  id="preview-generated-audio-btn"
                  onClick={handleTogglePreview}
                  className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition"
                >
                  {isPlayingPreview ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
                <div>
                  <h4 className="text-sm font-bold text-white">{generatedClip.name}</h4>
                  <p className="text-xs text-emerald-400 font-mono">
                    {generatedClip.duration.toFixed(3)}s | {generatedClip.sampleRate} Hz | Ready
                  </p>
                </div>
              </div>

              {/* Pad Assignment */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <Disc className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Pad:</span>
                  <select
                    value={targetPadIndex}
                    onChange={(e) => setTargetPadIndex(parseInt(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono"
                  >
                    {pads.map((pad, idx) => (
                      <option key={pad.id} value={idx}>
                        {pad.bankId}{pad.id + 1} - {pad.clip ? pad.clip.name : '(Empty)'}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  id="save-to-pad-btn"
                  onClick={handleAssign}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save to Pad
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
