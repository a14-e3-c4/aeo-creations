import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[1000] grid place-items-center cursor-zoom-out animate-fade-in p-10 backdrop-blur-md"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Preview"
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl"
      />
      <button className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors">
        <X size={28} />
      </button>
      <span className="absolute bottom-8 text-xs text-gray-500">Click anywhere or press ESC to close</span>
    </div>
  );
}
