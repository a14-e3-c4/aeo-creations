import { useState, useRef, useCallback } from 'react';
import {
  Clapperboard, Eye, Download, Film, Clock, Ratio, Monitor, Volume2,
} from 'lucide-react';
import { AI_MODELS, VIDEO_DURATIONS, RESOLUTIONS } from '@/lib/presets';
import type { Generation, StatusResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';

interface AIVideoTabProps {
  onRecordUsage: (action: string, model: string, status: string) => void;
  onSaveGeneration: (gen: Partial<Generation>) => Promise<Generation | null>;
}

const ASPECTS = [
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '1:1', label: '1:1 Square' },
];

export function AIVideoTab({ onRecordUsage, onSaveGeneration }: AIVideoTabProps) {
  const [model, setModel] = useState('openrouter');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState('16:9');
  const [resolution, setResolution] = useState('1080p');
  const [audio, setAudio] = useState(false);
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Select a model, enter a prompt, and generate real AI video.' });
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const showVideo = useCallback((url: string) => {
    setVideoUrl(url);
    setImageUrl(null);
  }, []);

  async function generate() {
    if (!prompt.trim()) {
      setStatus({ type: 'err', message: 'Enter a prompt first.' });
      return;
    }
    setLoading(true);
    setVideoUrl(null);
    setImageUrl(null);
    setStatus({ type: 'loading', message: 'Submitting video generation job...' });

    try {
      const resp = await fetch('/api/generate-ai-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, duration, aspect_ratio: aspect, resolution, audio }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStatus({ type: 'err', message: data.error || data.detail || 'Submission failed.' });
        onRecordUsage('ai-video', model, 'error');
        return;
      }

      if (data.video_url && !data.job_id) {
        showVideo(data.video_url);
        setStatus({ type: 'ok', message: 'Video generated!' });
        onRecordUsage('ai-video', model, 'ok');
        onSaveGeneration({
          type: 'ai-video', prompt, model, aspect_ratio: aspect, resolution,
          duration, media_url: data.video_url, status: 'completed',
        });
        return;
      }

      if (data.image_url) setImageUrl(data.image_url);

      if (data.job_id) {
        setStatus({ type: 'loading', message: `Rendering... Job: ${data.job_id}` });
        let attempts = 0;
        const maxAttempts = 120;
        stopPolling();
        pollRef.current = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            stopPolling();
            setStatus({ type: 'err', message: 'Timed out waiting for video.' });
            setLoading(false);
            return;
          }
          try {
            const pollResp = await fetch(`/api/video-status/${data.job_id}`);
            const pollData = await pollResp.json();
            if (pollData.status === 'completed' && pollData.video_url) {
              stopPolling();
              showVideo(pollData.video_url);
              setStatus({ type: 'ok', message: 'Video ready!' });
              setLoading(false);
              onRecordUsage('ai-video', model, 'ok');
              onSaveGeneration({
                type: 'ai-video', prompt, model, aspect_ratio: aspect, resolution,
                duration, media_url: pollData.video_url, status: 'completed',
              });
            } else if (pollData.status === 'failed') {
              stopPolling();
              setStatus({ type: 'err', message: `Failed: ${pollData.error || 'Unknown error'}` });
              setLoading(false);
              onRecordUsage('ai-video', model, 'error');
            } else {
              setStatus({ type: 'loading', message: `Processing... (${attempts}/${maxAttempts})` });
            }
          } catch {
            // keep polling
          }
        }, 5000);
        return;
      }

      setStatus({ type: 'err', message: 'No job ID returned.' });
      onRecordUsage('ai-video', model, 'error');
    } catch (e) {
      setStatus({ type: 'err', message: `Network error: ${(e as Error).message}` });
      onRecordUsage('ai-video', model, 'error');
    } finally {
      if (!pollRef.current) setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1400px] mx-auto">
      {/* Input Panel */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-rose-500/15">
            <Clapperboard size={16} className="text-rose-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">AI Video Generator</h2>
        </div>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
          Generate real AI videos from text prompts. Supports Veo, Wan, FLUX, Kling, Seedance, and more.
        </p>

        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">AI Model</label>
        <select value={model} onChange={e => setModel(e.target.value)} className="input-field cursor-pointer mb-4">
          {AI_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.group} — {m.label}</option>
          ))}
        </select>

        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="A golden retriever running on a beach at sunset, cinematic slow motion, 4K quality..."
          className="input-field min-h-[88px] resize-y leading-relaxed"
        />

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Clock size={11} /> Duration
            </label>
            <select value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="input-field cursor-pointer">
              {VIDEO_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Ratio size={11} /> Aspect Ratio
            </label>
            <select value={aspect} onChange={e => setAspect(e.target.value)} className="input-field cursor-pointer">
              {ASPECTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Monitor size={11} /> Resolution
            </label>
            <select value={resolution} onChange={e => setResolution(e.target.value)} className="input-field cursor-pointer">
              {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Volume2 size={11} /> Audio
            </label>
            <select value={audio ? 'true' : 'false'} onChange={e => setAudio(e.target.value === 'true')} className="input-field cursor-pointer">
              <option value="false">No audio</option>
              <option value="true">With audio</option>
            </select>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="btn-primary w-full mt-4 py-3 rounded-[10px] text-[13px] font-bold tracking-wide flex items-center justify-center gap-2"
        >
          {loading ? <Spinner /> : <Film size={15} />}
          {loading ? 'Generating...' : 'Generate AI Video'}
        </button>
        <StatusBadge status={status} />
      </div>

      {/* Preview Panel */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-emerald-500/15">
            <Eye size={16} className="text-emerald-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Preview</h2>
        </div>
        <div className="bg-black rounded-2xl aspect-video flex items-center justify-center overflow-hidden relative border border-white/[0.06]">
          {videoUrl ? (
            <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
          ) : imageUrl ? (
            <img src={imageUrl} alt="Preview" className="w-full h-full object-contain" />
          ) : (
            <div className="text-center text-gray-600 text-[13px] px-10 py-10 leading-relaxed">
              <Film size={40} className="mx-auto mb-3 opacity-40" />
              Your AI-generated video will appear here
              <span className="block text-[11px] opacity-60 mt-1">Real AI video — actual motion & scene generation</span>
            </div>
          )}
          {loading && !videoUrl && (
            <div className="absolute inset-0 bg-black/50 grid place-items-center">
              <div className="text-center">
                <Spinner size={32} />
                <p className="text-xs text-gray-400 mt-2">Rendering...</p>
              </div>
            </div>
          )}
        </div>
        {videoUrl && (
          <a
            href={videoUrl}
            download="ai_video.mp4"
            className="btn-primary inline-flex items-center gap-2 mt-3 px-5 py-2.5 rounded-[10px] text-xs font-semibold"
          >
            <Download size={14} />
            Download Video
          </a>
        )}
      </div>
    </div>
  );
}
