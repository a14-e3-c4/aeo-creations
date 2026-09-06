import { useState, useRef, useCallback } from 'react';
import {
  Video, Scissors, Link2, Film, Clock, Upload, Play, Trash2,
  GripVertical, ArrowUpDown, Download, Loader2, SplitSquareHorizontal,
} from 'lucide-react';
import type { LibraryItem, StatusResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';

interface VideoTabProps {
  library: LibraryItem[];
  onRecordUsage: (action: string, model: string, status: string) => void;
}

// ── Transition types ───────────────────────────────────────────────
const TRANSITIONS = [
  { id: 'fade', label: 'Fade', icon: '🎬', desc: 'Smooth fade between clips' },
  { id: 'dissolve', label: 'Dissolve', icon: '✨', desc: 'Cross-dissolve blend' },
  { id: 'wipe-left', label: 'Wipe Left', icon: '⬅️', desc: 'Left-to-right wipe' },
  { id: 'wipe-right', label: 'Wipe Right', icon: '➡️', desc: 'Right-to-left wipe' },
  { id: 'slide-left', label: 'Slide Left', icon: '🎦', desc: 'Slide in from right' },
  { id: 'slide-right', label: 'Slide Right', icon: '🎦', desc: 'Slide in from left' },
  { id: 'zoom-in', label: 'Zoom In', icon: '🔍', desc: 'Zoom into next clip' },
  { id: 'blur', label: 'Blur', icon: '🌫️', desc: 'Blur transition' },
];

interface ClipItem {
  url: string;
  filename: string;
  selected: boolean;
}

export function VideoTab({ library, onRecordUsage }: VideoTabProps) {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [trimStart, setTrimStart] = useState('0');
  const [trimEnd, setTrimEnd] = useState('-1');
  const [trimFile, setTrimFile] = useState('');
  const [selectedTransition, setSelectedTransition] = useState('fade');
  const [transitionDur, setTransitionDur] = useState('1.0');
  const [splitFile, setSplitFile] = useState('');
  const [splitTime, setSplitTime] = useState('0');
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Upload videos or select from library to start editing.' });
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync library videos into clips
  const videoFiles = library.filter(item => item.type === 'video');

  // ── Upload video ──────────────────────────────────────────────────
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    setStatus({ type: 'loading', message: `Uploading ${files.length} video(s)...` });

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('video/')) {
          setStatus({ type: 'err', message: `"${file.name}" is not a video file.` });
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        const resp = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
        const data = await resp.json();
        setClips(prev => [...prev, { url: data.url || data.file, filename: file.name, selected: false }]);
      }
      setStatus({ type: 'ok', message: `Uploaded ${files.length} video(s) successfully!` });
      onRecordUsage('upload', 'video', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Upload failed: ${(e as Error).message}` });
      onRecordUsage('upload', 'video', 'error');
    } finally {
      setLoading(false);
    }
  }, [onRecordUsage]);

  // ── Drag & Drop ──────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  // ── Trim ─────────────────────────────────────────────────────────
  async function trim() {
    const filePath = trimFile || clips.find(c => c.selected)?.url;
    if (!filePath) {
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
          file_path: filePath,
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
      // Add trimmed clip to list
      setClips(prev => [...prev, { url: data.file, filename: `trimmed_${Date.now()}.mp4`, selected: false }]);
      setStatus({ type: 'ok', message: `Trimmed! ${data.duration?.toFixed(1)}s` });
      onRecordUsage('trim', 'ffmpeg', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('trim', 'ffmpeg', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Split ─────────────────────────────────────────────────────────
  async function split() {
    const filePath = splitFile || clips.find(c => c.selected)?.url;
    if (!filePath) {
      setStatus({ type: 'err', message: 'Select a video to split.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'loading', message: `Splitting at ${splitTime}s...` });
    try {
      const resp = await fetch('/api/split-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath, split_time: parseFloat(splitTime) || 0 }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStatus({ type: 'err', message: data.error || data.detail || 'Split failed.' });
        onRecordUsage('split', 'ffmpeg', 'error');
        return;
      }
      setClips(prev => [...prev,
        { url: data.clip1, filename: 'Part 1', selected: false },
        { url: data.clip2, filename: 'Part 2', selected: false },
      ]);
      setStatus({ type: 'ok', message: `Split into 2 clips at ${splitTime}s!` });
      onRecordUsage('split', 'ffmpeg', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('split', 'ffmpeg', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Combine with transitions ─────────────────────────────────────
  async function combine() {
    const selected = clips.filter(c => c.selected);
    if (selected.length < 2) {
      setStatus({ type: 'err', message: 'Select at least 2 clips to combine.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'loading', message: `Combining ${selected.length} clips with ${selectedTransition} transition...` });
    try {
      const resp = await fetch('/api/combine-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_paths: selected.map(c => c.url),
          transition_type: selectedTransition,
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
      setClips(prev => [...prev, { url: data.file, filename: 'Combined', selected: false }]);
      setStatus({ type: 'ok', message: 'Clips combined with transitions!' });
      onRecordUsage('combine', 'ffmpeg', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('combine', 'ffmpeg', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Move clip up/down ────────────────────────────────────────────
  function moveClip(idx: number, dir: -1 | 1) {
    setClips(prev => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  // ── Toggle clip selection ────────────────────────────────────────
  function toggleClip(idx: number) {
    setClips(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  }

  // ── Delete clip ──────────────────────────────────────────────────
  function removeClip(idx: number) {
    setClips(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Load from library into clips ─────────────────────────────────
  function loadFromLibrary() {
    const newClips = videoFiles.map(f => ({ url: f.url, filename: f.filename, selected: false }));
    setClips(prev => [...prev, ...newClips]);
    setStatus({ type: 'ok', message: `Loaded ${newClips.length} clip(s) from library` });
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* ── Upload Area ───────────────────────────────────────────── */}
      <div
        className={`glass-panel rounded-2xl p-6 border-2 border-dashed transition-all cursor-pointer ${
          dragOver ? 'border-cyan-400 bg-cyan-500/5' : 'border-white/[0.06] hover:border-white/[0.12]'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-center">
          <Upload size={28} className={`mx-auto mb-2 ${dragOver ? 'text-cyan-400' : 'text-gray-600'}`} />
          <p className="text-sm font-medium text-gray-400">
            {dragOver ? 'Drop videos here' : 'Upload videos or drag & drop'}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">MP4, WebM, MOV — clips will appear in your timeline below</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={e => handleUpload(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* ── Left: Timeline & Clips ──────────────────────────────── */}
        <div className="space-y-5">
          {/* Clip List */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Film size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold">Clip Timeline</h3>
                <span className="text-[10px] text-gray-600">{clips.length} clips</span>
              </div>
              <div className="flex gap-2">
                {videoFiles.length > 0 && clips.length === 0 && (
                  <button onClick={loadFromLibrary}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-[11px] text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all">
                    <Film size={12} /> Load from Library
                  </button>
                )}
                {clips.length > 0 && (
                  <button onClick={() => setClips([])}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-[11px] text-gray-400 hover:border-rose-500/40 hover:text-rose-400 transition-all">
                    <Trash2 size={12} /> Clear All
                  </button>
                )}
              </div>
            </div>

            {clips.length === 0 ? (
              <div className="text-center py-12 text-gray-600 text-[13px]">
                <Film size={32} className="mx-auto mb-2 opacity-40" />
                No clips yet — upload videos or load from library
              </div>
            ) : (
              <div className="space-y-1.5">
                {clips.map((clip, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    clip.selected ? 'bg-cyan-500/10 border-cyan-400' : 'bg-[#0a0a12] border-white/[0.06] hover:border-white/[0.12]'
                  }`}>
                    <button onClick={() => toggleClip(i)}
                      className={`w-5 h-5 rounded border flex items-center justify-center text-[10px] transition-all ${
                        clip.selected ? 'bg-cyan-500 border-cyan-400 text-white' : 'border-gray-600 text-transparent'
                      }`}>
                      {clip.selected && '✓'}
                    </button>
                    <GripVertical size={14} className="text-gray-600 cursor-grab" />
                    <span className="text-xs text-gray-500 font-mono w-6 text-center">{i + 1}</span>
                    <Film size={14} className="text-gray-500" />
                    <span className="flex-1 text-xs text-gray-400 truncate">{clip.filename}</span>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => moveClip(i, -1)} disabled={i === 0}
                        className="p-1 text-gray-600 hover:text-white disabled:opacity-30 transition-colors">
                        <ArrowUpDown size={12} />
                      </button>
                      <button onClick={() => { setSplitFile(clip.url); setSplitTime('0'); }}
                        className="p-1 text-gray-600 hover:text-amber-400 transition-colors" title="Split this clip">
                        <SplitSquareHorizontal size={12} />
                      </button>
                      <a href={clip.url} download className="p-1 text-gray-600 hover:text-cyan-400 transition-colors">
                        <Download size={12} />
                      </a>
                      <button onClick={() => removeClip(i)}
                        className="p-1 text-gray-600 hover:text-rose-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Transition Selector */}
            {clips.filter(c => c.selected).length >= 2 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={14} className="text-teal-400" />
                  <span className="text-xs font-bold">Transition</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {TRANSITIONS.map(t => (
                    <button key={t.id} onClick={() => setSelectedTransition(t.id)}
                      className={`px-2 py-2 rounded-lg text-[10px] font-semibold transition-all border text-center ${
                        selectedTransition === t.id
                          ? 'bg-teal-500/10 border-teal-400 text-white'
                          : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                      }`} title={t.desc}>
                      <span className="block text-sm">{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-600 mb-1 block">Duration (s)</label>
                    <input type="number" value={transitionDur} onChange={e => setTransitionDur(e.target.value)}
                      className="input-field text-xs" min="0.1" max="5" step="0.1" />
                  </div>
                  <button onClick={combine} disabled={loading}
                    className="btn-primary px-5 py-2.5 rounded-[10px] text-xs font-bold flex items-center gap-2 mt-4">
                    {loading ? <Spinner size={14} /> : <Link2 size={14} />}
                    Combine {clips.filter(c => c.selected).length} Clips
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Result Player */}
          {resultUrl && (
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Play size={14} className="text-emerald-400" />
                <span className="text-xs font-bold">Result</span>
              </div>
              <div className="bg-black rounded-xl aspect-video overflow-hidden border border-white/[0.06]">
                <video src={resultUrl} controls autoPlay className="w-full h-full object-contain" />
              </div>
              <div className="flex gap-2 mt-3">
                <a href={resultUrl} download="aeo-combined.mp4"
                  className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold">
                  <Download size={13} /> Download
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Tools Panel ──────────────────────────────────── */}
        <div className="space-y-5">
          {/* Trim Tool */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Scissors size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold">Trim Clip</h3>
            </div>
            <label className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 block">Video</label>
            <select value={trimFile} onChange={e => setTrimFile(e.target.value)} className="input-field cursor-pointer text-xs mb-3">
              <option value="">Select a clip...</option>
              {clips.map((c, i) => <option key={i} value={c.url}>{i + 1}. {c.filename}</option>)}
              {videoFiles.map(f => <option key={f.id} value={f.url}>📁 {f.filename}</option>)}
            </select>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-600 mb-1 block flex items-center gap-1">
                  <Clock size={10} /> Start (s)
                </label>
                <input type="number" value={trimStart} onChange={e => setTrimStart(e.target.value)}
                  className="input-field text-xs" min="0" step="0.5" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-600 mb-1 block">End (s)</label>
                <input type="number" value={trimEnd} onChange={e => setTrimEnd(e.target.value)}
                  className="input-field text-xs" min="-1" step="0.5" placeholder="-1 = full" />
              </div>
            </div>
            <button onClick={trim} disabled={loading}
              className="btn-primary w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
              {loading ? <Spinner size={14} /> : <Scissors size={14} />}
              Trim Clip
            </button>
          </div>

          {/* Split Tool */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <SplitSquareHorizontal size={16} className="text-amber-400" />
              <h3 className="text-sm font-bold">Split Clip</h3>
            </div>
            <label className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 block">Video</label>
            <select value={splitFile} onChange={e => setSplitFile(e.target.value)} className="input-field cursor-pointer text-xs mb-3">
              <option value="">Select a clip...</option>
              {clips.map((c, i) => <option key={i} value={c.url}>{i + 1}. {c.filename}</option>)}
            </select>
            <label className="text-[10px] text-gray-600 mb-1 block">Split at (seconds)</label>
            <input type="number" value={splitTime} onChange={e => setSplitTime(e.target.value)}
              className="input-field text-xs mb-3" min="0" step="0.5" />
            <button onClick={split} disabled={loading}
              className="w-full py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-500/25 transition-all">
              {loading ? <Spinner size={14} /> : <SplitSquareHorizontal size={14} />}
              Split into 2 Clips
            </button>
          </div>

          <StatusBadge status={status} />
        </div>
      </div>
    </div>
  );
}
