import { useState, useRef, useCallback, useEffect } from 'react';
import {
  User, Sparkles, Download, RefreshCw, Wand2, Dice3,
  ChevronDown, ChevronUp, Shirt, Eye, Palette, Image as ImageIcon,
  Mic, Play, Pause, Volume2, Zap, Video, WandSparkles,
  Heart, SmilePlus, ScanFace, Skull, Crown, Flame,
} from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import { StatusBadge } from '@/components/StatusBadge';
import type { Generation, StatusResponse } from '@/lib/types';

// ── Pollinations AI: Free, no API key ──────────────────────────────
function pollinationsAvatarUrl(prompt: string, size = 512): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${size}&height=${size}&nologo=true&seed=${Date.now()}`;
}

// ── DiceBear: Free, no API key ─────────────────────────────────────
type DiceBearStyle =
  | 'adventurer' | 'avataaars' | 'big-ears' | 'bottts'
  | 'fun-emoji' | 'lorelei' | 'micah' | 'notionists'
  | 'open-peeps' | 'personas' | 'pixel-art' | 'rings'
  | 'shapes' | 'thumbs';

const DICEBEAR_STYLES: { id: DiceBearStyle; label: string; icon: string }[] = [
  { id: 'avataaars', label: 'Avataaars', icon: '🧑' },
  { id: 'adventurer', label: 'Adventurer', icon: '⚔️' },
  { id: 'big-ears', label: 'Big Ears', icon: '🐘' },
  { id: 'fun-emoji', label: 'Fun Emoji', icon: '😄' },
  { id: 'lorelei', label: 'Lorelei', icon: '👩' },
  { id: 'micah', label: 'Micah', icon: '🎨' },
  { id: 'notionists', label: 'Notionists', icon: '📝' },
  { id: 'open-peeps', label: 'Open Peeps', icon: '👥' },
  { id: 'personas', label: 'Personas', icon: '🎭' },
  { id: 'pixel-art', label: 'Pixel Art', icon: '👾' },
  { id: 'bottts', label: 'Bottts', icon: '🤖' },
  { id: 'rings', label: 'Rings', icon: '💍' },
  { id: 'shapes', label: 'Shapes', icon: '🔷' },
  { id: 'thumbs', label: 'Thumbs', icon: '👍' },
];

function diceBearUrl(style: DiceBearStyle, seed: string): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=512`;
}

// ── AI Avatar Styles ───────────────────────────────────────────────
const AVATAR_STYLES = [
  { id: 'photorealistic', label: 'Photoreal', icon: '📷', hint: 'Ultra-realistic portrait, studio lighting, sharp details' },
  { id: 'anime', label: 'Anime', icon: '🎨', hint: 'Japanese anime style, vibrant eyes, detailed features' },
  { id: 'cartoon', label: 'Cartoon', icon: '✏️', hint: 'Bold outlines, bright colors, Disney/Pixar style' },
  { id: '3d-render', label: '3D Render', icon: '🧊', hint: 'Pixar-quality 3D render, soft lighting' },
  { id: 'oil-painting', label: 'Oil Paint', icon: '🖼️', hint: 'Classical oil painting, Renaissance brushstrokes' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: '🤖', hint: 'Neon glow, futuristic, holographic elements' },
  { id: 'fantasy', label: 'Fantasy', icon: '🧙', hint: 'Magical, ethereal glow, enchanted atmosphere' },
  { id: 'ghoul', label: 'Ghoul', icon: '💀', hint: 'Dark, supernatural, dramatic lighting' },
];

const EXPRESSIONS = [
  { id: 'smiling', label: '😊 Smiling' },
  { id: 'serious', label: '😐 Serious' },
  { id: 'laughing', label: '😂 Laughing' },
  { id: 'thoughtful', label: '🤔 Thoughtful' },
  { id: 'confident', label: '😎 Confident' },
  { id: 'mysterious', label: '🔮 Mysterious' },
  { id: 'angry', label: '😡 Angry' },
  { id: 'surprised', label: '😲 Surprised' },
];

const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'non-binary', label: 'Non-binary' },
];

const BACKGROUNDS = [
  { id: 'studio', label: '🏠 Studio' },
  { id: 'nature', label: '🌿 Nature' },
  { id: 'city', label: '🏙️ City' },
  { id: 'space', label: '🌌 Space' },
  { id: 'gradient', label: '🎨 Gradient' },
  { id: 'dramatic', label: '🎭 Dramatic' },
  { id: 'neon', label: '💎 Neon' },
];

