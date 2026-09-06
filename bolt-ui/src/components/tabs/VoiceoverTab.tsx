import { useState, useEffect, useRef } from 'react';
import {
  Mic, Volume2, Download, Loader2, Play, Pause, RotateCcw, Sparkles,
} from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import { StatusBadge } from '@/components/StatusBadge';
import type { StatusResponse } from '@/lib/types';

// ── Voice Types ────────────────────────────────────────────────────
interface Voice {
  id: string;
  label: string;
  gender: string;
  style: string;
}

const DEFAULT_VOICES: Voice[] = [
  // Thick masculine (TikTok-style)
  { id: 'en-US-GuyNeural', label: 'Guy — Deep & Authoritative', gender: 'male', style: 'thick' },
  { id: 'en-US-ChristopherNeural', label: 'Christopher — Rich & Deep', gender: 'male', style: 'thick' },
  { id: 'en-US-EricNeural', label: 'Eric — Bold & Commanding', gender: 'male', style: 'thick' },
  { id: 'en-GB-RyanNeural', label: 'Ryan — British Deep', gender: 'male', style: 'thick' },
  { id: 'en-US-DavisNeural', label: 'Davis — Smooth Deep', gender: 'male', style: 'thick' },
  { id: 'en-AU-WilliamNeural', label: 'William — Australian Deep', gender: 'male', style: 'thick' },
  // Masculine
  { id: 'en-US-AndrewNeural', label: 'Andrew — Warm Male', gender: 'male', style: 'warm' },
  { id: 'en-US-BrianNeural', label: 'Brian — Friendly Male', gender: 'male', style: 'friendly' },
  { id: 'en-US-JasonNeural', label: 'Jason — Casual Male', gender: 'male', style: 'casual' },
  // Feminine
  { id: 'en-US-JennyNeural', label: 'Jenny — Natural Female', gender: 'female', style: 'natural' },
  { id: 'en-US-AriaNeural', label: 'Aria — Expressive Female', gender: 'female', style: 'expressive' },
  { id: 'en-US-SaraNeural', label: 'Sara — Sweet Female', gender: 'female', style: 'sweet' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia — British Female', gender: 'female', style: 'elegant' },
  // Neutral
  { id: 'en-US-AmberNeural', label: 'Amber — Neutral Warm', gender: 'neutral', style: 'warm' },
  { id: 'en-US-AvaNeural', label: 'Ava — Neutral Soft', gender: 'neutral', style: 'soft' },
];

const PRESET_SCRIPTS = [
  { label: '🎬 Movie Trailer', text: 'In a world where everything you know is about to change... one hero rises. This summer, witness the most epic adventure of a lifetime.' },
  { label: '📱 TikTok Intro', text: 'Hey, listen up! You are NOT going to believe what I just found. This changes everything about how we think about content creation.' },
  { label: '📢 Ad Voiceover', text: 'Introducing the future of creative tools. Generate stunning images, cinematic videos, and professional scripts — all powered by AI. Start creating today.' },
  { label: '🎓 Tutorial', text: 'Welcome back to another tutorial. Today we are going to break down exactly how to create professional video content using nothing but AI tools.' },
  { label: '🔊 Product Review', text: 'Alright, so I have been testing this for about two weeks now and honestly? I am genuinely impressed. Let me show you exactly what makes it special.' },
  { label: '⚡ Motivational', text: 'Every single day you have a choice. You can stay exactly where you are, or you can take one step forward. Just one step. That is all it takes to start.' },
];

const STYLE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'thick', label: '🔥 Thick Masculine' },
  { id: 'male', label: '👨 Male' },
  { id: 'female', label: '👩 Female' },
  { id: 'neutral', label: '🧑 Neutral' },
];

interface VoiceoverTabProps {
  onRecordUsage: (action: string, model: string, status: string) => void;
}

