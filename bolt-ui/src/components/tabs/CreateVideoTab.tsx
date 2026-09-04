import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Film, Wand2, Check, ChevronRight, ChevronLeft,
  Download, Play, RotateCcw, AlertCircle, CheckCircle2,
  Loader2, Copy, Eye, Zap, Target, Image as ImageIcon,
  Type, LayoutList, Clapperboard, Palette, MonitorPlay,
  Smartphone, Youtube, Instagram, Video as VideoIcon,
  Mic, Subtitles, Pencil, Volume2, RefreshCw,
} from 'lucide-react';
import type { StatusResponse } from '@/lib/types';
import { Spinner } from '@/components/Spinner';

// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Topic', icon: Type },
  { id: 2, label: 'Platform', icon: Smartphone },
  { id: 3, label: 'Duration', icon: MonitorPlay },
  { id: 4, label: 'Content', icon: LayoutList },
  { id: 5, label: 'Style', icon: Palette },
  { id: 6, label: 'Hook', icon: Zap },
  { id: 7, label: 'Script', icon: Film },
  { id: 8, label: 'Scenes', icon: Clapperboard },
  { id: 9, label: 'Prompts', icon: Eye },
  { id: 10, label: 'Images', icon: ImageIcon },
  { id: 11, label: 'Voice', icon: Mic },
  { id: 12, label: 'Captions', icon: Subtitles },
  { id: 13, label: 'Edit', icon: Pencil },
  { id: 14, label: 'Assemble', icon: Wand2 },
  { id: 15, label: 'Preview', icon: Play },
  { id: 16, label: 'Download', icon: Download },
];

const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok', icon: VideoIcon, color: 'text-pink-400', maxDur: 180 },
  { id: 'youtube-shorts', label: 'YouTube Shorts', icon: Youtube, color: 'text-red-400', maxDur: 60 },
  { id: 'instagram-reels', label: 'Instagram Reels', icon: Instagram, color: 'text-purple-400', maxDur: 90 },
  { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-400', maxDur: 600 },
  { id: 'facebook', label: 'Facebook', icon: VideoIcon, color: 'text-blue-400', maxDur: 240 },
];

const CONTENT_TYPES = [
  { id: 'educational', label: 'Educational', desc: 'Teach something step-by-step', icon: '📚' },
  { id: 'storytelling', label: 'Storytelling', desc: 'Narrative with emotional arc', icon: '📖' },
  { id: 'advertisement', label: 'Advertisement', desc: 'Bold, attention-grabbing ad', icon: '📢' },
  { id: 'product-promo', label: 'Product Promo', desc: 'Showcase a product or service', icon: '🛒' },
  { id: 'faceless-video', label: 'Faceless Video', desc: 'No people — abstract visuals', icon: '🎭' },
  { id: 'documentary', label: 'Documentary', desc: 'Informative, authentic style', icon: '🎬' },
  { id: 'motivational', label: 'Motivational', desc: 'Inspire and uplift viewers', icon: '🔥' },
];

const VISUAL_STYLES = [
  { id: 'cinematic', label: 'Cinematic', hint: 'Film-quality lighting', icon: '🎬' },
  { id: 'photorealistic', label: 'Photorealistic', hint: 'Ultra-real photos', icon: '📷' },
  { id: 'anime', label: 'Anime', hint: 'Japanese animation', icon: '🎨' },
  { id: '3d render', label: '3D Render', hint: 'CGI quality', icon: '💻' },
  { id: 'digital art', label: 'Digital Art', hint: 'Illustration style', icon: '🖌️' },
  { id: 'oil painting', label: 'Oil Painting', hint: 'Classical artwork', icon: '🖼️' },
  { id: 'watercolor', label: 'Watercolor', hint: 'Soft painted look', icon: '💧' },
  { id: 'pixel art', label: 'Pixel Art', hint: 'Retro game style', icon: '👾' },
];

const DURATIONS = [
  { value: 15, label: '15s', desc: 'Quick & punchy' },
  { value: 30, label: '30s', desc: 'Standard short' },
  { value: 60, label: '60s', desc: 'Full short-form' },
  { value: 120, label: '2 min', desc: 'Extended' },
  { value: 300, label: '5 min', desc: 'Long-form' },
];

