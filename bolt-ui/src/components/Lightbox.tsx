import { useEffect, useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, 5));
      if (e.key === '-') setScale(s => Math.max(s - 0.25, 0.25));
      if (e.key === '0') { setScale(1); setPosition({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => Math.min(Math.max(s + delta, 0.25), 5));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (scale > 1) {
      setDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }

  function handleMouseUp() { setDragging(false); }

  function resetView() { setScale(1); setPosition({ x: 0, y: 0 }); }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = src;
    a.download = `aeo-fullscreen-${Date.now()}.png`;
    a.click();
  }

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[1000] grid place-items-center backdrop-blur-md"
      style={{ animation: 'lightbox-fade-in 0.2s ease-out' }}
      onClick={onClose}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Image */}
      <img
        src={src}
        alt="Fullscreen preview"
        className="select-none"
        draggable={false}
        style={{
          maxWidth: '95vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          transition: dragging ? 'none' : 'transform 0.15s ease-out',
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (scale <= 1) {
            setScale(2.5);
          } else {
            resetView();
          }
        }}
        onMouseDown={handleMouseDown}
      />

      {/* Top bar controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <button onClick={() => setScale(s => Math.min(s + 0.5, 5))}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white transition-all backdrop-blur-sm"
          title="Zoom in (+)">
          <ZoomIn size={18} />
        </button>
        <button onClick={() => setScale(s => Math.max(s - 0.5, 0.25))}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white transition-all backdrop-blur-sm"
          title="Zoom out (-)">
          <ZoomOut size={18} />
        </button>
        <button onClick={resetView}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white transition-all backdrop-blur-sm"
          title="Reset (0)">
          <RotateCcw size={18} />
        </button>
        <button onClick={handleDownload}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white transition-all backdrop-blur-sm"
          title="Download">
          <Download size={18} />
        </button>
        <button onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500/30 grid place-items-center text-white hover:text-rose-400 transition-all backdrop-blur-sm"
          title="Close (ESC)">
          <X size={18} />
        </button>
      </div>

      {/* Zoom level indicator */}
      <div className="absolute top-4 left-4 bg-black/60 rounded-full px-3 py-1.5 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
        <span className="text-[11px] text-white/70 font-mono">{Math.round(scale * 100)}%</span>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 rounded-full px-4 py-2 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
        <span className="text-[11px] text-gray-400">
          Scroll to zoom · Click to zoom in/out · Drag to pan · ESC to close
        </span>
      </div>

      <style>{`
        @keyframes lightbox-fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
