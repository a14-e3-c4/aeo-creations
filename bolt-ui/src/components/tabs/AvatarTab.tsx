import { useState, useRef } from 'react';
import {
  User, Sparkles, Download, RefreshCw, Wand2, Dice3,
  ChevronDown, ChevronUp, Shirt, Eye, Palette, Image as ImageIcon,
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
  { id: 'photorealistic', label: 'Photoreal', icon: '📷', hint: 'Ultra-realistic portrait' },
  { id: 'anime', label: 'Anime', icon: '🎨', hint: 'Japanese animation' },
  { id: 'cartoon', label: 'Cartoon', icon: '✏️', hint: 'Bold outlines, bright colors' },
  { id: '3d-render', label: '3D Render', icon: '🧊', hint: 'Pixar-style CGI' },
  { id: 'oil-painting', label: 'Oil Paint', icon: '🖼️', hint: 'Classical brushstrokes' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: '🤖', hint: 'Neon, futuristic' },
  { id: 'fantasy', label: 'Fantasy', icon: '🧙', hint: 'Magical, ethereal' },
  { id: 'pixel-art', label: 'Pixel Art', icon: '👾', hint: 'Retro 16-bit' },
];

const EXPRESSIONS = [
  { id: 'smiling', label: '😊 Smiling' },
  { id: 'serious', label: '😐 Serious' },
  { id: 'laughing', label: '😂 Laughing' },
  { id: 'thoughtful', label: '🤔 Thoughtful' },
  { id: 'confident', label: '😎 Confident' },
  { id: 'mysterious', label: ' mysterious' },
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
];

interface AvatarTabProps {
  onRecordUsage: (action: string, model: string, status: string) => void;
  onSaveGeneration: (gen: Partial<Generation>) => Promise<Generation | null>;
}

export function AvatarTab({ onRecordUsage, onSaveGeneration }: AvatarTabProps) {
  const [mode, setMode] = useState<'ai' | 'dicebear'>('ai');

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

  // Shared
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Pick a style and generate — completely free.' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<{ url: string; label: string }[]>([]);
  const dicebearInputRef = useRef<HTMLInputElement>(null);

  // ── Build prompt ──────────────────────────────────────────────────
  function buildAvatarPrompt() {
    const styleHint = AVATAR_STYLES.find(s => s.id === style)?.hint ?? '';
    const bgHint = background === 'studio' ? 'studio portrait background'
      : background === 'nature' ? 'natural outdoor background'
      : background === 'city' ? 'urban cityscape background'
      : background === 'space' ? 'cosmic space background'
      : 'smooth gradient background';

    return [
      `${gender} character portrait`,
      styleHint,
      `${expression} expression`,
      bgHint,
      'headshot, centered face, high detail, masterpiece',
      prompt.trim(),
    ].filter(Boolean).join(', ');
  }

  // ── Generate AI Avatar ───────────────────────────────────────────
  async function generateAIAvatar() {
    setLoading(true);
    setResult(null);
    setStatus({ type: 'loading', message: 'Drawing your avatar with AI...' });
    try {
      const url = pollinationsAvatarUrl(buildAvatarPrompt(), 512);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to generate avatar'));
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
      setStatus({ type: 'ok', message: 'Avatar generated! Download or save it.' });
      onRecordUsage('avatar', 'pollinations-ai', 'ok');
      onSaveGeneration({
        type: 'image', prompt: buildAvatarPrompt(), model: 'pollinations-ai',
        style, status: 'completed', thumbnail_url: dataUrl,
      });
    } catch (err) {
      setStatus({ type: 'err', message: err instanceof Error ? err.message : 'Avatar generation failed' });
      onRecordUsage('avatar', 'pollinations-ai', 'error');
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
          Generate unique AI avatars using Pollinations AI and DiceBear — no API keys, no signup, completely free.
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
        </div>

        {mode === 'ai' ? (
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
        ) : (
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
                    // Auto-generate
                    setTimeout(() => {
                      const fullPrompt = [
                        `${gender} character portrait`,
                        AVATAR_STYLES.find(s => s.id === style)?.hint ?? '',
                        `${expression} expression`,
                        background === 'studio' ? 'studio portrait background' : 'natural background',
                        'headshot, centered face, high detail, masterpiece',
                        preset.prompt,
                      ].filter(Boolean).join(', ');

                      setLoading(true);
                      setResult(null);
                      setStatus({ type: 'loading', message: `Generating ${preset.label} avatar...` });
                      const url = pollinationsAvatarUrl(fullPrompt, 512);
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || 512;
                        canvas.height = img.naturalHeight || 512;
                        const ctx = canvas.getContext('2d')!;
                        ctx.drawImage(img, 0, 0);
                        const dataUrl = canvas.toDataURL('image/png');
                        setResult(dataUrl);
                        setHistory(prev => [{ url: dataUrl, label: preset.label }, ...prev].slice(0, 12));
                        setLoading(false);
                        setStatus({ type: 'ok', message: `${preset.label} avatar generated!` });
                        onRecordUsage('avatar', 'pollinations-ai', 'ok');
                      };
                      img.onerror = () => {
                        setLoading(false);
                        setStatus({ type: 'err', message: 'Failed to generate preset avatar' });
                      };
                      img.src = url;
                    }, 50);
                  }}
                  className="px-2.5 py-1 rounded-full bg-[#0a0a12] border border-white/[0.06] text-[10px] text-gray-500 hover:border-purple-500/40 hover:text-gray-300 transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
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
            <img
              src={result}
              alt="Generated avatar"
              className="max-h-[480px] w-full object-contain rounded-lg"
            />
          ) : (
            <div className="text-center text-gray-600 text-[13px] px-10 py-10 leading-relaxed">
              <User size={40} className="mx-auto mb-3 opacity-40" />
              Your avatar appears here
              <span className="block text-[11px] opacity-60 mt-1">
                {mode === 'ai' ? 'AI-generated with Pollinations — free forever' : 'Stylized with DiceBear — free forever'}
              </span>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/50 grid place-items-center">
              <div className="text-center">
                <Spinner size={32} />
                <p className="text-xs text-gray-400 mt-2">
                  {mode === 'ai' ? 'Drawing your avatar...' : 'Crafting stylized avatar...'}
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
              onClick={() => mode === 'ai' ? generateAIAvatar() : generateDiceBear()}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-xs text-cyan-300 hover:bg-cyan-500/30 hover:text-white transition-all font-semibold"
            >
              <RefreshCw size={13} /> Regenerate
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