const CAPTION_STYLES = [
  { id: 'clean', label: 'Clean', desc: 'White text, black outline', icon: 'Aa', color: 'text-white' },
  { id: 'bold', label: 'Bold', desc: 'Large Impact font, heavy', icon: 'AB', color: 'text-yellow-400' },
  { id: 'highlight', label: 'Highlight', desc: 'Yellow text, eye-catching', icon: '⚡', color: 'text-yellow-300' },
  { id: 'minimal', label: 'Minimal', desc: 'Subtle gray, understated', icon: '–', color: 'text-gray-400' },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface SceneData {
  scene_number: number;
  duration: number;
  visual_prompt: string;
  voiceover: string;
  caption: string;
}

interface CaptionEntry {
  start_time: number;
  end_time: number;
  text: string;
  scene_index: number;
}

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  style: string;
}

interface WorkflowState {
  topic: string;
  platform: string;
  duration: number;
  contentType: string;
  visualStyle: string;
  hook: string;
  scriptTitle: string;
  scenes: SceneData[];
  sceneImages: string[];
  // Voiceover
  selectedVoice: string;
  voiceoverAudioUrls: string[];
  voiceoverDurations: number[];
  // Captions
  captionStyle: string;
  captions: CaptionEntry[];
  captionsSrt: string;
  captionsAss: string;
  // Final
  finalVideoUrl: string | null;
  captionedVideoUrl: string | null;
}

const EMPTY_STATE: WorkflowState = {
  topic: '',
  platform: 'youtube-shorts',
  duration: 30,
  contentType: 'educational',
  visualStyle: 'cinematic',
  hook: '',
  scriptTitle: '',
  scenes: [],
  sceneImages: [],
  selectedVoice: 'en-US-AriaNeural',
  voiceoverAudioUrls: [],
  voiceoverDurations: [],
  captionStyle: 'clean',
  captions: [],
  captionsSrt: '',
  captionsAss: '',
  finalVideoUrl: null,
  captionedVideoUrl: null,
};

// ── Main Component ───────────────────────────────────────────────────────────

interface CreateVideoTabProps {
  onRecordUsage: (action: string, model: string, status: string) => void;
}

