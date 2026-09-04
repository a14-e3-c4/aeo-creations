import { useState } from 'react';
import { Video, Scissors, Link2, Film, Clock } from 'lucide-react';
import type { LibraryItem, StatusResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';

interface VideoTabProps {
  library: LibraryItem[];
  onRecordUsage: (action: string, model: string, status: string) => void;
}

export function VideoTab({ library, onRecordUsage }: VideoTabProps) {
  const [trimStart, setTrimStart] = useState('0');
  const [trimEnd, setTrimEnd] = useState('-1');
  const [trimFile, setTrimFile] = useState('');
  const [transitionType, setTransitionType] = useState('fade');
  const [transitionDur, setTransitionDur] = useState('1.0');
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Select a video from your library to trim or combine.' });
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const videoFiles = library.filter(item => item.type === 'video');

  async function trim() {
    if (!trimFile) {
      setStatus({ type: 'err', message: 'Select a video first.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'loading', message: 'Trimming video...' });
    try {
      const resp = await fetch('/api/trim-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: trimFile,
          start_time: parseFloat(trimStart) || 0,
          end_time: parseFloat(trimEnd) || -1,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStatus({ type: 'err', message: data.error || data.detail || 'Trim failed.' });
        onRecordUsage('trim', 'ffmpeg', 'error');
        return;
      }
      setResultUrl(data.file);
      setStatus({ type: 'ok', message: `Trimmed! ${data.duration?.toFixed(1)}s` });
      onRecordUsage('trim', 'ffmpeg', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('trim', 'ffmpeg', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function combine() {
    if (selectedClips.length < 2) {
      setStatus({ type: 'err', message: 'Select at least 2 video clips.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'loading', message: 'Combining clips...' });
    try {
      const resp = await fetch('/api/combine-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_paths: selectedClips,
          transition_type: transitionType,
          transition_duration: parseFloat(transitionDur),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStatus({ type: 'err', message: data.error || data.detail || 'Combine failed.' });
        onRecordUsage('combine', 'ffmpeg', 'error');
        return;
      }
      setResultUrl(data.file);
      setStatus({ type: 'ok', message: 'Clips combined!' });
      onRecordUsage('combine', 'ffmpeg', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('combine', 'ffmpeg', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[800px] mx-auto">
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-rose-500/15">
            <Video size={16} className="text-rose-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Video Tools</h2>
        </div>
        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
          Trim videos, add transitions between clips, and combine scenes.
        </p>

        {/* Trim section */}
        <div className="border-t border-white/[0.06] pt-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <Scissors size={16} className="text-cyan-400" />
            Trim Video
          </h3>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Video File</label>
          <select value={trimFile} onChange={e => setTrimFile(e.target.value)} className="input-field cursor-pointer mb-4">
            <option value="">Select from library...</option>
            {videoFiles.map(f => (
              <option key={f.id} value={f.url}>{f.filename}</option>
            ))}
          </select>
          <div className="flex gap-3 items-end mb-4">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock size={11} /> Start (s)
              </label>
              <input type="text" value={trimStart} onChange={e => setTrimStart(e.target.value)} className="input-field" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">End (s, -1=full)</label>
              <input type="text" value={trimEnd} onChange={e => setTrimEnd(e.target.value)} className="input-field" />
            </div>
            <button
              onClick={trim}
              disabled={loading}
              className="btn-primary px-4 py-2.5 rounded-[10px] text-xs font-bold whitespace-nowrap flex items-center gap-2"
            >
              {loading ? <Spinner /> : <Scissors size={14} />}
              Trim
            </button>
          </div>
        </div>

        {/* Combine section */}
        <div className="border-t border-white/[0.06] pt-5 mt-4">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <Link2 size={16} className="text-teal-400" />
            Combine with Transitions
          </h3>
          {videoFiles.length < 2 ? (
            <p className="text-xs text-gray-600 mb-4">Upload at least 2 video clips to combine them.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {videoFiles.map(f => (
                <label key={f.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] bg-[#0a0a12] border border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-all">
                  <input
                    type="checkbox"
                    checked={selectedClips.includes(f.url)}
                    onChange={e => {
                      if (e.target.checked) setSelectedClips(prev => [...prev, f.url]);
                      else setSelectedClips(prev => prev.filter(c => c !== f.url));
                    }}
                    className="accent-cyan-400"
                  />
                  <Film size={14} className="text-gray-500" />
                  <span className="text-xs text-gray-400 truncate">{f.filename}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Transition</label>
              <select value={transitionType} onChange={e => setTransitionType(e.target.value)} className="input-field cursor-pointer">
                <option value="fade">Fade</option>
                <option value="dissolve">Dissolve</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Duration (s)</label>
              <input type="text" value={transitionDur} onChange={e => setTransitionDur(e.target.value)} className="input-field" />
            </div>
            <button
              onClick={combine}
              disabled={loading}
              className="btn-primary px-4 py-2.5 rounded-[10px] text-xs font-bold whitespace-nowrap flex items-center gap-2"
            >
              {loading ? <Spinner /> : <Link2 size={14} />}
              Combine
            </button>
          </div>
        </div>

        <StatusBadge status={status} />

        {resultUrl && (
          <div className="mt-4">
            <div className="bg-black rounded-2xl aspect-video overflow-hidden border border-white/[0.06]">
              <video src={resultUrl} controls autoPlay loop className="w-full h-full object-contain" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