const QUICK_PRESETS = [
  { label: '🧑‍💼 Professional', prompt: 'professional business portrait, suit, confident, studio lighting' },
  { label: '🧙 Fantasy Hero', prompt: 'fantasy warrior character, ornate armor, epic golden lighting' },
  { label: '🤖 Cyberpunk', prompt: 'cyberpunk android, neon glow, futuristic, holographic elements' },
  { label: '🌸 Anime Star', prompt: 'anime protagonist, determined expression, vibrant colors, detailed eyes' },
  { label: '🎮 Pixel Gamer', prompt: 'pixel art gamer character, retro 16-bit, colorful' },
  { label: '👑 Royal Portrait', prompt: 'royal king or queen portrait, golden crown, majestic, oil painting style' },
  { label: '🧛 Dark Vampire', prompt: 'dark gothic vampire portrait, red eyes, dramatic lighting' },
  { label: '🧚 Forest Elf', prompt: 'ethereal forest elf, pointed ears, magical glow, nature background' },
  { label: '🔥 TikTok Star', prompt: 'young content creator, ring light reflection in eyes, confident smile, modern' },
  { label: '🎮 Gamer', prompt: 'gaming streamer with headset, RGB lighting, neon background' },
  { label: '🎬 Director', prompt: 'film director portrait, beret, intense gaze, dramatic shadows' },
  { label: '🎸 Rock Star', prompt: 'rock musician portrait, leather jacket, smoky atmosphere, moody lighting' },
];

// ── TikTok Voice Presets ──────────────────────────────────────────
const TIKTOK_VOICES = [
  { id: 'en-US-GuyNeural', label: 'Guy — Deep & Authoritative', desc: 'Most popular TikTok narrator voice', icon: '🔥' },
  { id: 'en-US-ChristopherNeural', label: 'Christopher — Rich Deep', desc: 'Movie trailer energy', icon: '🎬' },
  { id: 'en-US-EricNeural', label: 'Eric — Bold & Commanding', desc: 'Authoritative narrator', icon: '📢' },
  { id: 'en-GB-RyanNeural', label: 'Ryan — British Deep', desc: 'Sophisticated British accent', icon: '🇬🇧' },
  { id: 'en-US-DavisNeural', label: 'Davis — Smooth Deep', desc: 'Smooth podcast host', icon: '🎙️' },
  { id: 'en-AU-WilliamNeural', label: 'William — Australian Deep', desc: 'Aussie narrator', icon: '🦘' },
];

// ── Talking avatar animation frames (CSS keyframe simulation) ─────
const LIP_SYNC_FRAMES = [
  'M 45 70 Q 50 65 55 70',  // closed
  'M 43 68 Q 50 60 57 68',  // open small
  'M 41 66 Q 50 55 59 66',  // open medium
  'M 39 64 Q 50 50 61 64',  // open wide
  'M 43 68 Q 50 58 57 68',  // open small
  'M 45 70 Q 50 65 55 70',  // closed
];

interface AvatarTabProps {
  onRecordUsage: (action: string, model: string, status: string) => void;
  onSaveGeneration: (gen: Partial<Generation>) => Promise<Generation | null>;
}