export function VoiceoverTab({ onRecordUsage }: VoiceoverTabProps) {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('en-US-GuyNeural');
  const [rate, setRate] = useState('+0%');
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Type text and pick a voice to generate a voiceover.' });
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState('thick');
  const audioRef = useRef<HTMLAudioElement>(null);

  const filteredVoices = DEFAULT_VOICES.filter(v =>
    filter === 'all' ? true : v.style === filter || v.gender === filter
  );

  // ── Generate voiceover ──────────────────────────────────────────
  async function generateVoiceover() {
    if (!text.trim()) {
      setStatus({ type: 'err', message: 'Enter some text first.' });
      return;
    }
    setLoading(true);
    setAudioUrl(null);
    setStatus({ type: 'loading', message: `Generating voiceover with ${voice}...` });
    try {
      const resp = await fetch('/api/tts/voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice, rate }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'TTS failed' }));
        throw new Error(errData.detail || `TTS failed: ${resp.status}`);
      }
      const data = await resp.json();
      if (!data.audio_url) throw new Error('No audio URL returned');
      setAudioUrl(data.audio_url);
      setStatus({ type: 'ok', message: `Voiceover ready! ${data.file_size ? `(${Math.round(data.file_size / 1024)}KB)` : ''}` });
      onRecordUsage('voiceover', voice, 'ok');
    } catch (err) {
      setStatus({ type: 'err', message: err instanceof Error ? err.message : 'Voiceover generation failed' });
      onRecordUsage('voiceover', voice, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Audio playback ──────────────────────────────────────────────
  function togglePlay() {
    if (!audioRef.current || !audioUrl) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnd = () => setPlaying(false);
    audio.addEventListener('ended', onEnd);
    return () => audio.removeEventListener('ended', onEnd);
  }, [audioUrl]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1400px] mx-auto">
      {/* ── Controls Panel ──────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-rose-500/15">
            <Mic size={16} className="text-rose-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">AI Voiceover</h2>
          <span className="ml-auto text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">FREE</span>
        </div>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
          Generate TikTok-style voiceovers using Microsoft Edge TTS — free, no API key, natural-sounding AI voices.
        </p>

        {/* Text Input */}
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Script Text</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type your voiceover script here... or pick a preset below."
          className="input-field min-h-[120px] resize-y leading-relaxed"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-600">{text.length} / 5000 characters</span>
          {text.length > 0 && (
            <button onClick={() => setText('')} className="text-[10px] text-gray-600 hover:text-rose-400 transition-colors">Clear</button>
          )}
        </div>

        {/* Preset Scripts */}
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Quick Presets</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_SCRIPTS.map((preset, i) => (
            <button
              key={i}
              onClick={() => setText(preset.text)}
              className="px-2.5 py-1 rounded-full bg-[#0a0a12] border border-white/[0.06] text-[10px] text-gray-500 hover:border-rose-500/40 hover:text-gray-300 transition-all"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Voice Filter */}
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Voice Type</label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {STYLE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all border ${
                filter === f.id
                  ? 'bg-rose-500/10 border-rose-400 text-white'
                  : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Voice Selection */}
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Select Voice
        </label>
        <div className="grid grid-cols-1 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
          {filteredVoices.map(v => (
            <button
              key={v.id}
              onClick={() => setVoice(v.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[11px] font-semibold transition-all border text-left ${
                voice === v.id
                  ? 'bg-rose-500/10 border-rose-400 text-white'
                  : 'bg-[#0a0a12] border-white/[0.06] text-gray-400 hover:border-white/[0.12]'
              }`}
            >
              <Volume2 size={14} className={voice === v.id ? 'text-rose-400' : 'text-gray-600'} />
              <span className="flex-1">{v.label}</span>
              {v.style === 'thick' && <span className="text-[9px] text-rose-400 font-bold">TIKTOK</span>}
            </button>
          ))}
        </div>

        {/* Speed Control */}
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">
          Speed: <span className="text-rose-400">{rate === '+0%' ? 'Normal' : rate}</span>
        </label>
        <div className="flex gap-2">
          {['-25%', '-10%', '+0%', '+10%', '+25%'].map(r => (
            <button
              key={r}
              onClick={() => setRate(r)}
              className={`flex-1 px-2 py-1.5 rounded-[6px] text-[10px] font-bold transition-all border ${
                rate === r
                  ? 'bg-rose-500/10 border-rose-400 text-white'
                  : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
              }`}
            >
              {r === '+0%' ? '1x' : r}
            </button>
          ))}
        </div>

        {/* Generate Button */}
        <button
          onClick={generateVoiceover}
          disabled={loading || !text.trim()}
          className="btn-primary w-full mt-4 py-3 rounded-[10px] text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {loading ? <Spinner size={16} /> : <Mic size={15} />}
          {loading ? 'Generating...' : 'Generate Voiceover'}
        </button>
      </div>

      {/* ── Preview Panel ────────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-emerald-500/15">
            <Volume2 size={16} className="text-emerald-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Preview</h2>
          {audioUrl && <span className="ml-auto text-[10px] text-gray-500 uppercase tracking-wider">🔊 Audio</span>}
        </div>

        <div className="bg-black rounded-2xl min-h-[300px] flex flex-col items-center justify-center overflow-hidden relative border border-white/[0.06] p-8">
          {audioUrl ? (
            <div className="text-center w-full">
              <audio ref={audioRef} src={audioUrl} />
              <div className="mb-6">
                <div className="w-24 h-24 mx-auto rounded-full bg-rose-500/15 border-2 border-rose-400/30 grid place-items-center mb-4">
                  <Volume2 size={36} className="text-rose-400" />
                </div>
                <p className="text-sm font-medium text-white mb-1">Voiceover Ready</p>
                <p className="text-[10px] text-gray-500">
                  {DEFAULT_VOICES.find(v => v.id === voice)?.label || voice}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors grid place-items-center"
                >
                  {playing ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white ml-0.5" />}
                </button>
              </div>
              {playing && (
                <div className="mt-4 flex items-center justify-center gap-1">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-rose-400 rounded-full animate-pulse"
                      style={{
                        height: `${12 + Math.random() * 24}px`,
                        animationDelay: `${i * 0.05}s`,
                        animationDuration: `${0.4 + Math.random() * 0.3}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-600 text-[13px] px-10 leading-relaxed">
              <Mic size={40} className="mx-auto mb-3 opacity-40" />
              Your voiceover appears here
              <span className="block text-[11px] opacity-60 mt-1">
                Free AI voices — no signup, no API key
              </span>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/50 grid place-items-center">
              <div className="text-center">
                <Spinner size={32} />
                <p className="text-xs text-gray-400 mt-2">Generating voiceover...</p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap mt-3">
          {audioUrl && (
            <a
              href={audioUrl}
              download={`aeo-voiceover-${Date.now()}.mp3`}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-xs font-semibold"
            >
              <Download size={14} /> Download MP3
            </a>
          )}
          {audioUrl && (
            <button
              onClick={generateVoiceover}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-xs text-cyan-300 hover:bg-cyan-500/30 hover:text-white transition-all font-semibold"
            >
              <RotateCcw size={13} /> Regenerate
            </button>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 p-3 bg-[#0a0a12] border-l-2 border-rose-400 rounded-r-md">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            <strong className="text-rose-400 flex items-center gap-1.5"><Sparkles size={12} /> Free AI Voices</strong>
            <span className="block mt-1">Powered by Microsoft Edge TTS — completely free, no API key needed. Thick masculine voices like Guy, Christopher, and Eric are great for TikTok and Reels voiceovers.</span>
          </p>
        </div>

        <StatusBadge status={status} />
      </div>
    </div>
  );
}
