import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Film, Wand2, Check, ChevronRight, ChevronLeft,
  Download, Play, RotateCcw, AlertCircle, CheckCircle2,
  Loader2, Copy, Eye, Zap, Target, Image as ImageIcon,
  Type, LayoutList, Clapperboard, Palette, MonitorPlay,
  Smartphone, Youtube, Instagram, Video as VideoIcon,
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
  { id: 11, label: 'Assemble', icon: Wand2 },
  { id: 12, label: 'Preview', icon: Play },
  { id: 13, label: 'Download', icon: Download },
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

// ── Types ────────────────────────────────────────────────────────────────────

interface SceneData {
  scene_number: number;
  duration: number;
  visual_prompt: string;
  voiceover: string;
  caption: string;
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
  sceneImages: string[]; // base64
  finalVideoUrl: string | null;
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
  finalVideoUrl: null,
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

  // Helper to update state
  const update = <K extends keyof WorkflowState>(key: K, value: WorkflowState[K]) =>
    setState(prev => ({ ...prev, [key]: value }));

  const platformMaxDur = PLATFORMS.find(p => p.id === state.platform)?.maxDur ?? 60;
  const effectiveDuration = Math.min(state.duration, platformMaxDur);

  // ── Step navigation ──────────────────────────────────────────────────────

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
      case 11: return !!state.finalVideoUrl;
      case 12: return !!state.finalVideoUrl;
      default: return false;
    }
  };

  const goNext = () => {
    if (step < 13 && canAdvance()) {
      setStep(s => s + 1);
      setError(null);
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep(s => s - 1);
      setError(null);
    }
  };

  // ── Step actions ─────────────────────────────────────────────────────────

  const generateHook = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStepStatus(prev => ({ ...prev, 6: 'loading' }));
    try {
      const resp = await fetch('/api/create-video/generate-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: state.topic,
          platform: state.platform,
          content_type: state.contentType,
          visual_style: state.visualStyle,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed');
      update('hook', data.hook);
      setStepStatus(prev => ({ ...prev, 6: 'done' }));
      onRecordUsage('create-video-hook', 'groq', 'ok');
    } catch (e) {
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 6: 'error' }));
      onRecordUsage('create-video-hook', 'groq', 'error');
    } finally {
      setLoading(false);
    }
  }, [state.topic, state.platform, state.contentType, state.visualStyle, onRecordUsage]);

  const generateScript = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStepStatus(prev => ({ ...prev, 7: 'loading' }));
    try {
      const resp = await fetch('/api/create-video/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: state.topic,
          platform: state.platform,
          duration: effectiveDuration,
          content_type: state.contentType,
          visual_style: state.visualStyle,
          hook: state.hook,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed');
      update('scriptTitle', data.title);
      update('scenes', data.scenes);
      setFullScript(data.full_script);
      setStepStatus(prev => ({ ...prev, 7: 'done', 8: 'done', 9: 'done' }));
      onRecordUsage('create-video-script', 'groq', 'ok');
    } catch (e) {
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 7: 'error' }));
      onRecordUsage('create-video-script', 'groq', 'error');
    } finally {
      setLoading(false);
    }
  }, [state.topic, state.platform, effectiveDuration, state.contentType, state.visualStyle, state.hook, onRecordUsage]);

  const generateAllSceneImages = useCallback(async () => {
    setLoading(true);
    setError(null);
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
          body: JSON.stringify({
            scene_index: i,
            visual_prompt: scene.visual_prompt,
            style: state.visualStyle,
            width: 1920,
            height: 1080,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`Scene ${i + 1}: ${data.detail || 'Failed'}`);
        images.push(data.image_b64);
      }
      update('sceneImages', images);
      setStepStatus(prev => ({ ...prev, 10: 'done' }));
      onRecordUsage('create-video-scenes', 'pollinations', 'ok');
    } catch (e) {
      // Save what we have so far
      update('sceneImages', images);
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 10: images.length > 0 ? 'done' : 'error' }));
      onRecordUsage('create-video-scenes', 'pollinations', 'error');
    } finally {
      setLoading(false);
    }
  }, [state.scenes, state.visualStyle, onRecordUsage]);

  const assembleVideo = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStepStatus(prev => ({ ...prev, 11: 'loading' }));
    try {
      const jobId = crypto.randomUUID().slice(0, 12);
      const resp = await fetch('/api/create-video/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          scene_images: state.sceneImages,
          scene_durations: state.scenes.map(s => s.duration),
          scene_voiceovers: state.scenes.map(s => s.voiceover),
          scene_captions: state.scenes.map(s => s.caption),
          platform: state.platform,
          title: state.scriptTitle || state.topic,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Failed');
      update('finalVideoUrl', data.video_url);
      setStepStatus(prev => ({ ...prev, 11: 'done' }));
      onRecordUsage('create-video-assemble', 'moviepy', 'ok');
    } catch (e) {
      setError((e as Error).message);
      setStepStatus(prev => ({ ...prev, 11: 'error' }));
      onRecordUsage('create-video-assemble', 'moviepy', 'error');
    } finally {
      setLoading(false);
    }
  }, [state.sceneImages, state.scenes, state.platform, state.scriptTitle, state.topic, onRecordUsage]);

  const resetWorkflow = () => {
    setState(EMPTY_STATE);
    setStep(1);
    setStepStatus({});
    setError(null);
    setFullScript('');
    setSceneImageProgress({ current: 0, total: 0 });
  };

  // ── Render ─────────────────────────────────────────────────────────────

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
                  onClick={() => {
                    if (s.id <= step || isDone) setStep(s.id);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                      : isDone
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-gray-600 border border-transparent hover:text-gray-400'
                  }`}
                >
                  {isDone && !isActive ? (
                    <CheckCircle2 size={13} />
                  ) : status === 'loading' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Icon size={13} />
                  )}
                  <span className="hidden md:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-gray-700 mx-0.5 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="w-full h-1 bg-surface-3 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="glass-panel rounded-xl p-4 mb-4 border border-rose-500/30 flex items-start gap-3">
          <AlertCircle size={18} className="text-rose-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-gray-500 hover:text-white text-xs">Dismiss</button>
        </div>
      )}

      {/* Step content */}
      <div className="glass-panel rounded-2xl p-6 min-h-[500px]">
        {/* ── Step 1: Topic ── */}
        {step === 1 && (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-cyan-500/15">
                <Type size={20} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">What's your video about?</h2>
                <p className="text-xs text-gray-500">Enter a topic, idea, or description for your video</p>
              </div>
            </div>
            <textarea
              value={state.topic}
              onChange={e => update('topic', e.target.value)}
              placeholder="e.g. How to make the perfect espresso at home, 5 tips for better sleep, The history of space exploration..."
              className="input-field min-h-[120px] resize-y leading-relaxed mt-4"
              autoFocus
            />
            <p className="text-[11px] text-gray-600 mt-2">{state.topic.length}/500 characters</p>
          </div>
        )}

        {/* ── Step 2: Platform ── */}
        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-pink-500/15">
                <Smartphone size={20} className="text-pink-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Choose your platform</h2>
                <p className="text-xs text-gray-500">Each platform has different dimensions and duration limits</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {PLATFORMS.map(p => {
                const Icon = p.icon;
                const selected = state.platform === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      update('platform', p.id);
                      if (state.duration > p.maxDur) update('duration', Math.min(60, p.maxDur));
                    }}
                    className={`glass-panel rounded-xl p-4 text-left transition-all ${
                      selected
                        ? 'border-cyan-500/40 bg-cyan-500/5'
                        : 'hover:border-white/10'
                    }`}
                  >
                    <Icon size={24} className={selected ? p.color : 'text-gray-500'} />
                    <p className="text-sm font-semibold mt-2">{p.label}</p>
                    <p className="text-[10px] text-gray-600">Max {p.maxDur}s</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 3: Duration ── */}
        {step === 3 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-blue-500/15">
                <MonitorPlay size={20} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Video duration</h2>
                <p className="text-xs text-gray-500">
                  {PLATFORMS.find(p => p.id === state.platform)?.label} allows up to {platformMaxDur}s
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {DURATIONS.filter(d => d.value <= platformMaxDur).map(d => (
                <button
                  key={d.value}
                  onClick={() => update('duration', d.value)}
                  className={`glass-panel rounded-xl p-4 text-center transition-all ${
                    state.duration === d.value
                      ? 'border-cyan-500/40 bg-cyan-500/5'
                      : 'hover:border-white/10'
                  }`}
                >
                  <p className="text-2xl font-bold text-cyan-400">{d.label}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{d.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 4: Content Type ── */}
        {step === 4 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-teal-500/15">
                <LayoutList size={20} className="text-teal-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Content type</h2>
                <p className="text-xs text-gray-500">This shapes the AI's scriptwriting approach</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {CONTENT_TYPES.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => update('contentType', ct.id)}
                  className={`glass-panel rounded-xl p-4 text-left transition-all ${
                    state.contentType === ct.id
                      ? 'border-cyan-500/40 bg-cyan-500/5'
                      : 'hover:border-white/10'
                  }`}
                >
                  <span className="text-2xl">{ct.icon}</span>
                  <p className="text-sm font-semibold mt-2">{ct.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{ct.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 5: Visual Style ── */}
        {step === 5 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-purple-500/15">
                <Palette size={20} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Visual style</h2>
                <p className="text-xs text-gray-500">This defines the look and feel of generated images</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {VISUAL_STYLES.map(vs => (
                <button
                  key={vs.id}
                  onClick={() => update('visualStyle', vs.id)}
                  className={`glass-panel rounded-xl p-4 text-left transition-all ${
                    state.visualStyle === vs.id
                      ? 'border-cyan-500/40 bg-cyan-500/5'
                      : 'hover:border-white/10'
                  }`}
                >
                  <span className="text-2xl">{vs.icon}</span>
                  <p className="text-sm font-semibold mt-2">{vs.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{vs.hint}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 6: Generate Hook ── */}
        {step === 6 && (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-yellow-500/15">
                <Zap size={20} className="text-yellow-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Generate AI Hook</h2>
                <p className="text-xs text-gray-500">An attention-grabbing opening line for your video</p>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4 mb-4 text-xs text-gray-500">
              <p><strong>Topic:</strong> {state.topic}</p>
              <p><strong>Platform:</strong> {PLATFORMS.find(p => p.id === state.platform)?.label}</p>
              <p><strong>Type:</strong> {CONTENT_TYPES.find(c => c.id === state.contentType)?.label}</p>
              <p><strong>Style:</strong> {VISUAL_STYLES.find(v => v.id === state.visualStyle)?.label}</p>
            </div>
            {!state.hook ? (
              <button
                onClick={generateHook}
                disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                {loading ? <Spinner /> : <Zap size={16} />}
                {loading ? 'Generating hook...' : 'Generate Hook with AI'}
              </button>
            ) : (
              <div className="glass-panel rounded-xl p-5 border border-cyan-500/20">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your Hook</p>
                <p className="text-lg font-bold text-cyan-400 leading-relaxed">"{state.hook}"</p>
                <button
                  onClick={() => { update('hook', ''); setStepStatus(prev => ({ ...prev, 6: 'idle' })); }}
                  className="mt-3 text-xs text-gray-500 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw size={12} /> Regenerate
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 7: Generate Script ── */}
        {step === 7 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-emerald-500/15">
                <Film size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Generate Script & Scenes</h2>
                <p className="text-xs text-gray-500">AI writes the full script with scene breakdowns</p>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4 mb-4 text-xs text-gray-500">
              <p><strong>Hook:</strong> "{state.hook}"</p>
              <p><strong>Duration:</strong> {effectiveDuration}s · <strong>Platform:</strong> {state.platform}</p>
            </div>
            {!state.scenes.length ? (
              <button
                onClick={generateScript}
                disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                {loading ? <Spinner /> : <Film size={16} />}
                {loading ? 'Writing script...' : 'Generate Script with AI'}
              </button>
            ) : (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-cyan-400">{state.scriptTitle}</h3>
                <p className="text-xs text-gray-500">{state.scenes.length} scenes · ~{state.scenes.reduce((a, s) => a + s.duration, 0)}s total</p>
                {state.scenes.map(scene => (
                  <div key={scene.scene_number} className="glass-panel rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-cyan-400">Scene {scene.scene_number}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-gray-400">{scene.duration}s</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1"><strong>Visual:</strong> {scene.visual_prompt}</p>
                    <p className="text-xs text-emerald-400/70 mb-1"><strong>Voiceover:</strong> {scene.voiceover}</p>
                    {scene.caption && <p className="text-[11px] text-gray-500 italic">Caption: {scene.caption}</p>}
                  </div>
                ))}
                <button
                  onClick={() => { update('scenes', []); update('scriptTitle', ''); setStepStatus(prev => ({ ...prev, 7: 'idle', 8: 'idle', 9: 'idle' })); }}
                  className="text-xs text-gray-500 hover:text-white flex items-center gap-1 mt-2"
                >
                  <RotateCcw size={12} /> Regenerate
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 8: Review Scenes ── */}
        {step === 8 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-indigo-500/15">
                <Clapperboard size={20} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Scene Breakdown</h2>
                <p className="text-xs text-gray-500">Review your scenes before generating images</p>
              </div>
            </div>
            <div className="space-y-3">
              {state.scenes.map(scene => (
                <div key={scene.scene_number} className="glass-panel rounded-xl p-4 flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/15 grid place-items-center flex-shrink-0">
                    <span className="text-sm font-bold text-indigo-400">{scene.scene_number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-white">{scene.duration}s</span>
                      <span className="text-[10px] text-gray-600">•</span>
                      <span className="text-[10px] text-gray-500 truncate">{scene.visual_prompt.slice(0, 60)}...</span>
                    </div>
                    <p className="text-xs text-gray-400 italic">"{scene.voiceover}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 9: Visual Prompts ── */}
        {step === 9 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-orange-500/15">
                <Eye size={20} className="text-orange-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Visual Prompts</h2>
                <p className="text-xs text-gray-500">AI-generated image prompts for each scene</p>
              </div>
            </div>
            <div className="space-y-3">
              {state.scenes.map(scene => (
                <div key={scene.scene_number} className="glass-panel rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-orange-400">Scene {scene.scene_number}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-gray-400">{scene.duration}s</span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{scene.visual_prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 10: Generate Scene Images ── */}
        {step === 10 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-cyan-500/15">
                <ImageIcon size={20} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Generate Scene Images</h2>
                <p className="text-xs text-gray-500">Creating AI images for each scene ({state.scenes.length} total)</p>
              </div>
            </div>
            {loading && sceneImageProgress.total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Generating scene {sceneImageProgress.current} of {sceneImageProgress.total}</span>
                  <span>{Math.round((sceneImageProgress.current / sceneImageProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${(sceneImageProgress.current / sceneImageProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {state.sceneImages.length === 0 ? (
              <button
                onClick={generateAllSceneImages}
                disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                {loading ? <Spinner /> : <ImageIcon size={16} />}
                {loading ? `Generating scene ${sceneImageProgress.current}/${sceneImageProgress.total}...` : `Generate ${state.scenes.length} Scene Images`}
              </button>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {state.sceneImages.map((img, i) => (
                  <div key={i} className="glass-panel rounded-xl overflow-hidden">
                    <img
                      src={`data:image/png;base64,${img}`}
                      alt={`Scene ${i + 1}`}
                      className="w-full aspect-video object-contain bg-black/30"
                    />
                    <div className="p-2">
                      <p className="text-[11px] font-semibold text-cyan-400">Scene {i + 1}</p>
                      <p className="text-[10px] text-gray-500 truncate">{state.scenes[i]?.voiceover}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {state.sceneImages.length > 0 && state.sceneImages.length < state.scenes.length && (
              <button
                onClick={generateAllSceneImages}
                disabled={loading}
                className="mt-3 w-full py-2 rounded-xl text-xs font-medium border border-white/10 text-gray-400 hover:text-white hover:border-cyan-500/30 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={13} />
                Regenerate Missing Scenes ({state.scenes.length - state.sceneImages.length} remaining)
              </button>
            )}
          </div>
        )}

        {/* ── Step 11: Assemble Video ── */}
        {step === 11 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-violet-500/15">
                <Wand2 size={20} className="text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Assemble Final Video</h2>
                <p className="text-xs text-gray-500">Combine all scene images into a polished MP4</p>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4 mb-4 text-xs text-gray-500">
              <p><strong>Scenes:</strong> {state.scenes.length} · <strong>Duration:</strong> ~{state.scenes.reduce((a, s) => a + s.duration, 0)}s</p>
              <p><strong>Platform:</strong> {PLATFORMS.find(p => p.id === state.platform)?.label}</p>
              <p><strong>Resolution:</strong> {state.platform === 'youtube' ? '1920×1080' : '1080×1920'}</p>
            </div>
            {!state.finalVideoUrl ? (
              <button
                onClick={assembleVideo}
                disabled={loading}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                {loading ? <Spinner /> : <Wand2 size={16} />}
                {loading ? 'Assembling video...' : 'Assemble Final Video'}
              </button>
            ) : (
              <div className="glass-panel rounded-xl p-4 border border-emerald-500/20 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Video assembled successfully!</p>
                  <p className="text-[11px] text-gray-500">Ready for preview and download</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 12: Preview ── */}
        {step === 12 && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-cyan-500/15">
                <Play size={20} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Preview Your Video</h2>
                <p className="text-xs text-gray-500">{state.scriptTitle || state.topic}</p>
              </div>
            </div>
            {state.finalVideoUrl ? (
              <div className="glass-panel rounded-xl overflow-hidden">
                <video
                  src={state.finalVideoUrl}
                  controls
                  autoPlay
                  className="w-full max-h-[600px] bg-black"
                />
              </div>
            ) : (
              <div className="glass-panel rounded-xl p-16 text-center text-gray-600">
                <Play size={40} className="mx-auto mb-3 opacity-30" />
                <p>No video to preview yet</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 13: Download ── */}
        {step === 13 && (
          <div className="max-w-xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl grid place-items-center bg-emerald-500/15 mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Your Video is Ready!</h2>
            <p className="text-sm text-gray-500 mb-6">
              {state.scriptTitle || state.topic} · {state.scenes.length} scenes · ~{state.scenes.reduce((a, s) => a + s.duration, 0)}s
            </p>
            {state.finalVideoUrl && (
              <div className="space-y-3">
                <a
                  href={state.finalVideoUrl}
                  download
                  className="btn-primary inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold"
                >
                  <Download size={16} />
                  Download MP4
                </a>
                <div className="glass-panel rounded-xl p-4 mt-4 text-left">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Video Details</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <p><span className="text-gray-500">Platform:</span> <span className="text-white">{PLATFORMS.find(p => p.id === state.platform)?.label}</span></p>
                    <p><span className="text-gray-500">Duration:</span> <span className="text-white">~{state.scenes.reduce((a, s) => a + s.duration, 0)}s</span></p>
                    <p><span className="text-gray-500">Scenes:</span> <span className="text-white">{state.scenes.length}</span></p>
                    <p><span className="text-gray-500">Style:</span> <span className="text-white capitalize">{state.visualStyle}</span></p>
                  </div>
                </div>
                <button
                  onClick={resetWorkflow}
                  className="mt-4 text-xs text-gray-500 hover:text-white flex items-center gap-1 mx-auto"
                >
                  <RotateCcw size={12} /> Create Another Video
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={goBack}
          disabled={step === 1}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft size={14} />
          Back
        </button>
        <span className="text-[11px] text-gray-600">Step {step} of {STEPS.length}</span>
        {step < 13 ? (
          <button
            onClick={goNext}
            disabled={!canAdvance() || loading}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Next
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            onClick={resetWorkflow}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all"
          >
            <Sparkles size={14} />
            New Video
          </button>
        )}
      </div>
    </div>
  );
}
