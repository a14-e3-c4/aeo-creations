import { useState, useCallback } from 'react';
import {
  Clapperboard, Film, Image as ImageIcon, Scissors, Video,
  Upload, Trash2, Sparkles, X,
} from 'lucide-react';
import type { Generation, LibraryItem, UsageEntry } from '@/lib/types';
import { Sidebar } from '@/components/Sidebar';
import { ScriptTab } from '@/components/tabs/ScriptTab';
import { AIVideoTab } from '@/components/tabs/AIVideoTab';
import { GenerateTab } from '@/components/tabs/GenerateTab';
import { EditTab } from '@/components/tabs/EditTab';
import { VideoTab } from '@/components/tabs/VideoTab';
import { UploadModal } from '@/components/UploadModal';
import { Lightbox } from '@/components/Lightbox';

export type TabName = 'script' | 'aivideo' | 'generate' | 'edit' | 'video';

const TABS: { id: TabName; label: string; icon: typeof Film }[] = [
  { id: 'script', label: 'Script', icon: Sparkles },
  { id: 'aivideo', label: 'AI Video', icon: Clapperboard },
  { id: 'generate', label: 'Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Scissors },
  { id: 'video', label: 'Video', icon: Video },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('script');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [currentImageB64, setCurrentImageB64] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const recordUsage = useCallback((action: string, model: string, status: string) => {
    const entry: UsageEntry = {
      id: crypto.randomUUID(),
      action,
      model,
      status,
      created_at: new Date().toISOString(),
    };
    setUsage(prev => [entry, ...prev].slice(0, 200));
  }, []);

  const saveGeneration = useCallback(async (gen: Partial<Generation>) => {
    const full: Generation = {
      id: crypto.randomUUID(),
      type: gen.type || 'image',
      prompt: gen.prompt || '',
      model: gen.model || '',
      style: gen.style || '',
      aspect_ratio: gen.aspect_ratio || '',
      resolution: gen.resolution || '',
      width: gen.width || 0,
      height: gen.height || 0,
      effect: gen.effect || '',
      duration: gen.duration || 0,
      media_url: gen.media_url || '',
      thumbnail_url: gen.thumbnail_url || null,
      status: gen.status || 'completed',
      metadata: gen.metadata || {},
      created_at: new Date().toISOString(),
    };
    setGenerations(prev => [full, ...prev].slice(0, 20));
    return full;
  }, []);

  const deleteLibraryItem = useCallback((id: string) => {
    setLibrary(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearCache = useCallback(() => {
    setGenerations([]);
    setUsage([]);
  }, []);

  const handleImageForEditing = (b64: string) => {
    setCurrentImageB64(b64);
    setActiveTab('edit');
  };

  const usePromptForGeneration = (prompt: string) => {
    setActiveTab('generate');
    window.dispatchEvent(new CustomEvent('set-prompt', { detail: prompt }));
  };

  return (
    <div className="flex h-screen bg-[#06060b] text-gray-100 overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        generations={generations}
        library={library}
        usage={usage}
        onDeleteLibraryItem={deleteLibraryItem}
        onOpenUpload={() => setUploadModalOpen(true)}
        onLightbox={setLightboxSrc}
        className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] glass-panel relative z-10">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-gray-400 hover:text-white"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X size={20} /> : <Sparkles size={20} />}
            </button>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 tracking-wide">
              <Sparkles size={11} />
              4K ULTRA HD
            </span>
            <span className="text-xs text-gray-500 hidden sm:inline">aeo.creations Studio</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-xs font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Upload</span>
            </button>
            <button
              onClick={clearCache}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-xs font-medium text-gray-400 hover:border-rose-500/40 hover:text-white transition-all"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </header>

        <div className="flex items-center gap-0 px-5 border-b border-white/[0.06] bg-surface/80 backdrop-blur-xl overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-cyan-400 border-cyan-400'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <main className="flex-1 overflow-y-auto p-6 lg:p-7">
          <div key={activeTab} className="animate-slide-up">
            {activeTab === 'script' && <ScriptTab onUsePrompt={usePromptForGeneration} onRecordUsage={recordUsage} />}
            {activeTab === 'aivideo' && <AIVideoTab onRecordUsage={recordUsage} onSaveGeneration={saveGeneration} />}
            {activeTab === 'generate' && (
              <GenerateTab
                onRecordUsage={recordUsage}
                onSaveGeneration={saveGeneration}
                onLightbox={setLightboxSrc}
                onUseForEditing={handleImageForEditing}
                currentImageB64={currentImageB64}
                setCurrentImageB64={setCurrentImageB64}
              />
            )}
            {activeTab === 'edit' && <EditTab currentImageB64={currentImageB64} onRecordUsage={recordUsage} />}
            {activeTab === 'video' && <VideoTab library={library} onRecordUsage={recordUsage} />}
          </div>
        </main>
      </div>

      {uploadModalOpen && (
        <UploadModal
          onClose={() => setUploadModalOpen(false)}
          onUploaded={(item) => setLibrary(prev => [item, ...prev])}
        />
      )}

      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
