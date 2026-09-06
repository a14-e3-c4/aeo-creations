import { useState, useEffect, useRef } from 'react';
import {
  Mic, Volume2, Download, Play, Pause, RotateCcw, Sparkles,
  Zap, Gauge, ChevronDown, ChevronUp,
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
  desc: string;
}

const DEFAULT_VOICES: Voice[] = [
  // ── Thick Masculine (TikTok/Reels power voices) ──
  { id: 'en-US-GuyNeural', label: 'Guy', gender: 'male', style: 'thick', desc: '🔥 THE TikTok narrator — deep, authoritative' },
  { id: 'en-US-ChristopherNeural', label: 'Christopher', gender: 'male', style: 'thick', desc: '🎬 Movie trailer energy — rich & booming' },
  { id: 'en-US-EricNeural', label: 'Eric', gender: 'male', style: 'thick', desc: '📢 Bold & commanding — viral video narrator' },
  { id: 'en-GB-RyanNeural', label: 'Ryan', gender: 'male', style: 'thick', desc: '🇬🇧 British deep — sophisticated & powerful' },
  { id: 'en-US-DavisNeural', label: 'Davis', gender: 'male', style: 'thick', desc: '🎙️ Smooth deep — podcast host vibes' },
  { id: 'en-AU-WilliamNeural', label: 'William', gender: 'male', style: 'thick', desc: '🦘 Australian deep — unique & bold' },
  { id: 'en-US-BrandonNeural', label: 'Brandon', gender: 'male', style: 'thick', desc: '💪 Strong & assertive — motivational speaker' },
  { id: 'en-IE-ConnorNeural', label: 'Connor', gender: 'male', style: 'thick', desc: '🍀 Irish deep — warm & captivating' },
  { id: 'en-IN-PrabhatNeural', label: 'Prabhat', gender: 'male', style: 'thick', desc: '🇮🇳 Indian English — deep & resonant' },
  { id: 'en-GB-OllieNeural', label: 'Ollie', gender: 'male', style: 'thick', desc: '🎭 British young deep — trendy narrator' },

  // ── Masculine (Warm/Casual) ──
  { id: 'en-US-AndrewNeural', label: 'Andrew', gender: 'male', style: 'warm', desc: 'Warm & friendly male voice' },
  { id: 'en-US-BrianNeural', label: 'Brian', gender: 'male', style: 'friendly', desc: 'Friendly conversational male' },
  { id: 'en-US-JasonNeural', label: 'Jason', gender: 'male', style: 'casual', desc: 'Casual, relaxed male voice' },
  { id: 'en-US-TonyNeural', label: 'Tony', gender: 'male', style: 'casual', desc: 'Young casual male' },
  { id: 'en-US-AidenNeural', label: 'Aiden', gender: 'male', style: 'warm', desc: 'Warm young male voice' },

  // ── Feminine ──
  { id: 'en-US-JennyNeural', label: 'Jenny', gender: 'female', style: 'natural', desc: 'Natural, versatile female voice' },
  { id: 'en-US-AriaNeural', label: 'Aria', gender: 'female', style: 'expressive', desc: 'Expressive & dynamic female' },
  { id: 'en-US-SaraNeural', label: 'Sara', gender: 'female', style: 'sweet', desc: 'Sweet & warm female voice' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia', gender: 'female', style: 'elegant', desc: 'Elegant British female' },
  { id: 'en-US-AnaNeural', label: 'Ana', gender: 'female', style: 'expressive', desc: 'Young expressive female' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha', gender: 'female', style: 'natural', desc: 'Australian female' },

  // ── Neutral ──
  { id: 'en-US-AmberNeural', label: 'Amber', gender: 'neutral', style: 'warm', desc: 'Neutral warm voice' },
  { id: 'en-US-AvaNeural', label: 'Ava', gender: 'neutral', style: 'soft', desc: 'Soft, gentle voice' },
];

const PRESET_SCRIPTS = [
  { label: '🎬 Movie Trailer', text: 'In a world where everything you know is about to change... one hero rises. This summer, witness the most epic adventure of a lifetime. Get ready for the ride of your life.' },
  { label: '📱 TikTok Intro', text: 'Hey, listen up! You are NOT going to believe what I just found. This changes everything about how we think about content creation. Stick around because this is HUGE.' },
  { label: '📢 Ad Voiceover', text: 'Introducing the future of creative tools. Generate stunning images, cinematic videos, and professional scripts — all powered by AI. Start creating today and watch your content game level up.' },
  { label: '🎓 Tutorial', text: 'Welcome back to another tutorial. Today we are going to break down exactly how to create professional video content using nothing but AI tools. Follow along step by step.' },
  { label: '🔊 Product Review', text: 'Alright, so I have been testing this for about two weeks now and honestly? I am genuinely impressed. Let me show you exactly what makes it special and why you need this in your life.' },
  { label: '⚡ Motivational', text: 'Every single day you have a choice. You can stay exactly where you are, or you can take one step forward. Just one step. That is all it takes to start changing your life forever.' },
  { label: '😱 Story Time', text: 'Okay so this is the craziest thing that has ever happened to me. I was just walking down the street minding my own business when suddenly... everything changed. Let me explain.' },
  { label: '🏋️ Fitness', text: 'Stop scrolling and listen. If you want to transform your body in 30 days, you need to hear this. I am going to give you the exact blueprint that changed thousands of lives.' },
  { label: '💰 Money Talk', text: 'Here is how people are making $10,000 a month from their phone. No experience, no degree, no startup capital. Just this one strategy that nobody is talking about.' },
  { label: '🌍 Travel', text: 'Pack your bags because we are going somewhere incredible. This destination is going to blow your mind and the best part? It costs less than you think.' },
];

const STYLE_FILTERS = [
  { id: 'all', label: 'All Voices' },
  { id: 'thick', label: '🔥 Thick Masculine' },
  { id: 'male', label: '👨 Male' },
  { id: 'female', label: '👩 Female' },
  { id: 'neutral', label: '🧑 Neutral' },
];

const PITCH_OPTIONS = [
  { value: '-50%', label: 'Very Low' },
  { value: '-25%', label: 'Low' },
  { value: '+0%', label: 'Normal' },
  { value: '+25%', label: 'High' },
  { value: '+50%', label: 'Very High' },
];

const RATE_OPTIONS = [
  { value: '-30%', label: '0.7x Slow' },
  { value: '-15%', label: '0.85x' },
  { value: '+0%', label: '1x Normal' },
  { value: '+15%', label: '1.15x' },
  { value: '+30%', label: '1.3x Fast' },
];

interface VoiceoverTabProps {
  onRecordUsage: (action: string, model: string, status: string) => void;
}

export function VoiceoverTab({ onRecordUsage }: VoiceoverTabProps) {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('en-US-GuyNeural');
  const [rate, setRate] = useState('+0%');
  const [pitch, setPitch] = useState('+0%');
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Type text and pick a voice to generate a voiceover.' });
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState('thick');
  const [showAllVoices, setShowAllVoices] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const filteredVoices = DEFAULT_VOICES.filter(v =>
    filter === 'all' ? true : v.style === filter || v.gender === filter
  );

  const visibleVoices = showAllVoices ? filteredVoices : filteredVoices.slice(0, 10);

  // ── Generate voiceover ──────────────────────────────────────────
  async function generateVoiceover() {
    if (!text.trim()) {
      setStatus({ type: 'err', message: 'Enter some text first.' });
      return;
    }
    setLoading(true);
    setAudioUrl(null);
    setPlaying(false);
    setStatus({ type: 'loading', message: `Generating voiceover with ${voice}...` });
    try {
      const resp = await fetch('/api/tts/voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice, rate, pitch }),
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

  const selectedVoiceInfo = DEFAULT_VOICES.find(v => v.id === voice);

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
          Generate TikTok-style voiceovers with thick masculine voices — free, no API key, powered by Edge TTS.
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
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">
          <Zap size={11} className="inline mr-1" /> Voice Type
        </label>
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
          Select Voice ({filteredVoices.length} available)
        </label>
        <div className="grid grid-cols-1 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
          {visibleVoices.map(v => (
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
              <div className="flex-1 min-w-0">
                <span className="block">{v.label}</span>
                <span className="block text-[9px] text-gray-600 truncate">{v.desc}</span>
              </div>
              {v.style === 'thick' && <span className="text-[9px] text-rose-400 font-bold shrink-0">🔥 TIKTOK</span>}
            </button>
          ))}
        </div>
        {filteredVoices.length > 10 && (
          <button
            onClick={() => setShowAllVoices(!showAllVoices)}
            className="mt-2 flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            {showAllVoices ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {showAllVoices ? 'Show less' : `Show all ${filteredVoices.length} voices`}
          </button>
        )}

        {/* Current Voice Info */}
        {selectedVoiceInfo && (
          <div className="mt-3 p-2 bg-rose-500/5 border border-rose-500/15 rounded-lg flex items-center gap-2">
            <span className="text-sm">🎙️</span>
            <div>
              <span className="text-[11px] text-white font-semibold">{selectedVoiceInfo.label}</span>
              <span className="text-[10px] text-gray-500 ml-2">{selectedVoiceInfo.desc}</span>
            </div>
          </div>
        )}

        {/* Speed + Pitch Controls */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Gauge size={11} /> Speed: <span className="text-rose-400">{rate === '+0%' ? '1x' : rate}</span>
            </label>
            <div className="flex gap-1.5">
              {RATE_OPTIONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRate(r.value)}
                  className={`flex-1 px-1.5 py-1.5 rounded-[6px] text-[10px] font-bold transition-all border ${
                    rate === r.value
                      ? 'bg-rose-500/10 border-rose-400 text-white'
                      : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Pitch: <span className="text-rose-400">{pitch === '+0%' ? 'Normal' : pitch}</span>
            </label>
            <div className="flex gap-1.5">
              {PITCH_OPTIONS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPitch(p.value)}
                  className={`flex-1 px-1.5 py-1.5 rounded-[6px] text-[10px] font-bold transition-all border ${
                    pitch === p.value
                      ? 'bg-rose-500/10 border-rose-400 text-white'
                      : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
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
                  {selectedVoiceInfo?.label || voice} · {selectedVoiceInfo?.desc}
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
                  {[...Array(24)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-rose-400 rounded-full animate-pulse"
                      style={{
                        height: `${12 + Math.random() * 28}px`,
                        animationDelay: `${i * 0.04}s`,
                        animationDuration: `${0.3 + Math.random() * 0.4}s`,
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
            <strong className="text-rose-400 flex items-center gap-1.5"><Sparkles size={12} /> Free TikTok-Style Voices</strong>
            <span className="block mt-1">
              Powered by Microsoft Edge TTS — completely free, no API key needed. Thick masculine voices like <strong className="text-white">Guy</strong>, <strong className="text-white">Christopher</strong>, and <strong className="text-white">Eric</strong> are perfect for TikTok Reels, YouTube Shorts, and podcast intros. Adjust speed and pitch for the exact tone you need.
            </span>
          </p>
        </div>

        <StatusBadge status={status} />
      </div>
    </div>
  );
}
