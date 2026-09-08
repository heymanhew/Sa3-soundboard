import React, { useState } from 'react';
import { Folder, Upload, Search, Play, Square, Plus, Trash2, Tag, Disc, X } from 'lucide-react';
import { SoundClip } from '../types';
import { decodeAudioBlob, playClip } from '../utils/audioEngine';

interface ClipLibraryDrawerProps {
  library: SoundClip[];
  onSelectClipToPad: (clip: SoundClip) => void;
  onAddClipToLibrary: (clip: SoundClip) => void;
  onDeleteClipFromLibrary: (id: string) => void;
  onClose: () => void;
}

export const ClipLibraryDrawer: React.FC<ClipLibraryDrawerProps> = ({
  library,
  onSelectClipToPad,
  onAddClipToLibrary,
  onDeleteClipFromLibrary,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const activeVoiceRef = React.useRef<{ stop: () => void } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const filteredClips = library.filter((clip) => {
    const matchesSearch = clip.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'all' || clip.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleAudition = (clip: SoundClip) => {
    if (playingClipId === clip.id) {
      if (activeVoiceRef.current) {
        activeVoiceRef.current.stop();
        activeVoiceRef.current = null;
      }
      setPlayingClipId(null);
    } else {
      if (activeVoiceRef.current) {
        activeVoiceRef.current.stop();
      }
      const voice = playClip(clip, {
        onEnded: () => setPlayingClipId(null),
      });
      activeVoiceRef.current = voice;
      setPlayingClipId(clip.id);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const audioBuffer = await decodeAudioBlob(file);
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        const newClip: SoundClip = {
          id: `lib-${Date.now()}-${i}`,
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
        onAddClipToLibrary(newClip);
      } catch (err) {
        console.error('Error importing file:', err);
      }
    }
  };

  return (
    <div
      id="clip-library-drawer"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Folder className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Sound Clip Library</h3>
            <p className="text-[11px] text-slate-400">{library.length} clips available</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Upload & Search Toolbar */}
      <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-950/40">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search audio clips..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Upload drop button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          multiple
          accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition border border-slate-700"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          Import Audio Files (.wav, .mp3)
        </button>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1 pt-1">
          {['all', 'sci-fi', 'retro', 'impact', 'ui', 'foley', 'cinematic', 'custom'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono capitalize transition ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Clip List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredClips.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            <Disc className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No sound clips found. Import files or generate new SFX.
          </div>
        ) : (
          filteredClips.map((clip) => {
            const isPlaying = playingClipId === clip.id;
            return (
              <div
                key={clip.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', JSON.stringify(clip.id));
                }}
                className="group p-3 rounded-xl bg-slate-950/70 hover:bg-slate-800/50 border border-slate-800/80 flex items-center justify-between gap-3 transition cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => handleAudition(clip)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition flex-shrink-0 ${
                      isPlaying
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-blue-500 hover:text-white text-slate-300'
                    }`}
                  >
                    {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                  </button>

                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-white truncate">{clip.name}</h5>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                      <span>{clip.duration.toFixed(2)}s</span>
                      <span>•</span>
                      <span>{(clip.sampleRate / 1000).toFixed(1)}kHz</span>
                      <span>•</span>
                      <span className="capitalize text-slate-500">{clip.category}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition">
                  <button
                    title="Assign to Active Pad"
                    onClick={() => onSelectClipToPad(clip)}
                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title="Delete Clip"
                    onClick={() => onDeleteClipFromLibrary(clip.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-950 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 text-center font-mono">
        Drag any clip directly onto a sound pad
      </div>
    </div>
  );
};