export function CreateVideoTab({ onRecordUsage }: CreateVideoTabProps) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WorkflowState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepStatus, setStepStatus] = useState<Record<number, 'idle' | 'loading' | 'done' | 'error'>>({});
  const [sceneImageProgress, setSceneImageProgress] = useState({ current: 0, total: 0 });
  const [fullScript, setFullScript] = useState('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceProgress, setVoiceProgress] = useState({ current: 0, total: 0 });

  const update = <K extends keyof WorkflowState>(key: K, value: WorkflowState[K]) =>
    setState(prev => ({ ...prev, [key]: value }));

  const platformMaxDur = PLATFORMS.find(p => p.id === state.platform)?.maxDur ?? 60;
  const effectiveDuration = Math.min(state.duration, platformMaxDur);

  // Load voices on mount
  useEffect(() => {
    fetch('/api/voices')
      .then(r => r.json())
      .then(data => {
        if (data.voices) setVoices(data.voices);
      })
      .catch(() => {});
  }, []);

  // ── Step navigation ──
  const canAdvance = (): boolean => {
    switch (step) {
      case 1: return state.topic.trim().length >= 3;
      case 2: return !!state.platform;
      case 3: return state.duration > 0;
      case 4: return !!state.contentType;
      case 5: return !!state.visualStyle;
      case 6: return !!state.hook;
      case 7: return state.scenes.length > 0;
      case 8: return state.scenes.length > 0;
      case 9: return state.scenes.length > 0;
      case 10: return state.sceneImages.length === state.scenes.length;
      case 11: return state.voiceoverDurations.length > 0;
      case 12: return state.captions.length > 0;
      case 13: return state.captions.length > 0;
      case 14: return !!(state.captionedVideoUrl || state.finalVideoUrl);
      case 15: return !!(state.captionedVideoUrl || state.finalVideoUrl);
      default: return false;
    }
  };

  const goNext = () => { if (step < 16 && canAdvance()) { setStep(s => s + 1); setError(null); } };
  const goBack = () => { if (step > 1) { setStep(s => s - 1); setError(null); } };

  // ── Actions ──

  const generateHook = useCallback(async () => {
    setLoading(true); setError(null);
    setStepStatus(prev => ({ ...prev, 6: 'loading' }));
    try {
      const resp = await fetch('/api/create-video/generate-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: state.topic, platform: state.platform, content_type: state.contentType, visual_style: state.visualStyle }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed');
      update('hook', data.hook);
      setStepStatus(prev => ({ ...prev, 6: 'done' }));
      onRecordUsage('create-video-hook', 'groq', 'ok');
    } catch (e) { setError((e as Error).message); setStepStatus(prev => ({ ...prev, 6: 'error' })); onRecordUsage('create-video-hook', 'groq', 'error'); }
    finally { setLoading(false); }
  }, [state.topic, state.platform, state.contentType, state.visualStyle, onRecordUsage]);

  const generateScript = useCallback(async () => {
    setLoading(true); setError(null);
    setStepStatus(prev => ({ ...prev, 7: 'loading' }));
    try {
      const resp = await fetch('/api/create-video/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: state.topic, platform: state.platform, duration: effectiveDuration, content_type: state.contentType, visual_style: state.visualStyle, hook: state.hook }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed');
      update('scriptTitle', data.title);
      update('scenes', data.scenes);
      setFullScript(data.full_script);
      setStepStatus(prev => ({ ...prev, 7: 'done', 8: 'done', 9: 'done' }));
      onRecordUsage('create-video-script', 'groq', 'ok');
    } catch (e) { setError((e as Error).message); setStepStatus(prev => ({ ...prev, 7: 'error' })); onRecordUsage('create-video-script', 'groq', 'error'); }
    finally { setLoading(false); }
  }, [state.topic, state.platform, effectiveDuration, state.contentType, state.visualStyle, state.hook, onRecordUsage]);

  const generateAllSceneImages = useCallback(async () => {
    setLoading(true); setError(null);
    setStepStatus(prev => ({ ...prev, 10: 'loading' }));
    const images: string[] = [];
    setSceneImageProgress({ current: 0, total: state.scenes.length });
    try {
      for (let i = 0; i < state.scenes.length; i++) {
        setSceneImageProgress({ current: i + 1, total: state.scenes.length });
        const scene = state.scenes[i];
        const resp = await fetch('/api/create-video/generate-scene-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene_index: i, visual_prompt: scene.visual_prompt, style: state.visualStyle, width: 1920, height: 1080 }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`Scene ${i + 1}: ${data.detail || 'Failed'}`);
        images.push(data.image_b64);
      }
      update('sceneImages', images);
      setStepStatus(prev => ({ ...prev, 10: 'done' }));
      onRecordUsage('create-video-scenes', 'pollinations', 'ok');
    } catch (e) {
      update('sceneImages', images);
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 10: images.length > 0 ? 'done' : 'error' }));
      onRecordUsage('create-video-scenes', 'pollinations', 'error');
    } finally { setLoading(false); }
  }, [state.scenes, state.visualStyle, onRecordUsage]);

  const generateVoiceover = useCallback(async () => {
    setLoading(true); setError(null);
    setStepStatus(prev => ({ ...prev, 11: 'loading' }));
    setVoiceProgress({ current: 0, total: state.scenes.length });
    try {
      const voiceovers = state.scenes.map(s => s.voiceover);
      const resp = await fetch('/api/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceovers, voice: state.selectedVoice }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed');
      update('voiceoverAudioUrls', data.audio_files);
      update('voiceoverDurations', data.durations);
      setStepStatus(prev => ({ ...prev, 11: 'done' }));
      onRecordUsage('generate-voiceover', 'edge-tts', 'ok');
    } catch (e) {
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 11: 'error' }));
      onRecordUsage('generate-voiceover', 'edge-tts', 'error');
    } finally { setLoading(false); }
  }, [state.scenes, state.selectedVoice, onRecordUsage]);

  const generateCaptions = useCallback(async () => {
    setLoading(true); setError(null);
    setStepStatus(prev => ({ ...prev, 12: 'loading' }));
    try {
      const resp = await fetch('/api/generate-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceovers: state.scenes.map(s => s.voiceover),
          durations: state.voiceoverDurations.length > 0 ? state.voiceoverDurations : state.scenes.map(s => s.duration),
          style: state.captionStyle,
          max_words_per_chunk: 8,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed');
      update('captions', data.captions);
      update('captionsSrt', data.srt);
      update('captionsAss', data.ass);
      setStepStatus(prev => ({ ...prev, 12: 'done', 13: 'done' }));
      onRecordUsage('generate-captions', 'local', 'ok');
    } catch (e) {
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 12: 'error' }));
      onRecordUsage('generate-captions', 'local', 'error');
    } finally { setLoading(false); }
  }, [state.scenes, state.voiceoverDurations, state.captionStyle, onRecordUsage]);

  const assembleAndBurnCaptions = useCallback(async () => {
    setLoading(true); setError(null);
    setStepStatus(prev => ({ ...prev, 14: 'loading' }));
    try {
      const jobId = crypto.randomUUID().slice(0, 12);

      // Step 1: Assemble base video (without captions)
      const assembleResp = await fetch('/api/create-video/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          scene_images: state.sceneImages,
          scene_durations: state.voiceoverDurations.length > 0 ? state.voiceoverDurations : state.scenes.map(s => s.duration),
          scene_voiceovers: state.scenes.map(s => s.voiceover),
          scene_captions: state.scenes.map(s => s.caption),
          platform: state.platform,
          title: state.scriptTitle || state.topic,
        }),
      });
      const assembleData = await assembleResp.json();
      if (!assembleResp.ok) throw new Error(assembleData.detail || 'Assembly failed');
      update('finalVideoUrl', assembleData.video_url);

      // Step 2: Burn captions into the video
      if (state.captions.length > 0) {
        const burnResp = await fetch('/api/burn-captions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            captions: state.captions,
            video_url: assembleData.video_url,
            style: state.captionStyle,
            job_id: jobId,
          }),
        });
        const burnData = await burnResp.json();
        if (!burnResp.ok) throw new Error(burnData.detail || 'Caption burning failed');
        update('captionedVideoUrl', burnData.video_url);
      } else {
        update('captionedVideoUrl', assembleData.video_url);
      }

      setStepStatus(prev => ({ ...prev, 14: 'done' }));
      onRecordUsage('create-video-assemble', 'moviepy+ffmpeg', 'ok');
    } catch (e) {
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 14: 'error' }));
      onRecordUsage('create-video-assemble', 'moviepy+ffmpeg', 'error');
    } finally { setLoading(false); }
  }, [state.sceneImages, state.scenes, state.voiceoverDurations, state.platform, state.scriptTitle, state.topic, state.captions, state.captionStyle, onRecordUsage]);

  const resetWorkflow = () => {
    setState(EMPTY_STATE); setStep(1); setStepStatus({}); setError(null);
    setFullScript(''); setSceneImageProgress({ current: 0, total: 0 }); setVoiceProgress({ current: 0, total: 0 });
  };

  const activeVideoUrl = state.captionedVideoUrl || state.finalVideoUrl;

  // ── Render ──
  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Progress bar */}
      <div className="glass-panel rounded-2xl p-4 mb-5">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const status = stepStatus[s.id] || (s.id < step ? 'done' : s.id === step ? 'loading' : 'idle');
            const isActive = s.id === step;
            const isDone = status === 'done' || s.id < step;
            return (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => { if (s.id <= step || isDone) setStep(s.id); }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap ${
                    isActive ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : isDone ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-gray-600 border border-transparent hover:text-gray-400'
                  }`}
                >
                  {isDone && !isActive ? <CheckCircle2 size={12} /> : status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
                  <span className="hidden lg:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <ChevronRight size={10} className="text-gray-700 mx-0.5 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
        <div className="w-full h-1 bg-surface-3 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-panel rounded-xl p-4 mb-4 border border-rose-500/30 flex items-start gap-3">
          <AlertCircle size={18} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1"><p className="text-sm text-rose-300">{error}</p></div>
          <button onClick={() => setError(null)} className="text-gray-500 hover:text-white text-xs">Dismiss</button>
        </div>
      )}

      {/* Step content */}
      <div className="glass-panel rounded-2xl p-6 min-h-[500px]">

        {/* ── Steps 1-5: Configuration ── */}
        {step === 1 && (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-cyan-500/15"><Type size={20} className="text-cyan-400" /></div>
              <div><h2 className="text-lg font-bold">What's your video about?</h2><p className="text-xs text-gray-500">Enter a topic, idea, or description</p></div>
            </div>
            <textarea value={state.topic} onChange={e => update('topic', e.target.value)}
              placeholder="e.g. How to make the perfect espresso at home..."
              className="input-field min-h-[120px] resize-y leading-relaxed mt-4" autoFocus />
            <p className="text-[11px] text-gray-600 mt-2">{state.topic.length}/500</p>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-pink-500/15"><Smartphone size={20} className="text-pink-400" /></div>
              <div><h2 className="text-lg font-bold">Choose your platform</h2><p className="text-xs text-gray-500">Each platform has different dimensions and duration limits</p></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {PLATFORMS.map(p => { const Icon = p.icon; const selected = state.platform === p.id;
                return (
                  <button key={p.id} onClick={() => { update('platform', p.id); if (state.duration > p.maxDur) update('duration', Math.min(60, p.maxDur)); }}
                    className={`glass-panel rounded-xl p-4 text-left transition-all ${selected ? 'border-cyan-500/40 bg-cyan-500/5' : 'hover:border-white/10'}`}>
                    <Icon size={24} className={selected ? p.color : 'text-gray-500'} />
                    <p className="text-sm font-semibold mt-2">{p.label}</p>
                    <p className="text-[10px] text-gray-600">Max {p.maxDur}s</p>
                  </button>);
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-blue-500/15"><MonitorPlay size={20} className="text-blue-400" /></div>
              <div><h2 className="text-lg font-bold">Video duration</h2><p className="text-xs text-gray-500">{PLATFORMS.find(p => p.id === state.platform)?.label} — up to {platformMaxDur}s</p></div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {DURATIONS.filter(d => d.value <= platformMaxDur).map(d => (
                <button key={d.value} onClick={() => update('duration', d.value)}
                  className={`glass-panel rounded-xl p-4 text-center transition-all ${state.duration === d.value ? 'border-cyan-500/40 bg-cyan-500/5' : 'hover:border-white/10'}`}>
                  <p className="text-2xl font-bold text-cyan-400">{d.label}</p><p className="text-[11px] text-gray-500 mt-1">{d.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-teal-500/15"><LayoutList size={20} className="text-teal-400" /></div>
              <div><h2 className="text-lg font-bold">Content type</h2><p className="text-xs text-gray-500">This shapes the AI's scriptwriting approach</p></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {CONTENT_TYPES.map(ct => (
                <button key={ct.id} onClick={() => update('contentType', ct.id)}
                  className={`glass-panel rounded-xl p-4 text-left transition-all ${state.contentType === ct.id ? 'border-cyan-500/40 bg-cyan-500/5' : 'hover:border-white/10'}`}>
                  <span className="text-2xl">{ct.icon}</span><p className="text-sm font-semibold mt-2">{ct.label}</p><p className="text-[11px] text-gray-500 mt-0.5">{ct.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-purple-500/15"><Palette size={20} className="text-purple-400" /></div>
              <div><h2 className="text-lg font-bold">Visual style</h2><p className="text-xs text-gray-500">This defines the look of generated images</p></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {VISUAL_STYLES.map(vs => (
                <button key={vs.id} onClick={() => update('visualStyle', vs.id)}
                  className={`glass-panel rounded-xl p-4 text-left transition-all ${state.visualStyle === vs.id ? 'border-cyan-500/40 bg-cyan-500/5' : 'hover:border-white/10'}`}>
                  <span className="text-2xl">{vs.icon}</span><p className="text-sm font-semibold mt-2">{vs.label}</p><p className="text-[11px] text-gray-500 mt-0.5">{vs.hint}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Steps 6-7: AI Generation ── */}
        {step === 6 && (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-yellow-500/15"><Zap size={20} className="text-yellow-400" /></div>
              <div><h2 className="text-lg font-bold">Generate AI Hook</h2><p className="text-xs text-gray-500">Attention-grabbing opening line</p></div>
            </div>
            <div className="glass-panel rounded-xl p-4 mb-4 text-xs text-gray-500">
              <p><strong>Topic:</strong> {state.topic}</p>
              <p><strong>Platform:</strong> {PLATFORMS.find(p => p.id === state.platform)?.label}</p>
              <p><strong>Type:</strong> {CONTENT_TYPES.find(c => c.id === state.contentType)?.label}</p>
            </div>
            {!state.hook ? (
              <button onClick={generateHook} disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {loading ? <Spinner /> : <Zap size={16} />}{loading ? 'Generating hook...' : 'Generate Hook with AI'}
              </button>
            ) : (
              <div className="glass-panel rounded-xl p-5 border border-cyan-500/20">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your Hook</p>
                <p className="text-lg font-bold text-cyan-400 leading-relaxed">"{state.hook}"</p>
                <button onClick={() => { update('hook', ''); setStepStatus(prev => ({ ...prev, 6: 'idle' })); }}
                  className="mt-3 text-xs text-gray-500 hover:text-white flex items-center gap-1"><RotateCcw size={12} /> Regenerate</button>
              </div>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-emerald-500/15"><Film size={20} className="text-emerald-400" /></div>
              <div><h2 className="text-lg font-bold">Generate Script & Scenes</h2><p className="text-xs text-gray-500">AI writes the full script with scene breakdowns</p></div>
            </div>
            {!state.scenes.length ? (
              <button onClick={generateScript} disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {loading ? <Spinner /> : <Film size={16} />}{loading ? 'Writing script...' : 'Generate Script with AI'}
              </button>
            ) : (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-cyan-400">{state.scriptTitle}</h3>
                <p className="text-xs text-gray-500">{state.scenes.length} scenes · ~{state.scenes.reduce((a, s) => a + s.duration, 0)}s</p>
                {state.scenes.map(scene => (
                  <div key={scene.scene_number} className="glass-panel rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-cyan-400">Scene {scene.scene_number}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-gray-400">{scene.duration}s</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1"><strong>Visual:</strong> {scene.visual_prompt}</p>
                    <p className="text-xs text-emerald-400/70 mb-1"><strong>Voiceover:</strong> {scene.voiceover}</p>
                    {scene.caption && <p className="text-[11px] text-gray-500 italic">Caption: {scene.caption}</p>}
                  </div>
                ))}
                <button onClick={() => { update('scenes', []); update('scriptTitle', ''); setStepStatus(prev => ({ ...prev, 7: 'idle', 8: 'idle', 9: 'idle' })); }}
                  className="text-xs text-gray-500 hover:text-white flex items-center gap-1 mt-2"><RotateCcw size={12} /> Regenerate</button>
              </div>
            )}
          </div>
        )}

        {/* ── Steps 8-9: Review ── */}
        {step === 8 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-indigo-500/15"><Clapperboard size={20} className="text-indigo-400" /></div>
              <div><h2 className="text-lg font-bold">Scene Breakdown</h2><p className="text-xs text-gray-500">Review scenes before generating images</p></div>
            </div>
            <div className="space-y-3">
              {state.scenes.map(scene => (
                <div key={scene.scene_number} className="glass-panel rounded-xl p-4 flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/15 grid place-items-center flex-shrink-0"><span className="text-sm font-bold text-indigo-400">{scene.scene_number}</span></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-white">{scene.duration}s</span><span className="text-[10px] text-gray-600">•</span><span className="text-[10px] text-gray-500 truncate">{scene.visual_prompt.slice(0, 60)}...</span></div>
                    <p className="text-xs text-gray-400 italic">"{scene.voiceover}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 9 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-orange-500/15"><Eye size={20} className="text-orange-400" /></div>
              <div><h2 className="text-lg font-bold">Visual Prompts</h2><p className="text-xs text-gray-500">AI-generated image prompts for each scene</p></div>
            </div>
            <div className="space-y-3">
              {state.scenes.map(scene => (
                <div key={scene.scene_number} className="glass-panel rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="text-sm font-bold text-orange-400">Scene {scene.scene_number}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-gray-400">{scene.duration}s</span></div>
                  <p className="text-sm text-gray-300 leading-relaxed">{scene.visual_prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 10: Generate Images ── */}
        {step === 10 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-cyan-500/15"><ImageIcon size={20} className="text-cyan-400" /></div>
              <div><h2 className="text-lg font-bold">Generate Scene Images</h2><p className="text-xs text-gray-500">Creating AI images for each scene ({state.scenes.length} total)</p></div>
            </div>
            {loading && sceneImageProgress.total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Scene {sceneImageProgress.current} of {sceneImageProgress.total}</span><span>{Math.round((sceneImageProgress.current / sceneImageProgress.total) * 100)}%</span></div>
                <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300" style={{ width: `${(sceneImageProgress.current / sceneImageProgress.total) * 100}%` }} /></div>
              </div>
            )}
            {state.sceneImages.length === 0 ? (
              <button onClick={generateAllSceneImages} disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {loading ? <Spinner /> : <ImageIcon size={16} />}{loading ? `Generating ${sceneImageProgress.current}/${sceneImageProgress.total}...` : `Generate ${state.scenes.length} Scene Images`}
              </button>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {state.sceneImages.map((img, i) => (
                  <div key={i} className="glass-panel rounded-xl overflow-hidden">
                    <img src={`data:image/png;base64,${img}`} alt={`Scene ${i + 1}`} className="w-full aspect-video object-contain bg-black/30" />
                    <div className="p-2"><p className="text-[11px] font-semibold text-cyan-400">Scene {i + 1}</p><p className="text-[10px] text-gray-500 truncate">{state.scenes[i]?.voiceover}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 11: Voice Selection & Voiceover Generation ── */}
        {step === 11 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-rose-500/15"><Mic size={20} className="text-rose-400" /></div>
              <div><h2 className="text-lg font-bold">Voice & Narration</h2><p className="text-xs text-gray-500">Choose a voice and generate AI voiceover for your scenes</p></div>
            </div>

            {/* Voice selector */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Voice</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {voices.map(v => (
                  <button key={v.id} onClick={() => update('selectedVoice', v.id)}
                    className={`glass-panel rounded-xl p-3 text-left transition-all ${state.selectedVoice === v.id ? 'border-cyan-500/40 bg-cyan-500/5' : 'hover:border-white/10'}`}>
                    <div className="flex items-center gap-2">
                      <Volume2 size={14} className={state.selectedVoice === v.id ? 'text-cyan-400' : 'text-gray-500'} />
                      <span className="text-sm font-semibold">{v.name}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{v.gender} · {v.style}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Voiceover preview */}
            {state.voiceoverDurations.length > 0 ? (
              <div className="space-y-2">
                <div className="glass-panel rounded-xl p-4 border border-emerald-500/20 flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-400">Voiceover generated!</p>
                    <p className="text-[11px] text-gray-500">{state.voiceoverDurations.length} clips · {state.voiceoverDurations.reduce((a, d) => a + d, 0).toFixed(1)}s total</p>
                  </div>
                </div>
                {state.voiceoverAudioUrls.map((url, i) => url && (
                  <div key={i} className="glass-panel rounded-lg p-3 flex items-center gap-3">
                    <span className="text-[10px] font-bold text-cyan-400 w-16">Scene {i + 1}</span>
                    <audio src={url} controls className="flex-1 h-8" />
                    <span className="text-[10px] text-gray-500">{state.voiceoverDurations[i]?.toFixed(1)}s</span>
                  </div>
                ))}
                <button onClick={generateVoiceover} disabled={loading}
                  className="text-xs text-gray-500 hover:text-white flex items-center gap-1 mt-2">
                  <RefreshCw size={12} /> Regenerate with different voice
                </button>
              </div>
            ) : (
              <button onClick={generateVoiceover} disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {loading ? <Spinner /> : <Mic size={16} />}{loading ? 'Generating voiceover...' : 'Generate Voiceover'}
              </button>
            )}
          </div>
        )}

        {/* ── Step 12: Caption Generation ── */}
        {step === 12 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-amber-500/15"><Subtitles size={20} className="text-amber-400" /></div>
              <div><h2 className="text-lg font-bold">Caption Style</h2><p className="text-xs text-gray-500">Choose how captions look and generate them</p></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {CAPTION_STYLES.map(cs => (
                <button key={cs.id} onClick={() => { update('captionStyle', cs.id); if (state.captions.length > 0) { update('captions', []); setStepStatus(prev => ({ ...prev, 12: 'idle', 13: 'idle' })); } }}
                  className={`glass-panel rounded-xl p-4 text-center transition-all ${state.captionStyle === cs.id ? 'border-cyan-500/40 bg-cyan-500/5' : 'hover:border-white/10'}`}>
                  <span className={`text-2xl font-bold ${cs.color}`}>{cs.icon}</span>
                  <p className="text-sm font-semibold mt-1">{cs.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{cs.desc}</p>
                </button>
              ))}
            </div>

            {/* Caption preview */}
            <div className="glass-panel rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Preview</p>
              <div className="bg-black rounded-lg p-6 text-center">
                <p className={`text-lg font-bold ${state.captionStyle === 'bold' ? 'text-white text-2xl' : state.captionStyle === 'highlight' ? 'text-yellow-300' : state.captionStyle === 'minimal' ? 'text-gray-400 text-base' : 'text-white'}`}
                  style={{ fontFamily: state.captionStyle === 'bold' ? 'Impact, sans-serif' : 'Arial, sans-serif' }}>
                  {state.scenes.length > 0 ? state.scenes[0].voiceover.split(' ').slice(0, 8).join(' ') + '...' : 'Your caption will appear here'}
                </p>
              </div>
            </div>

            {state.captions.length > 0 ? (
              <div className="glass-panel rounded-xl p-4 border border-emerald-500/20 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Captions generated!</p>
                  <p className="text-[11px] text-gray-500">{state.captions.length} caption entries in {state.captionStyle} style</p>
                </div>
              </div>
            ) : (
              <button onClick={generateCaptions} disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {loading ? <Spinner /> : <Subtitles size={16} />}{loading ? 'Generating captions...' : 'Generate Captions'}
              </button>
            )}
          </div>
        )}

        {/* ── Step 13: Caption Editor ── */}
        {step === 13 && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-violet-500/15"><Pencil size={20} className="text-violet-400" /></div>
              <div><h2 className="text-lg font-bold">Edit Captions</h2><p className="text-xs text-gray-500">Review and edit captions before burning into video</p></div>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {state.captions.map((cap, i) => (
                <div key={i} className="glass-panel rounded-lg p-3 flex items-center gap-3">
                  <span className="text-[10px] text-gray-600 w-8 text-center font-mono">{i + 1}</span>
                  <span className="text-[10px] text-cyan-400 font-mono w-24 flex-shrink-0">
                    {_fmtTime(cap.start_time)} → {_fmtTime(cap.end_time)}
                  </span>
                  <input
                    type="text"
                    value={cap.text}
                    onChange={e => {
                      const newCaps = [...state.captions];
                      newCaps[i] = { ...cap, text: e.target.value };
                      update('captions', newCaps);
                    }}
                    className="flex-1 bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                  />
                  <span className="text-[10px] text-gray-600">Scene {cap.scene_index + 1}</span>
                </div>
              ))}
            </div>

            {state.captions.length > 0 && (
              <p className="text-[11px] text-gray-600 mt-3">{state.captions.length} captions · {state.captionStyle} style · Click Next to burn into video</p>
            )}
          </div>
        )}

        {/* ── Step 14: Assemble + Burn Captions ── */}
        {step === 14 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-violet-500/15"><Wand2 size={20} className="text-violet-400" /></div>
              <div><h2 className="text-lg font-bold">Assemble & Burn Captions</h2><p className="text-xs text-gray-500">Combine images, voiceover, and captions into final MP4</p></div>
            </div>
            <div className="glass-panel rounded-xl p-4 mb-4 text-xs text-gray-500">
              <p><strong>Scenes:</strong> {state.scenes.length} · <strong>Voiceover:</strong> {state.voiceoverDurations.length > 0 ? `${state.voiceoverDurations.reduce((a, d) => a + d, 0).toFixed(1)}s` : 'None'} · <strong>Captions:</strong> {state.captions.length} entries ({state.captionStyle})</p>
              <p><strong>Platform:</strong> {PLATFORMS.find(p => p.id === state.platform)?.label} · <strong>Resolution:</strong> {state.platform === 'youtube' ? '1920×1080' : '1080×1920'}</p>
            </div>
            {!activeVideoUrl ? (
              <button onClick={assembleAndBurnCaptions} disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {loading ? <Spinner /> : <Wand2 size={16} />}{loading ? 'Assembling video & burning captions...' : 'Assemble Video & Burn Captions'}
              </button>
            ) : (
              <div className="glass-panel rounded-xl p-4 border border-emerald-500/20 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <div><p className="text-sm font-semibold text-emerald-400">Video ready with captions!</p><p className="text-[11px] text-gray-500">Ready for preview and download</p></div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 15: Preview ── */}
        {step === 15 && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-cyan-500/15"><Play size={20} className="text-cyan-400" /></div>
              <div><h2 className="text-lg font-bold">Preview Your Video</h2><p className="text-xs text-gray-500">{state.scriptTitle || state.topic}</p></div>
            </div>
            {activeVideoUrl ? (
              <div className="glass-panel rounded-xl overflow-hidden">
                <video src={activeVideoUrl} controls autoPlay className="w-full max-h-[600px] bg-black" />
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-16 text-center text-gray-600"><Play size={40} className="mx-auto mb-3 opacity-30" /><p>No video to preview yet</p></div>
            )}
          </div>
        )}

        {/* ── Step 16: Download ── */}
        {step === 16 && (
          <div className="max-w-xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl grid place-items-center bg-emerald-500/15 mx-auto mb-4"><CheckCircle2 size={32} className="text-emerald-400" /></div>
            <h2 className="text-xl font-bold mb-2">Your Video is Ready!</h2>
            <p className="text-sm text-gray-500 mb-6">{state.scriptTitle || state.topic} · {state.scenes.length} scenes · {state.voiceoverDurations.length > 0 ? `${state.voiceoverDurations.reduce((a, d) => a + d, 0).toFixed(0)}s voiceover` : `~${state.scenes.reduce((a, s) => a + s.duration, 0)}s`}</p>
            {activeVideoUrl && (
              <div className="space-y-3">
                <a href={activeVideoUrl} download className="btn-primary inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold"><Download size={16} />Download MP4</a>
                <div className="glass-panel rounded-xl p-4 mt-4 text-left">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Video Details</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <p><span className="text-gray-500">Platform:</span> <span className="text-white">{PLATFORMS.find(p => p.id === state.platform)?.label}</span></p>
                    <p><span className="text-gray-500">Voice:</span> <span className="text-white">{voices.find(v => v.id === state.selectedVoice)?.name || 'None'}</span></p>
                    <p><span className="text-gray-500">Captions:</span> <span className="text-white">{state.captionStyle} ({state.captions.length} entries)</span></p>
                    <p><span className="text-gray-500">Style:</span> <span className="text-white capitalize">{state.visualStyle}</span></p>
                  </div>
                </div>
                <button onClick={resetWorkflow} className="mt-4 text-xs text-gray-500 hover:text-white flex items-center gap-1 mx-auto"><RotateCcw size={12} /> Create Another Video</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-4">
        <button onClick={goBack} disabled={step === 1}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <ChevronLeft size={14} />Back
        </button>
        <span className="text-[11px] text-gray-600">Step {step} of {STEPS.length}</span>
        {step < 16 ? (
          <button onClick={goNext} disabled={!canAdvance() || loading}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            Next<ChevronRight size={14} />
          </button>
        ) : (
          <button onClick={resetWorkflow}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all">
            <Sparkles size={14} />New Video
          </button>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──
function _fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}
