import { useState, useRef, useCallback } from 'react';
import { Upload, Link2, X, FileVideo, FileImage, CheckCircle2 } from 'lucide-react';
import type { LibraryItem } from '@/lib/types';

interface UploadModalProps {
  onClose: () => void;
  onUploaded: (item: LibraryItem) => void;
}

export function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const [tab, setTab] = useState<'file' | 'url'>('file');
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!file) return;
    setShowProgress(true);
    setProgress(30);
    setUploadStatus('Uploading...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || data.detail || 'Upload failed');
      }

      setProgress(100);
      setUploadStatus(`Uploaded: ${file.name}`);

      const isVideo = file.type.startsWith('video/');
      const item: LibraryItem = {
        id: crypto.randomUUID(),
        filename: file.name,
        type: isVideo ? 'video' : 'image',
        url: data.url || data.file_path,
        size: file.size,
        created_at: new Date().toISOString(),
      };
      onUploaded(item);

      setTimeout(() => {
        setShowProgress(false);
        setProgress(0);
      }, 2000);
    } catch (e) {
      setUploadStatus(`Error: ${(e as Error).message}`);
      setProgress(0);
    }
  }, [onUploaded]);

  const importFromUrl = useCallback(async () => {
    if (!importUrl.trim()) return;
    setShowProgress(true);
    setProgress(30);
    setUploadStatus('Importing...');

    try {
      const resp = await fetch('/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl }),
      });

      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || data.detail || 'Import failed');
      }

      setProgress(100);
      setUploadStatus('Imported successfully');

      const item: LibraryItem = {
        id: crypto.randomUUID(),
        filename: importUrl.split('/').pop()?.split('?')[0] || 'imported',
        type: data.type || 'image',
        url: data.url || data.file_path,
        size: data.size || 0,
        created_at: new Date().toISOString(),
      };
      onUploaded(item);
      setImportUrl('');

      setTimeout(() => {
        setShowProgress(false);
        setProgress(0);
      }, 2000);
    } catch (e) {
      setUploadStatus(`Error: ${(e as Error).message}`);
      setProgress(0);
    }
  }, [importUrl, onUploaded]);

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-md animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface border border-white/[0.06] rounded-2xl p-7 max-w-[560px] w-[92%] max-h-[80vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">Upload Media</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-0 border-b border-white/[0.06] mb-5">
          <button
            onClick={() => setTab('file')}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
              tab === 'file' ? 'text-cyan-400 border-cyan-400' : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            <FileImage size={14} />
            Upload File
          </button>
          <button
            onClick={() => setTab('url')}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
              tab === 'url' ? 'text-cyan-400 border-cyan-400' : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            <Link2 size={14} />
            Import URL
          </button>
        </div>

        {tab === 'file' ? (
          <div>
            <div
              className={`border-2 border-dashed rounded-2xl py-12 px-6 text-center cursor-pointer transition-all ${
                dragOver ? 'border-cyan-400 bg-cyan-500/[0.08]' : 'border-white/[0.06] hover:border-cyan-500/40'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
              }}
            >
              <Upload size={40} className="mx-auto mb-3 text-gray-600" />
              <div className="text-gray-300 text-[13px] font-medium">Click to browse or drag & drop</div>
              <div className="text-gray-600 text-[11px] mt-1.5">
                Images: JPG, PNG, GIF, WebP · Videos: MP4, WebM, MOV
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={e => uploadFile(e.target.files?.[0] ?? new File([], ''))}
            />
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Paste direct link to image or video
            </label>
            <input
              type="text"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://images.unsplash.com/photo-xxx.jpg"
              className="input-field"
            />
            <button
              onClick={importFromUrl}
              className="btn-primary w-full mt-3 py-2.5 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-2"
            >
              <Link2 size={15} />
              Import
            </button>
          </div>
        )}

        {showProgress && (
          <div className="mt-4">
            <div className="bg-[#0a0a12] rounded h-1 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1.5">
              {progress === 100 ? <CheckCircle2 size={12} className="text-emerald-400" /> : null}
              {uploadStatus}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
