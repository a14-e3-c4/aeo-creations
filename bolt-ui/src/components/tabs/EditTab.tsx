import { useState, useRef, useCallback } from 'react';
import {
  Scissors, Brush, Sun, Moon, Contrast, Droplets, Wind,
  Grid2x2, Image as ImageIcon, RotateCw, Sliders, RefreshCw,
} from 'lucide-react';
import type { StatusResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';

interface EditTabProps {
  currentImageB64: string | null;
  onRecordUsage: (action: string, model: string, status: string) => void;
}

const EDIT_BUTTONS = [
  { action: 'brightness', value: 1.3, label: 'Bright+', icon: Sun },
  { action: 'brightness', value: 0.7, label: 'Bright-', icon: Moon },
  { action: 'contrast', value: 1.5, label: 'Contrast+', icon: Contrast },
  { action: 'saturate', value: 1.5, label: 'Saturate+', icon: Droplets },
  { action: 'blur', value: 3, label: 'Blur', icon: Wind },
  { action: 'grayscale', value: undefined, label: 'Gray', icon: Grid2x2 },
  { action: 'sepia', value: undefined, label: 'Sepia', icon: Brush },
  { action: 'sharpen', value: undefined, label: 'Sharpen', icon: Sparkles },
  { action: 'flip', value: undefined, label: 'Flip', icon: RotateCw },
];

// Fix: import Sparkles for sharpen
import { Sparkles } from 'lucide-react';

export function EditTab({ currentImageB64, onRecordUsage }: EditTabProps) {
  const [editImageB64, setEditImageB64] = useState<string | null>(currentImageB64);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturate, setSaturate] = useState(1);
  const [blur, setBlur] = useState(0);
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Load an image to start editing.' });
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEditImage = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const b64 = (e.target?.result as string).split(',')[1];
      setEditImageB64(b64);
    };
    reader.readAsDataURL(file);
  }, []);

  async function applyEdit(action: string, value?: number) {
    if (!editImageB64) {
      setStatus({ type: 'err', message: 'Load an image first.' });
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_b64: editImageB64, action, value }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStatus({ type: 'err', message: data.error || data.detail || 'Edit failed.' });
        onRecordUsage('edit', 'pil', 'error');
        return;
      }
      setEditImageB64(data.image);
      setStatus({ type: 'ok', message: `${action} applied.` });
      onRecordUsage('edit', 'pil', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('edit', 'pil', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function applyAllEdits() {
    if (!editImageB64) {
      setStatus({ type: 'err', message: 'Load an image first.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'loading', message: 'Applying all edits...' });
    try {
      if (brightness !== 1) await applyEdit('brightness', brightness);
      if (contrast !== 1) await applyEdit('contrast', contrast);
      if (saturate !== 1) await applyEdit('saturate', saturate);
      if (blur > 0) await applyEdit('blur', blur);
      setStatus({ type: 'ok', message: 'All edits applied.' });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setBrightness(1);
    setContrast(1);
    setSaturate(1);
    setBlur(0);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1400px] mx-auto">
      {/* Source + Preview */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-cyan-500/15">
            <Scissors size={16} className="text-cyan-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Image Editor</h2>
        </div>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
          Adjust brightness, contrast, saturation, and apply filters to your images.
        </p>

        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Source Image</label>
        <div className="flex gap-2 mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={e => loadEditImage(e.target.files?.[0] ?? null)}
            className="flex-1 text-[11px] text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-surface-3 file:text-gray-300 file:text-xs file:cursor-pointer"
          />
          {currentImageB64 && (
            <button
              onClick={() => setEditImageB64(currentImageB64)}
              className="px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-xs text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all whitespace-nowrap"
            >
              Use Current
            </button>
          )}
        </div>
        <div className="bg-black rounded-[10px] min-h-[200px] flex items-center justify-center border border-white/[0.06]">
          {editImageB64 ? (
            <img
              src={`data:image/png;base64,${editImageB64}`}
              alt="Edit preview"
              className="max-w-full max-h-[400px] rounded-[10px] object-contain"
            />
          ) : (
            <span className="text-gray-600 text-[13px]">Load an image to start editing</span>
          )}
        </div>
        {loading && (
          <div className="mt-3 flex items-center text-amber-400 text-xs">
            <Spinner /> Processing...
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-teal-500/15">
            <Sliders size={16} className="text-teal-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Tools</h2>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {EDIT_BUTTONS.map((btn, i) => {
            const Icon = btn.icon;
            return (
              <button
                key={i}
                onClick={() => applyEdit(btn.action, btn.value)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#0a0a12] border border-white/[0.06] text-[11px] font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all disabled:opacity-40"
              >
                <Icon size={13} />
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Sliders */}
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Sun size={11} /> Brightness: <span className="text-cyan-400">{brightness.toFixed(1)}</span>
        </label>
        <input type="range" min={0.1} max={3} step={0.1} value={brightness} onChange={e => setBrightness(parseFloat(e.target.value))} className="w-full accent-cyan-400 h-1 mb-4" />

        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Contrast size={11} /> Contrast: <span className="text-cyan-400">{contrast.toFixed(1)}</span>
        </label>
        <input type="range" min={0.1} max={3} step={0.1} value={contrast} onChange={e => setContrast(parseFloat(e.target.value))} className="w-full accent-cyan-400 h-1 mb-4" />

        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Droplets size={11} /> Saturation: <span className="text-cyan-400">{saturate.toFixed(1)}</span>
        </label>
        <input type="range" min={0} max={3} step={0.1} value={saturate} onChange={e => setSaturate(parseFloat(e.target.value))} className="w-full accent-cyan-400 h-1 mb-4" />

        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Wind size={11} /> Blur: <span className="text-cyan-400">{blur}</span>
        </label>
        <input type="range" min={0} max={20} step={1} value={blur} onChange={e => setBlur(parseInt(e.target.value))} className="w-full accent-cyan-400 h-1 mb-4" />

        <button
          onClick={applyAllEdits}
          disabled={loading}
          className="btn-primary w-full py-3 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-2"
        >
          {loading ? <Spinner /> : <Brush size={15} />}
          Apply All Edits
        </button>
        <button
          onClick={reset}
          className="w-full mt-2 py-2.5 rounded-[10px] bg-surface-3 border border-white/[0.06] text-xs text-gray-400 hover:text-white transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw size={13} />
          Reset
        </button>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
