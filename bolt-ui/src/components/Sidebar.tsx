import {
  Sparkles, Film, Image as ImageIcon, Activity,
  CheckCircle2, XCircle, Trash2, Upload, Zap,
} from 'lucide-react';
import type { Generation, LibraryItem, UsageEntry } from '@/lib/types';

interface SidebarProps {
  generations: Generation[];
  library: LibraryItem[];
  usage: UsageEntry[];
  onDeleteLibraryItem: (id: string) => void;
  onOpenUpload: () => void;
  onLightbox: (src: string) => void;
  className?: string;
}

export function Sidebar({
  generations, library, usage, onDeleteLibraryItem, onOpenUpload, onLightbox, className,
}: SidebarProps) {
  const successful = usage.filter(u => u.status === 'ok').length;
  const failed = usage.filter(u => u.status === 'error').length;

  return (
    <aside className={`${className} w-[280px] flex-shrink-0 bg-surface border-r border-white/[0.06] flex flex-col overflow-y-auto backdrop-blur-xl fixed lg:relative h-full z-40 transition-transform duration-300`}>
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.06] bg-gradient-to-b from-cyan-500/[0.06] to-transparent">
        <h1 className="text-[22px] font-extrabold tracking-tight gradient-text">aeo.creations</h1>
        <p className="text-[11px] text-gray-600 mt-1 tracking-wider">AI VIDEO STUDIO</p>
      </div>

      {/* Library */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">Library</div>
        <div className="text-[11px] text-gray-600 mb-2">{library.length} files</div>
        {library.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5 mb-3">
            {library.slice(0, 12).map(item => (
              <div
                key={item.id}
                className="relative aspect-square rounded-md overflow-hidden cursor-pointer border-2 border-transparent hover:border-cyan-400 transition-all group"
                onClick={() => item.type === 'image' && onLightbox(item.url)}
              >
                {item.type === 'video' ? (
                  <video src={item.url} muted className="w-full h-full object-contain pointer-events-none" />
                ) : (
                  <img src={item.url} alt={item.filename} className="w-full h-full object-contain" />
                )}
                <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[8px] px-1 py-0.5 rounded">
                  {item.type === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                </span>
                <button
                  className="absolute top-1 right-1 bg-rose-500 text-white w-4 h-4 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onDeleteLibraryItem(item.id); }}
                >
                  <XCircle size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onOpenUpload}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-surface-3 border border-white/[0.06] text-xs font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all"
        >
          <Upload size={13} />
          Upload Media
        </button>
      </div>

      {/* Usage */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">Usage (7d)</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#0a0a12] border border-white/[0.06] rounded-[10px] p-2.5 text-center">
            <div className="text-xl font-extrabold tracking-tight">{usage.length}</div>
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-0.5">Calls</div>
          </div>
          <div className="bg-[#0a0a12] border border-white/[0.06] rounded-[10px] p-2.5 text-center">
            <div className="text-xl font-extrabold tracking-tight text-emerald-400">{successful}</div>
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-0.5">Done</div>
          </div>
          <div className="bg-[#0a0a12] border border-white/[0.06] rounded-[10px] p-2.5 text-center">
            <div className="text-xl font-extrabold tracking-tight text-rose-400">{failed}</div>
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-0.5">Failed</div>
          </div>
        </div>
      </div>

      {/* Recent Generations */}
      {generations.length > 0 && (
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">Recent</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
            {generations.slice(0, 8).map(gen => (
              <div
                key={gen.id}
                className="relative aspect-square rounded-md overflow-hidden cursor-pointer border border-white/[0.06] hover:border-cyan-400 transition-all group"
                onClick={() => gen.media_url && onLightbox(gen.media_url)}
              >
                {gen.thumbnail_url ? (
                  <img src={gen.thumbnail_url} alt={gen.prompt || ''} className="w-full h-full object-cover" />
                ) : gen.media_url ? (
                  <img src={gen.media_url} alt={gen.prompt || ''} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-surface-3">
                    {gen.type === 'video' ? <Film size={16} className="text-gray-700" /> : <ImageIcon size={16} className="text-gray-700" />}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[8px] px-1 py-0.5 rounded">
                  {gen.type === 'video' || gen.type === 'ai-video' ? <Film size={8} /> : <ImageIcon size={8} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tip */}
      <div className="px-5 py-4 mt-auto">
        <div className="text-[11px] text-gray-600 bg-[#0a0a12] border-l-2 border-cyan-400 px-3 py-2.5 rounded-r-md leading-relaxed">
          <strong className="text-cyan-400 flex items-center gap-1.5">
            <Zap size={12} />
            8K Ultra HD
          </strong>
          <span className="block mt-1">Images generate at up to 7680x4320 and videos at 1920x1080 Full HD with cinematic Ken Burns effects.</span>
        </div>
      </div>
    </aside>
  );
}