export function AvatarTab({ onRecordUsage, onSaveGeneration }: AvatarTabProps) {
  const [mode, setMode] = useState<'ai' | 'dicebear' | 'talking'>('ai');

  // AI mode
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('photorealistic');
  const [expression, setExpression] = useState('smiling');
  const [gender, setGender] = useState('female');
  const [background, setBackground] = useState('studio');

  // DiceBear mode
  const [dicebearStyle, setDicebearStyle] = useState<DiceBearStyle>('avataaars');
  const [seed, setSeed] = useState('aeo-user');
  const [showAllStyles, setShowAllStyles] = useState(false);

  // Talking avatar mode
  const [talkText, setTalkText] = useState('');
  const [talkVoice, setTalkVoice] = useState('en-US-GuyNeural');
  const [isTalking, setIsTalking] = useState(false);
  const [talkAudioUrl, setTalkAudioUrl] = useState<string | null>(null);
  const talkAudioRef = useRef<HTMLAudioElement>(null);
  const [lipSyncFrame, setLipSyncFrame] = useState(0);
  const lipSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shared
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Pick a style and generate — completely free.' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<{ url: string; label: string }[]>([]);
  const dicebearInputRef = useRef<HTMLInputElement>(null);

  // Cleanup lip sync timer
  useEffect(() => {
    return () => {
      if (lipSyncTimerRef.current) clearInterval(lipSyncTimerRef.current);
    };
  }, []);

  // ── Build prompt ──────────────────────────────────────────────────
  function buildAvatarPrompt() {
    const styleHint = AVATAR_STYLES.find(s => s.id === style)?.hint ?? '';
    const bgHint = background === 'studio' ? 'studio portrait background'
      : background === 'nature' ? 'natural outdoor background'
      : background === 'city' ? 'urban cityscape background'
      : background === 'space' ? 'cosmic space background'
      : background === 'dramatic' ? 'dramatic dark background with rim lighting'
      : background === 'neon' ? 'neon lit background, cyberpunk atmosphere'
      : 'smooth gradient background';

    return [
      `${gender} character portrait`,
      styleHint,
      `${expression} expression`,
      bgHint,
      'headshot, centered face, high detail, masterpiece, sharp focus',
      prompt.trim(),
    ].filter(Boolean).join(', ');
  }

  // ── Generate AI Avatar (try server first, fallback to client-side) ──
  async function generateAIAvatar() {
    setLoading(true);
    setResult(null);
    setStatus({ type: 'loading', message: 'Drawing your avatar with AI...' });
    try {
      // Try backend proxy first (avoids CORS)
      const resp = await fetch('/api/avatar/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildAvatarPrompt(), width: 512, height: 512 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.image) {
          const dataUrl = `data:image/png;base64,${data.image}`;
          setResult(dataUrl);
          setHistory(prev => [{ url: dataUrl, label: `AI: ${style}` }, ...prev].slice(0, 12));
          setStatus({ type: 'ok', message: 'Avatar generated! Download or save it.' });
          onRecordUsage('avatar', 'pollinations-ai', 'ok');
          onSaveGeneration({
            type: 'image', prompt: buildAvatarPrompt(), model: 'pollinations-ai',
            style, status: 'completed', thumbnail_url: dataUrl,
          });
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fall through to client-side
    }

    // Client-side fallback: load image directly from Pollinations
    try {
      const url = pollinationsAvatarUrl(buildAvatarPrompt(), 512);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load from Pollinations'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 512;
      canvas.height = img.naturalHeight || 512;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      setResult(dataUrl);
      setHistory(prev => [{ url: dataUrl, label: `AI: ${style}` }, ...prev].slice(0, 12));
      setStatus({ type: 'ok', message: 'Avatar generated! (client-side)' });
      onRecordUsage('avatar', 'pollinations-client', 'ok');
      onSaveGeneration({
        type: 'image', prompt: buildAvatarPrompt(), model: 'pollinations-client',
        style, status: 'completed', thumbnail_url: dataUrl,
      });
    } catch (err) {
      setStatus({ type: 'err', message: err instanceof Error ? err.message : 'Avatar generation failed' });
      onRecordUsage('avatar', 'pollinations', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Generate DiceBear Avatar ─────────────────────────────────────
  async function generateDiceBear() {
    setLoading(true);
    setResult(null);
    setStatus({ type: 'loading', message: 'Crafting your stylized avatar...' });
    try {
      const url = diceBearUrl(dicebearStyle, seed);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load DiceBear avatar'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 512, 512);
      const dataUrl = canvas.toDataURL('image/png');
      setResult(dataUrl);
      setHistory(prev => [{ url: dataUrl, label: `DiceBear: ${dicebearStyle}` }, ...prev].slice(0, 12));
      setStatus({ type: 'ok', message: 'Stylized avatar ready!' });
      onRecordUsage('avatar', `dicebear-${dicebearStyle}`, 'ok');
      onSaveGeneration({
        type: 'image', prompt: `DiceBear ${dicebearStyle}: ${seed}`, model: `dicebear-${dicebearStyle}`,
        status: 'completed', thumbnail_url: dataUrl,
      });
    } catch (err) {
      setStatus({ type: 'err', message: err instanceof Error ? err.message : 'DiceBear generation failed' });
      onRecordUsage('avatar', 'dicebear', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Generate Talking Avatar (image + voiceover + lip sync) ───────
  async function generateTalkingAvatar() {
    if (!result) {
      setStatus({ type: 'err', message: 'Generate an avatar first, then make it talk!' });
      return;
    }
    if (!talkText.trim()) {
      setStatus({ type: 'err', message: 'Enter text for the avatar to say.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'loading', message: 'Generating voiceover for your avatar...' });

    try {
      const resp = await fetch('/api/tts/voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: talkText.trim(), voice: talkVoice, rate: '+0%' }),
      });

      if (!resp.ok) {
        // Fallback: use Web Speech API
        setStatus({ type: 'loading', message: 'Using browser TTS as fallback...' });
        const utterance = new SpeechSynthesisUtterance(talkText.trim());
        utterance.voice = speechSynthesis.getVoices().find(v => v.name.includes('Guy')) || null;
        utterance.rate = 0.9;

        // Start lip sync animation
        startLipSync();
        setIsTalking(true);

        utterance.onend = () => {
          stopLipSync();
          setIsTalking(false);
          setStatus({ type: 'ok', message: 'Talking avatar complete!' });
        };

        speechSynthesis.speak(utterance);
        setLoading(false);
        onRecordUsage('talking-avatar', 'web-speech', 'ok');
        return;
      }

      const data = await resp.json();
      if (data.audio_url) {
        setTalkAudioUrl(data.audio_url);
        setStatus({ type: 'ok', message: 'Voiceover ready! Press play to watch your avatar talk.' });
        onRecordUsage('talking-avatar', 'edge-tts', 'ok');
      }
    } catch {
      // Fallback to Web Speech API
      const utterance = new SpeechSynthesisUtterance(talkText.trim());
      utterance.rate = 0.9;
      startLipSync();
      setIsTalking(true);
      utterance.onend = () => {
        stopLipSync();
        setIsTalking(false);
        setStatus({ type: 'ok', message: 'Talking avatar complete!' });
      };
      speechSynthesis.speak(utterance);
    } finally {
      setLoading(false);
    }
  }

  // ── Lip Sync Animation ──────────────────────────────────────────
  function startLipSync() {
    if (lipSyncTimerRef.current) clearInterval(lipSyncTimerRef.current);
    lipSyncTimerRef.current = setInterval(() => {
      setLipSyncFrame(prev => (prev + 1) % LIP_SYNC_FRAMES.length);
    }, 150);
  }

  function stopLipSync() {
    if (lipSyncTimerRef.current) {
      clearInterval(lipSyncTimerRef.current);
      lipSyncTimerRef.current = null;
    }
    setLipSyncFrame(0);
  }

  function toggleTalking() {
    if (isTalking) {
      speechSynthesis.cancel();
      stopLipSync();
      setIsTalking(false);
    } else {
      generateTalkingAvatar();
    }
  }

  // ── Play talking avatar audio ───────────────────────────────────
  async function playTalking() {
    if (!talkAudioUrl || !talkAudioRef.current) {
      await generateTalkingAvatar();
      return;
    }
    const audio = talkAudioRef.current;
    audio.src = talkAudioUrl;
    startLipSync();
    setIsTalking(true);
    audio.onended = () => {
      stopLipSync();
      setIsTalking(false);
    };
    audio.play();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1400px] mx-auto">
      {/* ── Controls Panel ──────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-purple-500/15">
            <User size={16} className="text-purple-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">AI Avatar Generator</h2>
          <span className="ml-auto text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">FREE</span>
        </div>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
          Generate unique AI avatars with Pollinations AI and DiceBear — or make them talk with voiceover lip-sync.
        </p>

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setMode('ai')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-xs font-semibold transition-all border ${
              mode === 'ai'
                ? 'bg-purple-500/10 border-purple-400 text-white'
                : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
            }`}
          >
            <Sparkles size={14} /> AI Generated
          </button>
          <button
            onClick={() => setMode('dicebear')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-xs font-semibold transition-all border ${
              mode === 'dicebear'
                ? 'bg-purple-500/10 border-purple-400 text-white'
                : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
            }`}
          >
            <Dice3 size={14} /> Stylized
          </button>
          <button
            onClick={() => setMode('talking')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-xs font-semibold transition-all border ${
              mode === 'talking'
                ? 'bg-purple-500/10 border-purple-400 text-white'
                : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
            }`}
          >
            <Video size={14} /> Talking
          </button>
        </div>

        {mode === 'ai' && (
          /* ── AI Generated Mode ──────────────────────────────────────── */
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Description (optional)
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="A young woman with curly hair, wearing a leather jacket..."
                className="input-field min-h-[60px] resize-y leading-relaxed"
              />
            </div>

            {/* Style */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Palette size={11} /> Avatar Style
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {AVATAR_STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    className={`px-2 py-2 rounded-[8px] text-[10px] font-semibold transition-all border text-center ${
                      style === s.id
                        ? 'bg-purple-500/10 border-purple-400 text-white'
                        : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                    }`}
                  >
                    <span className="text-sm block">{s.icon}</span>
                    <span className="block mt-0.5">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Expression */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Eye size={11} /> Expression
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXPRESSIONS.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setExpression(e.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${
                      expression === e.id
                        ? 'bg-purple-500/10 border-purple-400 text-white'
                        : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Character */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Shirt size={11} /> Character
              </label>
              <div className="flex gap-2">
                {GENDERS.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGender(g.id)}
                    className={`flex-1 px-3 py-2 rounded-[8px] text-xs font-semibold transition-all border ${
                      gender === g.id
                        ? 'bg-purple-500/10 border-purple-400 text-white'
                        : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Background */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ImageIcon size={11} /> Background
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BACKGROUNDS.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setBackground(b.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${
                      background === b.id
                        ? 'bg-purple-500/10 border-purple-400 text-white'
                        : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateAIAvatar}
              disabled={loading}
              className="btn-primary w-full py-3 rounded-[10px] text-[13px] font-bold tracking-wide flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size={16} /> : <Sparkles size={15} />}
              {loading ? 'Generating...' : 'Generate AI Avatar'}
            </button>
          </div>
        )}

        {mode === 'dicebear' && (
          /* ── DiceBear Mode ──────────────────────────────────────────── */
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Seed (name or keyword)
              </label>
              <div className="flex gap-2">
                <input
                  ref={dicebearInputRef}
                  type="text"
                  value={seed}
                  onChange={e => setSeed(e.target.value)}
                  placeholder="Enter a name or keyword..."
                  className="input-field flex-1"
                />
                <button
                  onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}
                  className="px-3 py-2 rounded-[8px] bg-surface-3 border border-white/[0.06] text-gray-400 hover:text-white hover:border-purple-500/40 transition-all"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                Same seed + style = same avatar. Change seed for a different character.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Avatar Style
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(showAllStyles ? DICEBEAR_STYLES : DICEBEAR_STYLES.slice(0, 8)).map(s => (
                  <button
                    key={s.id}
                    onClick={() => setDicebearStyle(s.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-[8px] text-[11px] font-semibold transition-all border ${
                      dicebearStyle === s.id
                        ? 'bg-purple-500/10 border-purple-400 text-white'
                        : 'bg-[#0a0a12] border-white/[0.06] text-gray-400 hover:border-white/[0.12]'
                    }`}
                  >
                    <span className="text-sm">{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAllStyles(!showAllStyles)}
                className="mt-2 flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
              >
                {showAllStyles ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showAllStyles ? 'Show less' : `Show all ${DICEBEAR_STYLES.length} styles`}
              </button>
            </div>

            <button
              onClick={generateDiceBear}
              disabled={loading}
              className="btn-primary w-full py-3 rounded-[10px] text-[13px] font-bold tracking-wide flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size={16} /> : <Wand2 size={15} />}
              {loading ? 'Generating...' : 'Generate Stylized Avatar'}
            </button>
          </div>
        )}

        {mode === 'talking' && (
          /* ── Talking Avatar Mode ──────────────────────────────────── */
          <div className="space-y-4">
            {!result ? (
              <div className="text-center py-8 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                <Video size={32} className="mx-auto mb-2 text-purple-400 opacity-50" />
                <p className="text-sm text-gray-400">Generate an avatar first</p>
                <p className="text-[11px] text-gray-600 mt-1">Switch to AI or Stylized mode, generate an avatar, then come back here to make it talk!</p>
              </div>
            ) : (
              <>
                <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl flex items-center gap-3">
                  <img src={result} alt="Avatar" className="w-12 h-12 rounded-lg object-cover" />
                  <div>
                    <p className="text-xs font-semibold text-white">Avatar ready</p>
                    <p className="text-[10px] text-gray-500">Enter text below to make it talk</p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    What should the avatar say?
                  </label>
                  <textarea
                    value={talkText}
                    onChange={e => setTalkText(e.target.value)}
                    placeholder="Hey everyone! Welcome to my channel. Today we're doing something amazing..."
                    className="input-field min-h-[100px] resize-y leading-relaxed"
                  />
                  <span className="text-[10px] text-gray-600 mt-1 block">{talkText.length} / 5000 characters</span>
                </div>

                {/* Voice Selection */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    🎙️ TikTok Voice (Thick Masculine)
                  </label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {TIKTOK_VOICES.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setTalkVoice(v.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[11px] font-semibold transition-all border text-left ${
                          talkVoice === v.id
                            ? 'bg-purple-500/10 border-purple-400 text-white'
                            : 'bg-[#0a0a12] border-white/[0.06] text-gray-400 hover:border-white/[0.12]'
                        }`}
                      >
                        <span className="text-sm">{v.icon}</span>
                        <div className="flex-1">
                          <div>{v.label}</div>
                          <div className="text-[9px] text-gray-600">{v.desc}</div>
                        </div>
                        {talkVoice === v.id && <Zap size={12} className="text-purple-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={isTalking ? toggleTalking : playTalking}
                  disabled={loading || !talkText.trim()}
                  className="btn-primary w-full py-3 rounded-[10px] text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {loading ? <Spinner size={16} /> : isTalking ? <Pause size={15} /> : <Play size={15} />}
                  {loading ? 'Generating...' : isTalking ? 'Stop Talking' : 'Make Avatar Talk'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Quick Presets (AI mode only) */}
        {mode === 'ai' && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Quick Presets</label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setPrompt(preset.prompt);
                    setMode('ai');
                    setTimeout(() => generateAIAvatar(), 50);
                  }}
                  className="px-2.5 py-1 rounded-full bg-[#0a0a12] border border-white/[0.06] text-[10px] text-gray-500 hover:border-purple-500/40 hover:text-gray-300 transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <audio ref={talkAudioRef} />
      </div>

      {/* ── Preview Panel ────────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-emerald-500/15">
            <Eye size={16} className="text-emerald-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Preview</h2>
          {result && <span className="ml-auto text-[10px] text-gray-500 uppercase tracking-wider">🖼 Avatar</span>}
        </div>

        <div className="bg-black rounded-2xl min-h-[300px] max-h-[500px] flex items-center justify-center overflow-hidden relative border border-white/[0.06]">
          {result ? (
            <div className="relative">
              <img
                src={result}
                alt="Generated avatar"
                className={`max-h-[480px] w-full object-contain rounded-lg transition-transform ${
                  isTalking ? 'animate-pulse' : ''
                }`}
              />
              {/* Talking indicator overlay */}
              {isTalking && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 rounded-full px-4 py-2">
                  <div className="flex items-center gap-0.5">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-purple-400 rounded-full animate-pulse"
                        style={{
                          height: `${8 + Math.random() * 16}px`,
                          animationDelay: `${i * 0.08}s`,
                          animationDuration: `${0.3 + Math.random() * 0.3}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-purple-300 font-bold">LIVE</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-600 text-[13px] px-10 py-10 leading-relaxed">
              <User size={40} className="mx-auto mb-3 opacity-40" />
              Your avatar appears here
              <span className="block text-[11px] opacity-60 mt-1">
                {mode === 'talking' ? 'Generate an avatar first, then add voice' : 'AI-generated with Pollinations — free forever'}
              </span>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/50 grid place-items-center">
              <div className="text-center">
                <Spinner size={32} />
                <p className="text-xs text-gray-400 mt-2">
                  {mode === 'talking' ? 'Making your avatar talk...' : mode === 'ai' ? 'Drawing your avatar...' : 'Crafting stylized avatar...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap mt-3">
          {result && (
            <a
              href={result}
              download={`aeo-avatar-${Date.now()}.png`}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-xs font-semibold"
            >
              <Download size={14} /> Download PNG
            </a>
          )}
          {result && (
            <button
              onClick={() => mode === 'ai' ? generateAIAvatar() : mode === 'dicebear' ? generateDiceBear() : generateTalkingAvatar()}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-xs text-cyan-300 hover:bg-cyan-500/30 hover:text-white transition-all font-semibold"
            >
              <RefreshCw size={13} /> Regenerate
            </button>
          )}
          {result && mode !== 'talking' && (
            <button
              onClick={() => setMode('talking')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-purple-500/20 border border-purple-500/40 text-xs text-purple-300 hover:bg-purple-500/30 hover:text-white transition-all font-semibold"
            >
              <Video size={13} /> Make it Talk
            </button>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Recent Avatars</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
              {history.map((item, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-[10px] overflow-hidden border border-white/[0.06] bg-surface-3 cursor-pointer group hover:border-purple-400 transition-all"
                  onClick={() => {
                    setResult(item.url);
                    setStatus({ type: 'ok', message: `Loaded: ${item.label}` });
                  }}
                >
                  <img src={item.url} alt={item.label} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                    <p className="text-[8px] text-white/80 line-clamp-2">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <StatusBadge status={status} />
      </div>
    </div>
  );
}
