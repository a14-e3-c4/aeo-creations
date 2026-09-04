import { useState, useCallback } from 'react';
import {
  Clapperboard, Film, Image as ImageIcon, Scissors, Video,
  Upload, Trash2, Sparkles, X, Wand2,
  LogIn, LogOut, BarChart3, Crown, User as UserIcon,
} from 'lucide-react';
import type { Generation, LibraryItem, UsageEntry } from '@/lib/types';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';
import { ScriptTab } from '@/components/tabs/ScriptTab';
import { AIVideoTab } from '@/components/tabs/AIVideoTab';
import { GenerateTab } from '@/components/tabs/GenerateTab';
import { EditTab } from '@/components/tabs/EditTab';
import { VideoTab } from '@/components/tabs/VideoTab';
import { CreateVideoTab } from '@/components/tabs/CreateVideoTab';
import { UploadModal } from '@/components/UploadModal';
import { Lightbox } from '@/components/Lightbox';
import { AuthModal } from '@/components/AuthModal';
import { UsageDashboard } from '@/components/UsageDashboard';
import { PlanSelector } from '@/components/PlanSelector';

export type TabName = 'create' | 'script' | 'aivideo' | 'generate' | 'edit' | 'video';

const TABS: { id: TabName; label: string; icon: typeof Film }[] = [
  { id: 'create', label: 'Create Video', icon: Wand2 },
  { id: 'script', label: 'Script', icon: Sparkles },
  { id: 'aivideo', label: 'AI Video', icon: Clapperboard },
  { id: 'generate', label: 'Image', icon: ImageIcon },
  { id: 'edit', label: 'Edit', icon: Scissors },
  { id: 'video', label: 'Video', icon: Video },
];

function AppInner() {
  const { user, loading, logout, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabName>('script');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [currentImageB64, setCurrentImageB64] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Auth/Usage/Plan modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [usageDashboardOpen, setUsageDashboardOpen] = useState(false);
  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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

  const openLogin = () => { setAuthMode('login'); setAuthModalOpen(true); };
  const openRegister = () => { setAuthMode('register'); setAuthModalOpen(true); };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#06060b]">
        <div className="text-center">
          <Sparkles size={32} className="text-cyan-400 animate-pulse mx-auto mb-3" />
          <p className="text-xs text-gray-500">Loading aeo.creations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#06060b] text-gray-100 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
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
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] glass-panel relative z-10">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-gray-400 hover:text-white" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X size={20} /> : <Sparkles size={20} />}
            </button>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 tracking-wide">
              <Sparkles size={11} /> 4K ULTRA HD
            </span>
            <span className="text-xs text-gray-500 hidden sm:inline">aeo.creations Studio</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Upload & Clear */}
            <button onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-xs font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all">
              <Upload size={14} /><span className="hidden sm:inline">Upload</span>
            </button>
            <button onClick={clearCache}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-xs font-medium text-gray-400 hover:border-rose-500/40 hover:text-white transition-all">
              <Trash2 size={14} /><span className="hidden sm:inline">Clear</span>
            </button>

            {/* Auth section */}
            {user ? (
              <div className="relative">
                <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-xs font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all">
                  <div className="w-5 h-5 rounded-full bg-cyan-500/20 grid place-items-center">
                    <UserIcon size={11} className="text-cyan-400" />
                  </div>
                  <span className="hidden sm:inline">{user.display_name || user.email}</span>
                  {user.plan !== 'free' && <Crown size={11} className="text-amber-400" />}
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-56 glass-panel rounded-xl border border-white/[0.08] z-50 py-1 animate-slide-up">
                      <div className="px-3 py-2 border-b border-white/[0.06]">
                        <p className="text-xs font-semibold text-white">{user.display_name}</p>
                        <p className="text-[10px] text-gray-500">{user.email}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            user.plan === 'pro' ? 'bg-yellow-500/15 text-yellow-400' :
                            user.plan === 'creator' ? 'bg-purple-500/15 text-purple-400' :
                            'bg-gray-500/15 text-gray-400'
                          }`}>{user.plan}</span>
                          <span className="text-[10px] text-gray-500">{user.credits_remaining} credits</span>
                        </div>
                      </div>
                      <button onClick={() => { setUserMenuOpen(false); setUsageDashboardOpen(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/[0.03] transition-colors">
                        <BarChart3 size={13} /> Usage Dashboard
                      </button>
                      <button onClick={() => { setUserMenuOpen(false); setPlanSelectorOpen(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/[0.03] transition-colors">
                        <Crown size={13} /> Plans & Upgrade
                      </button>
                      <div className="border-t border-white/[0.06] my-1" />
                      <button onClick={() => { logout(); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-rose-400 hover:bg-white/[0.03] transition-colors">
                        <LogOut size={13} /> Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={openLogin}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-xs font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all">
                  <LogIn size={14} /> Sign In
                </button>
                <button onClick={openRegister}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-xs font-bold hover:bg-cyan-500/25 transition-all">
                  Sign Up Free
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Upgrade banner (for logged-in free users) */}
        {user && user.plan === 'free' && user.credits_remaining < 10 && (
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown size={14} className="text-amber-400" />
              <span className="text-xs text-amber-300">
                You have <strong>{user.credits_remaining}</strong> credits remaining this month.
              </span>
            </div>
            <button onClick={() => setPlanSelectorOpen(true)}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1">
              Upgrade Now <Sparkles size={11} />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-0 px-5 border-b border-white/[0.06] bg-surface/80 backdrop-blur-xl overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id ? 'text-cyan-400 border-cyan-400' : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}>
                <Icon size={15} />{tab.label}
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-7">
          <div key={activeTab} className="animate-slide-up">
            {activeTab === 'create' && <CreateVideoTab onRecordUsage={recordUsage} />}
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

      {/* Modals */}
      {uploadModalOpen && (
        <UploadModal onClose={() => setUploadModalOpen(false)} onUploaded={(item) => setLibrary(prev => [item, ...prev])} />
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {authModalOpen && (
        <AuthModal mode={authMode} onClose={() => setAuthModalOpen(false)} />
      )}
      {usageDashboardOpen && (
        <UsageDashboard
          onOpenPlans={() => { setUsageDashboardOpen(false); setPlanSelectorOpen(true); }}
          onClose={() => setUsageDashboardOpen(false)}
        />
      )}
      {planSelectorOpen && (
        <PlanSelector onClose={() => setPlanSelectorOpen(false)} onUpgraded={refreshUser} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
