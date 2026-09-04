import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon, Eye, Download, Sparkles, Film, ZoomIn, ZoomOut,
  ArrowLeft, ArrowRight, Move, Box, Camera, Palette, Brush, Droplets, Grid3x3,
  Upload, Wand2, Settings2,
} from 'lucide-react';
import {
  STYLE_PRESETS, ASPECT_PRESETS, EFFECT_PRESETS, PROMPT_PRESETS, IMAGE_RESOLUTIONS,
} from '@/lib/presets';
import type { Generation, StatusResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';

const ICON_MAP: Record<string, typeof ZoomIn> = {
  Clapperboard: Film, Camera, Box, Palette, Brush, Droplets, Grid3x3,
  ZoomIn, ZoomOut, ArrowLeft, ArrowRight, Move, Film,
};

interface GenerateTabProps {
  onRecordUsage: (action: string, model: string, status: string) => void;
  onSaveGeneration: (gen: Partial<Generation>) => Promise<Generation | null>;
  onLightbox: (src: string) => void;
  onUseForEditing: (b64: string) => void;
  currentImageB64: string | null;
  setCurrentImageB64: (b64: string | null) => void;
}

export function GenerateTab({
  onRecordUsage, onSaveGeneration, onLightbox, onUseForEditing, currentImageB64, setCurrentImageB64,
}: GenerateTabProps) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video');
  const [selectedStyle, setSelectedStyle] = useState('cinematic');
  const [selectedAspect, setSelectedAspect] = useState(ASPECT_PRESETS[0]);
  const [selectedEffect, setSelectedEffect] = useState('zoom-in');
  const [selectedResolution, setSelectedResolution] = useState(IMAGE_RESOLUTIONS[2]);
  const [duration, setDuration] = useState(5);
  const [seed, setSeed] = useState('');
  const [negPrompt, setNegPrompt] = useState('blurry, low quality, distorted');
  const [enhance, setEnhance] = useState(true);
  const [nologo, setNologo] = useState(false);
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Type a prompt and hit Generate.' });
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState<'image' | 'video' | null>(null);
  const [resultB64, setResultB64] = useState<string | null>(null);
  const [history, setHistory] = useState<{ prompt: string; url: string }[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('google/gemini-3-pro-image-preview');
  const [autoAnimate, setAutoAnimate] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const AI_MODELS = [
    { id: 'google/gemini-3-pro-image-preview', name: 'Gemini 3 Pro', desc: 'Google\'s best — stunning quality', icon: '🌟' },
    { id: 'openai/gpt-image-2', name: 'GPT Image 2', desc: 'OpenAI\'s latest — photorealistic', icon: '🎨' },
    { id: 'black-forest-labs/flux-2-pro', name: 'FLUX.2 Pro', desc: 'Black Forest Labs — ultra detailed', icon: '⚡' },
    { id: 'x-ai/grok-imagine-image', name: 'Grok Imagine', desc: 'xAI\'s creative model', icon: '🚀' },
    { id: 'stabilityai/stable-diffusion-3-medium', name: 'Stable Diffusion 3', desc: 'Open source — versatile', icon: '🎯' },
  ];

  useEffect(() => {
    const handler = (e: Event) => setPrompt((e as CustomEvent).detail as string);
    window.addEventListener('set-prompt', handler);
    return () => window.removeEventListener('set-prompt', handler);
  }, []);

  const showResult = useCallback((url: string | null, b64: string | null, type: 'image' | 'video') => {
    setResultUrl(url);
    setResultB64(b64);
    setResultType(type);
    if (b64) {
      setCurrentImageB64(b64);
      const dataUrl = `data:image/png;base64,${b64}`;
      setHistory(prev => [{ prompt, url: dataUrl }, ...prev].slice(0, 20));
    }
  }, [prompt, setCurrentImageB64]);

  async function animateBase64Image(b64: string, source = 'cinematic-1080p') {
    setLoading(true);
    setStatus({ type: 'loading', message: `Creating high-quality ${selectedEffect} animation...` });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() || 'Cinematic image animation', image_b64: b64, kb_effect: selectedEffect, kb_duration: duration }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const raw = await resp.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { detail: raw }; }
      if (!resp.ok || data.error || data.status === 'failed' || data.status === 'error') throw new Error(data.error || data.detail || 'Animation failed on the server.');
      const vUrl = data.video_url || data.video || data.file;
      if (!vUrl) throw new Error('The server completed the request but returned no video URL.');
      showResult(vUrl, b64, 'video');
      setStatus({ type: 'ok', message: data.message || 'Animation complete — 1080p MP4 ready.' });
      onRecordUsage('animate', source, 'ok');
      await onSaveGeneration({ type: 'video', prompt: prompt || 'Image animation', model: source, effect: selectedEffect, duration, media_url: vUrl, thumbnail_url: `data:image/png;base64,${b64}`, status: 'completed' });
      return vUrl;
    } catch (e) {
      const message = e instanceof DOMException && e.name === 'AbortError' ? 'Animation took too long. Please try a shorter duration.' : (e as Error).message;
      setStatus({ type: 'err', message });
      onRecordUsage('animate', source, 'error');
      return null;
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  async function generate() {
    if (!prompt.trim() && mode === 'text-to-video') { setStatus({ type: 'err', message: 'Enter a prompt first.' }); return; }
    setLoading(true); setResultUrl(null); setResultB64(null); setResultType(null);
    setStatus({ type: 'loading', message: `Generating ${selectedResolution.label} image via FLUX.1-schnell...` });
    try {
      const styleHints: Record<string, string> = {
        cinematic: 'anamorphic lens flare, shallow depth of field, teal-amber color grade, cinematic lighting',
        photorealistic: 'shot on 85mm f/1.4, natural skin texture, true-to-life colour, photorealistic',
        anime: 'hand-painted illustration, bold linework, rich gouache texture, anime style',
        '3d render': 'octane render, subsurface scattering, global illumination, 3D render',
        'digital art': 'detailed digital painting, vibrant colors, concept art quality',
        'oil painting': 'classical oil painting, rich brushstrokes, gallery quality',
        watercolor: 'soft watercolor painting, delicate washes',
        'pixel art': 'retro pixel art, 16-bit style',
      };
      const hint = styleHints[selectedStyle] || styleHints.cinematic;
      const enhancedPrompt = [prompt.trim(), hint, 'Ultra-high resolution, razor-sharp focus, fine micro-detail.', 'High dynamic range, deep contrast, rich color depth, professional color grading.', 'Masterpiece quality, award-winning photography.', negPrompt ? `Avoid: ${negPrompt}.` : ''].filter(Boolean).join('. ');
      let base64 = ''; let provider = 'pollinations';
      try {
        setStatus({ type: 'loading', message: 'Generating via Kling AI (free tier)...' });
        const klingImgResp = await fetch('/api/generate-kling-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: enhancedPrompt }) });
        if (klingImgResp.ok) {
          const klingImgData = await klingImgResp.json();
          if (klingImgData.image_url) {
            const imgResp = await fetch(klingImgData.image_url); const blob = await imgResp.blob(); const reader = new FileReader();
            base64 = await new Promise<string>((resolve, reject) => { reader.onloadend = () => resolve(reader.result!.toString().split(',')[1]); reader.onerror = () => reject(new Error('Could not read generated image')); reader.readAsDataURL(blob); });
            provider = 'kling-ai';
          }
        }
      } catch (klingErr) { console.log('Kling image gen failed, trying Puter.js...', klingErr); }
      if (!base64) {
        const modelName = AI_MODELS.find(m => m.id === selectedModel)?.name || 'AI';
        try {
          setStatus({ type: 'loading', message: `Generating via ${modelName} (Puter.js free tier)...` });
          const imgElement = await (window as any).puter.ai.txt2img(enhancedPrompt, { model: selectedModel });
          const canvas = document.createElement('canvas'); canvas.width = imgElement.naturalWidth || 1024; canvas.height = imgElement.naturalHeight || 1024;
          const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not create image canvas'); ctx.drawImage(imgElement, 0, 0); base64 = canvas.toDataURL('image/png').split(',')[1]; provider = `puter-${modelName}`;
        } catch (puterErr) { console.log('Puter.js failed, trying backend...', puterErr); }
      }
      if (!base64) {
        try {
          setStatus({ type: 'loading', message: 'Trying backend image generation...' });
          const hfResp = await fetch('/api/generate-hf-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: enhancedPrompt }) });
          if (hfResp.ok) { const hfData = await hfResp.json(); base64 = hfData.image; provider = hfData.provider || 'backend'; }
        } catch { /* Continue to common error. */ }
      }
      if (!base64) throw new Error('All image providers failed. Please try again.');
      showResult(null, base64, 'image');
      if (autoAnimate) {
        const videoUrl = await animateBase64Image(base64);
        if (videoUrl) setStatus({ type: 'ok', message: `Generated! ${provider} image + cinematic 1080p video.` });
      } else {
        setStatus({ type: 'ok', message: `Generated! ${provider} image ready. Click ▶ Animate to create video.` });
        onRecordUsage('generate', provider, 'ok');
      }
      await onSaveGeneration({ type: 'image', prompt, model: provider, style: selectedStyle, aspect_ratio: selectedAspect.ratio, resolution: selectedResolution.value, width: selectedResolution.width, height: selectedResolution.height, effect: selectedEffect, duration, thumbnail_url: `data:image/png;base64,${base64}`, status: 'completed', metadata: { seed: seed || null, negative_prompt: negPrompt } });
    } catch (e) { setStatus({ type: 'err', message: `Error: ${(e as Error).message}` }); onRecordUsage('generate', 'flux-direct', 'error'); }
    finally { setLoading(false); }
  }

  async function animateImage() {
    if (imageFile) {
      setLoading(true); setStatus({ type: 'loading', message: `Animating uploaded image with ${selectedEffect}...` });
      try {
        const body = new FormData(); body.append('file', imageFile); body.append('effect', selectedEffect); body.append('duration', String(duration));
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 120000);
        const resp = await fetch('/api/generate', { method: 'POST', body, signal: controller.signal }); clearTimeout(timeout);
        const raw = await resp.text(); let data: any = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { detail: raw }; }
        if (!resp.ok || data.error || data.status === 'failed' || data.status === 'error') throw new Error(data.error || data.detail || 'Animation failed.');
        const vUrl = data.video_url || data.video || data.file; if (!vUrl) throw new Error('No video URL returned by the animation service.');
        showResult(vUrl, null, 'video'); setStatus({ type: 'ok', message: data.message || 'Animation complete — 1080p MP4 ready.' }); onRecordUsage('animate', 'cinematic-1080p', 'ok');
        await onSaveGeneration({ type: 'video', prompt: 'Uploaded image animation', model: 'cinematic-1080p', effect: selectedEffect, duration, media_url: vUrl, status: 'completed' });
      } catch (e) { setStatus({ type: 'err', message: e instanceof DOMException && e.name === 'AbortError' ? 'Animation timed out. Try a shorter duration.' : (e as Error).message }); onRecordUsage('animate', 'cinematic-1080p', 'error'); }
      finally { setLoading(false); }
      return;
    }
    const b64 = imagePreview?.split(',')[1] || resultB64 || currentImageB64;
    if (!b64) { setStatus({ type: 'err', message: 'Upload an image or generate an image first.' }); return; }
    await animateBase64Image(b64);
  }

  function handleFileSelect(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus({ type: 'err', message: 'Please select an image file.' }); return; }
    if (file.size > 25 * 1024 * 1024) { setStatus({ type: 'err', message: 'Image is too large. Maximum size is 25MB.' }); return; }
    setImageFile(file); const reader = new FileReader(); reader.onload = e => setImagePreview(e.target?.result as string); reader.onerror = () => setStatus({ type: 'err', message: 'Could not read the selected image.' }); reader.readAsDataURL(file);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1400px] mx-auto">
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1"><div className="w-8 h-8 rounded-[10px] grid place-items-center bg-cyan-500/15"><ImageIcon size={16} className="text-cyan-400" /></div><h2 className="text-base font-bold tracking-tight">Image & Video Generator</h2></div>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">Generate ultra-high-resolution cinematic images with AI and animate them into smooth MP4 videos with cinematic camera effects.</p>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Mode</label>
        <div className="flex gap-2 mb-4"><button onClick={() => setMode('text-to-video')} className={`flex-1 px-4 py-2.5 rounded-[10px] text-xs font-semibold transition-all border ${mode === 'text-to-video' ? 'bg-cyan-500/10 border-cyan-400 text-white' : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'}`}>Text to Image + Video</button><button onClick={() => setMode('image-to-video')} className={`flex-1 px-4 py-2.5 rounded-[10px] text-xs font-semibold transition-all border ${mode === 'image-to-video' ? 'bg-cyan-500/10 border-cyan-400 text-white' : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'}`}>Animate My Image</button></div>
        {mode === 'text-to-video' ? <><label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Prompt</label><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="a cat walking through a neon city at night, cinematic, 4K..." className="input-field min-h-[80px] resize-y leading-relaxed" /><div className="flex flex-wrap gap-1.5 mt-2">{PROMPT_PRESETS.map((p, i) => <button key={i} onClick={() => setPrompt(p)} className="px-2.5 py-1 rounded-full bg-[#0a0a12] border border-white/[0.06] text-[10px] text-gray-500 hover:border-cyan-500/40 hover:text-gray-300 transition-all">{p.length > 33 ? p.slice(0, 31) + '...' : p}</button>)}</div></> : <div className="mb-4"><label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Upload Image to Animate</label><div className="flex gap-2 items-center"><input ref={fileInputRef} type="file" accept="image/*" onChange={e => handleFileSelect(e.target.files?.[0] ?? null)} className="flex-1 text-[11px] text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-surface-3 file:text-gray-300 file:text-xs file:cursor-pointer" /></div>{imagePreview && <div className="mt-2.5"><img src={imagePreview} alt="Preview" className="max-w-full max-h-[200px] rounded-[10px] border-2 border-cyan-400" /><p className="text-[11px] text-gray-500 mt-1">Selected — ready to animate</p></div>}<p className="text-[11px] text-gray-600 bg-[#0a0a12] border-l-2 border-cyan-400 px-3 py-2 rounded-r-md mt-3 leading-relaxed">Upload any image and animate it with cinematic zoom, pan, dolly, and combined camera effects.</p></div>}
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 flex items-center gap-1">🤖 AI Model <span className="text-[9px] text-green-400 font-normal">FREE</span></label>
        <div className="grid grid-cols-1 gap-1.5">{AI_MODELS.map(m => <button key={m.id} onClick={() => setSelectedModel(m.id)} className={`px-3 py-2 rounded-[8px] text-[11px] font-semibold transition-all border text-left flex items-center gap-2 ${selectedModel === m.id ? 'bg-cyan-500/10 border-cyan-400 text-white' : 'bg-[#0a0a12] border-white/[0.06] text-gray-400 hover:border-white/[0.12]'}`}><span className="text-sm">{m.icon}</span><span>{m.name}</span><span className="text-[9px] text-gray-600 font-normal ml-auto">{m.desc}</span></button>)}</div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 flex items-center gap-1"><Settings2 size={11} /> Output Resolution</label>
        <div className="grid grid-cols-5 gap-1.5">{IMAGE_RESOLUTIONS.map(r => <button key={r.value} onClick={() => setSelectedResolution(r)} className={`px-2 py-2 rounded-[8px] text-[10px] font-bold transition-all border text-center ${selectedResolution.value === r.value ? 'bg-cyan-500/10 border-cyan-400 text-white' : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'}`}>{r.value.toUpperCase()}<span className="block text-[8px] font-normal text-gray-600 mt-0.5">{r.width}x{r.height}</span></button>)}</div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Style</label><div className="grid grid-cols-4 gap-2">{STYLE_PRESETS.map(s => { const Icon = ICON_MAP[s.icon] || ImageIcon; return <button key={s.id} onClick={() => setSelectedStyle(s.id)} className={`preset-chip ${selectedStyle === s.id ? 'active' : ''}`}><Icon size={14} className={selectedStyle === s.id ? 'text-cyan-400' : ''} /><span className="preset-chip-label text-xs font-semibold">{s.label}</span><span className="preset-chip-hint text-[10px]">{s.hint}</span></button>; })}</div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Aspect Ratio</label><div className="grid grid-cols-3 gap-2">{ASPECT_PRESETS.map(a => <button key={a.ratio} onClick={() => setSelectedAspect(a)} className={`preset-chip ${selectedAspect.ratio === a.ratio ? 'active' : ''}`}><span className="preset-chip-label text-xs font-semibold">{a.ratio} {a.label.split(' ')[1] || ''}</span><span className="preset-chip-hint text-[10px]">{a.hint}</span></button>)}</div>
        <div className="flex gap-4 flex-wrap mt-4"><label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)} className="accent-cyan-400" />Enhance prompt</label><label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={nologo} onChange={e => setNologo(e.target.checked)} className="accent-cyan-400" />No watermark</label><label className="flex items-center gap-1.5 text-xs text-cyan-400 font-semibold cursor-pointer"><input type="checkbox" checked={autoAnimate} onChange={e => setAutoAnimate(e.target.checked)} className="accent-cyan-400" />▶ Instant animate</label></div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Animation Effect</label><div className="grid grid-cols-6 gap-1.5">{EFFECT_PRESETS.map(eff => { const Icon = ICON_MAP[eff.icon] || Move; return <button key={eff.id} onClick={() => setSelectedEffect(eff.id)} className={`effect-item ${selectedEffect === eff.id ? 'active' : ''}`}><Icon size={16} className={selectedEffect === eff.id ? 'text-cyan-400' : ''} />{eff.label}</button>; })}</div>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Duration: <span className="text-cyan-400">{duration.toFixed(1)}s</span></label><input type="range" min={2} max={30} step={0.5} value={duration} onChange={e => setDuration(parseFloat(e.target.value))} className="w-full accent-cyan-400 h-1" />
        <div className="flex gap-3 mt-4"><div className="flex-1"><label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Seed (optional)</label><input type="text" value={seed} onChange={e => setSeed(e.target.value)} placeholder="random" className="input-field" /></div><div className="flex-1"><label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Negative Prompt</label><input type="text" value={negPrompt} onChange={e => setNegPrompt(e.target.value)} className="input-field" /></div></div>
        <button onClick={mode === 'text-to-video' ? generate : animateImage} disabled={loading} className={`btn-primary w-full mt-4 py-3 rounded-[10px] text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 ${mode === 'image-to-video' ? 'btn-rose' : ''}`}>{loading ? <Spinner /> : mode === 'text-to-video' ? <Film size={15} /> : <Wand2 size={15} />}{loading ? 'Generating...' : mode === 'text-to-video' ? 'Generate' : 'Animate This Image'}</button><StatusBadge status={status} />
      </div>
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4"><div className="w-8 h-8 rounded-[10px] grid place-items-center bg-emerald-500/15"><Eye size={16} className="text-emerald-400" /></div><h2 className="text-base font-bold tracking-tight">Preview</h2>{resultType && <span className="ml-auto text-[10px] text-gray-500 uppercase tracking-wider">{resultType === 'video' ? '🎬 Video' : '🖼 Image'}</span>}</div>
        <div className="bg-black rounded-2xl min-h-[300px] max-h-[500px] flex items-center justify-center overflow-hidden relative border border-white/[0.06]">{resultType === 'video' && resultUrl ? <video src={resultUrl} controls autoPlay loop className="max-w-full max-h-[480px] object-contain rounded-lg" /> : resultType === 'image' && resultB64 ? <img src={`data:image/png;base64,${resultB64}`} alt="Generated" className="max-w-full max-h-[480px] object-contain cursor-zoom-in rounded-lg" onClick={() => onLightbox(`data:image/png;base64,${resultB64}`)} /> : <div className="text-center text-gray-600 text-[13px] px-10 py-10 leading-relaxed"><ImageIcon size={40} className="mx-auto mb-3 opacity-40" />Your generated content will appear here<span className="block text-[11px] opacity-60 mt-1">AI image → cinematic animation → MP4</span></div>}{loading && <div className="absolute inset-0 bg-black/50 grid place-items-center"><div className="text-center"><Spinner size={32} /><p className="text-xs text-gray-400 mt-2">Generating...</p></div></div>}</div>
        <div className="flex gap-2 flex-wrap mt-3">{resultUrl && <a href={resultUrl} download={resultType === 'video' ? 'ai_video.mp4' : 'ai_image.png'} className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-xs font-semibold"><Download size={14} />Download {resultType === 'video' ? 'MP4' : 'Image'}</a>}{resultB64 && resultType === 'image' && !loading && <button onClick={() => animateBase64Image(resultB64)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-xs text-cyan-300 hover:bg-cyan-500/30 hover:text-white transition-all font-semibold">▶ Animate to Video</button>}{resultB64 && <button onClick={() => onUseForEditing(resultB64)} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-surface-3 border border-white/[0.06] text-xs text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all"><Sparkles size={13} />Use for Editing</button>}</div>
        {history.length > 0 && <div className="mt-6"><div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Recent Generations</div><div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">{history.map((item, i) => <div key={i} className="relative rounded-[10px] overflow-hidden border border-white/[0.06] bg-surface-3 cursor-pointer group hover:border-cyan-400 transition-all" onClick={() => onLightbox(item.url)}><img src={item.url} alt={item.prompt} className="w-full aspect-square object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"><p className="text-[10px] text-white/80 line-clamp-2">{item.prompt}</p></div></div>)}</div></div>}
      </div>
    </div>
  );
}
