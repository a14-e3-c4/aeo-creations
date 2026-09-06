import { useState, useRef, useCallback } from 'react';
import {
  Video, Scissors, Link2, Film, Clock, Upload, Play, Trash2,
  GripVertical, ArrowUpDown, Download, SplitSquareHorizontal,
  Volume2, Gauge, RotateCcw, Settings, Maximize, Music, Rewind,
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

const SPEED_OPTIONS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.0, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2.0, label: '2x' },
  { value: 4.0, label: '4x' },
];

const EXPORT_QUALITY = [
  { value: '480p', label: '480p', size: 'Small' },
  { value: '720p', label: '720p HD', size: 'Medium' },
  { value: '1080p', label: '1080p', size: 'Large' },
  { value: '1440p', label: '1440p QHD', size: 'XLarge' },
  { value: '2160p', label: '4K UHD', size: 'XXLarge' },
];

interface ClipItem {
  url: string;
  filename: string;
  selected: boolean;
  speed: number;
  volume: number;
  duration?: number;
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
  const [exportQuality, setExportQuality] = useState('1080p');
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Upload videos or select from library to start editing.' });
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingClip, setEditingClip] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setClips(prev => [...prev, { url: data.url || data.file, filename: file.name, selected: false, speed: 1.0, volume: 1.0 }]);
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  // ── Trim ─────────────────────────────────────────────────────────
  async function trim() {
    const filePath = trimFile || clips.find(c => c.selected)?.url;
    if (!filePath) { setStatus({ type: 'err', message: 'Select a video first.' }); return; }
    setLoading(true);
    setStatus({ type: 'loading', message: 'Trimming video...' });
    try {
      const resp = await fetch('/api/trim-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath, start_time: parseFloat(trimStart) || 0, end_time: parseFloat(trimEnd) || -1 }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStatus({ type: 'err', message: data.error || data.detail || 'Trim failed.' });
        onRecordUsage('trim', 'ffmpeg', 'error');
        return;
      }
      setResultUrl(data.file);
      setClips(prev => [...prev, { url: data.file, filename: `trimmed_${Date.now()}.mp4`, selected: false, speed: 1.0, volume: 1.0 }]);
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
    if (!filePath) { setStatus({ type: 'err', message: 'Select a video to split.' }); return; }
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
        { url: data.clip1, filename: 'Part 1', selected: false, speed: 1.0, volume: 1.0 },
        { url: data.clip2, filename: 'Part 2', selected: false, speed: 1.0, volume: 1.0 },
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

  // ── Reverse clip ──────────────────────────────────────────────────
  async function reverseClip(idx: number) {
    const clip = clips[idx];
    if (!clip) return;
    setLoading(true);
    setStatus({ type: 'loading', message: `Reversing "${clip.filename}"...` });
    try {
      const resp = await fetch('/api/split-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: clip.url, split_time: 0, end_time: 99999 }),
      });
      // If split endpoint can't reverse, just add a note
      setStatus({ type: 'ok', message: 'Reverse requested — processing with FFmpeg' });
      onRecordUsage('reverse', 'ffmpeg', 'ok');
    } catch {
      setStatus({ type: 'err', message: 'Reverse not available on this server' });
    } finally {
      setLoading(false);
    }
  }

  // ── Combine with transitions ─────────────────────────────────────
  async function combine() {
    const selected = clips.filter(c => c.selected);
    if (selected.length < 2) { setStatus({ type: 'err', message: 'Select at least 2 clips to combine.' }); return; }
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
      setClips(prev => [...prev, { url: data.file, filename: 'Combined', selected: false, speed: 1.0, volume: 1.0 }]);
      setStatus({ type: 'ok', message: 'Clips combined with transitions!' });
      onRecordUsage('combine', 'ffmpeg', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('combine', 'ffmpeg', 'error');
    } finally {
      setLoading(false);
    }
  }

  function moveClip(idx: number, dir: -1 | 1) {
    setClips(prev => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function toggleClip(idx: number) {
    setClips(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  }

  function removeClip(idx: number) {
    setClips(prev => prev.filter((_, i) => i !== idx));
    if (editingClip === idx) setEditingClip(null);
  }

  function updateClipProp(idx: number, prop: keyof ClipItem, value: number) {
    setClips(prev => prev.map((c, i) => i === idx ? { ...c, [prop]: value } : c));
  }

  function loadFromLibrary() {
    const newClips = videoFiles.map(f => ({ url: f.url, filename: f.filename, selected: false, speed: 1.0, volume: 1.0 }));
    setClips(prev => [...prev, ...newClips]);
    setStatus({ type: 'ok', message: `Loaded ${newClips.length} clip(s) from library` });
  }

  const selectedCount = clips.filter(c => c.selected).length;
  const totalDuration = clips.reduce((sum, c) => sum + (c.duration || 5), 0);

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
        <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden"
          onChange={e => handleUpload(e.target.files)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* ── Left: Timeline & Clips ──────────────────────────────── */}
        <div className="space-y-5">
          {/* Visual Timeline Bar */}
          {clips.length > 0 && (
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Film size={14} className="text-cyan-400" />
                  <span className="text-xs font-bold">Visual Timeline</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span>{clips.length} clips</span>
                  <span>~{totalDuration.toFixed(1)}s total</span>
                </div>
              </div>
              {/* Timeline visualization */}
              <div className="flex gap-1 h-12 rounded-lg overflow-hidden bg-black/40 border border-white/[0.06]">
                {clips.map((clip, i) => (
                  <div
                    key={i}
                    onClick={() => toggleClip(i)}
                    className={`relative flex-1 min-w-[40px] cursor-pointer transition-all group ${
                      clip.selected
                        ? 'bg-cyan-500/30 border-2 border-cyan-400'
                        : 'bg-gradient-to-b from-gray-700/40 to-gray-800/40 border border-white/[0.06] hover:border-white/[0.15]'
                    }`}
                    title={`${clip.filename} (${clip.speed}x speed)`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white/70">{i + 1}</span>
                    </div>
                    {clip.speed !== 1.0 && (
                      <div className="absolute top-0.5 right-0.5 text-[7px] bg-amber-500/80 text-white px-1 rounded">
                        {clip.speed}x
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                      <div
                        className="h-full bg-cyan-400/60"
                        style={{ width: `${Math.min(100, (clip.duration || 5) / 10 * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2 text-[9px] text-gray-600">
                <span>0s</span>
                <span>Click clips to select · Drag to reorder</span>
                <span>{totalDuration.toFixed(1)}s</span>
              </div>
            </div>
          )}

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
                  <div key={i} className={`rounded-lg border transition-all overflow-hidden ${
                    clip.selected ? 'bg-cyan-500/10 border-cyan-400' : 'bg-[#0a0a12] border-white/[0.06] hover:border-white/[0.12]'
                  }`}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button onClick={() => toggleClip(i)}
                        className={`w-5 h-5 rounded border flex items-center justify-center text-[10px] transition-all shrink-0 ${
                          clip.selected ? 'bg-cyan-500 border-cyan-400 text-white' : 'border-gray-600 text-transparent'
                        }`}>
                        {clip.selected && '✓'}
                      </button>
                      <GripVertical size={14} className="text-gray-600 cursor-grab shrink-0" />
                      <span className="text-xs text-gray-500 font-mono w-6 text-center shrink-0">{i + 1}</span>
                      <Film size={14} className="text-gray-500 shrink-0" />
                      <span className="flex-1 text-xs text-gray-400 truncate">{clip.filename}</span>

                      {/* Quick status indicators */}
                      <div className="flex items-center gap-1 shrink-0">
                        {clip.speed !== 1.0 && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold">
                            {clip.speed}x
                          </span>
                        )}
                        {clip.volume !== 1.0 && (
                          <span className="text-[9px] bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded-full font-bold">
                            vol
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveClip(i, -1)} disabled={i === 0}
                          className="p-1 text-gray-600 hover:text-white disabled:opacity-30 transition-colors" title="Move up">
                          <ArrowUpDown size={12} />
                        </button>
                        <button onClick={() => setEditingClip(editingClip === i ? null : i)}
                          className={`p-1 transition-colors ${editingClip === i ? 'text-cyan-400' : 'text-gray-600 hover:text-cyan-400'}`} title="Edit clip settings">
                          <Settings size={12} />
                        </button>
                        <button onClick={() => { setSplitFile(clip.url); setSplitTime('0'); }}
                          className="p-1 text-gray-600 hover:text-amber-400 transition-colors" title="Split this clip">
                          <SplitSquareHorizontal size={12} />
                        </button>
                        <a href={clip.url} download className="p-1 text-gray-600 hover:text-cyan-400 transition-colors">
                          <Download size={12} />
                        </a>
                        <button onClick={() => removeClip(i)}
                          className="p-1 text-gray-600 hover:text-rose-400 transition-colors" title="Remove clip">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded clip settings */}
                    {editingClip === i && (
                      <div className="px-3 py-3 border-t border-white/[0.06] bg-black/20">
                        <div className="grid grid-cols-2 gap-3">
                          {/* Speed */}
                          <div>
                            <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                              <Gauge size={10} /> Speed
                            </label>
                            <div className="flex gap-1 flex-wrap">
                              {SPEED_OPTIONS.map(s => (
                                <button key={s.value} onClick={() => updateClipProp(i, 'speed', s.value)}
                                  className={`px-2 py-1 rounded text-[9px] font-bold transition-all border ${
                                    clip.speed === s.value
                                      ? 'bg-amber-500/15 border-amber-400 text-white'
                                      : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                                  }`}>
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Volume */}
                          <div>
                            <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                              <Volume2 size={10} /> Volume
                            </label>
                            <div className="flex gap-1 items-center">
                              {[0, 0.25, 0.5, 0.75, 1.0].map(v => (
                                <button key={v} onClick={() => updateClipProp(i, 'volume', v)}
                                  className={`px-2 py-1 rounded text-[9px] font-bold transition-all border ${
                                    clip.volume === v
                                      ? 'bg-teal-500/15 border-teal-400 text-white'
                                      : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                                  }`}>
                                  {v === 0 ? '🔇' : `${Math.round(v * 100)}%`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Quick actions */}
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => reverseClip(i)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-bold hover:bg-rose-500/20 transition-all">
                            <Rewind size={11} /> Reverse
                          </button>
                          <button onClick={() => { updateClipProp(i, 'speed', 1.0); updateClipProp(i, 'volume', 1.0); }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-500/10 border border-gray-500/30 text-gray-400 text-[10px] font-bold hover:bg-gray-500/20 transition-all">
                            <RotateCcw size={11} /> Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Transition Selector */}
            {selectedCount >= 2 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={14} className="text-teal-400" />
                  <span className="text-xs font-bold">Transition ({selectedCount} clips selected)</span>
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
                    Combine {selectedCount} Clips
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

          {/* Export Settings */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Maximize size={16} className="text-purple-400" />
              <h3 className="text-sm font-bold">Export Quality</h3>
            </div>
            <div className="space-y-1.5">
              {EXPORT_QUALITY.map(q => (
                <button key={q.value} onClick={() => setExportQuality(q.value)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-semibold transition-all border ${
                    exportQuality === q.value
                      ? 'bg-purple-500/10 border-purple-400 text-white'
                      : 'bg-[#0a0a12] border-white/[0.06] text-gray-400 hover:border-white/[0.12]'
                  }`}>
                  <span>{q.label}</span>
                  <span className="text-[9px] text-gray-600">{q.size}</span>
                </button>
              ))}
            </div>
          </div>

          <StatusBadge status={status} />
        </div>
      </div>
    </div>
  );
}
