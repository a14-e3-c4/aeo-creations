import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Scissors, Brush, Sun, Moon, Contrast, Droplets, Wind,
  Grid2x2, Image as ImageIcon, RotateCw, Sliders, RefreshCw,
  Sparkles, Play, Pause, Film, Link2, Upload, Download, Eye,
  Move, Zap, Layers, ArrowLeftRight, Maximize, Minimize,
  FlipHorizontal, FlipVertical, RotateCcw, RotateCw as RotateCwIcon,
  Triangle, Hexagon, CircleDot, Waves, Target, Focus, Box,
  MonitorPlay, Wand2, ChevronDown, ChevronUp, Clock, Gauge,
} from 'lucide-react';
import type { StatusResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';

interface EditTabProps {
  currentImageB64: string | null;
  onRecordUsage: (action: string, model: string, status: string) => void;
}

// ═══════════════════════════════════════════════════════════════════
// POWERPOINT-STYLE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════
const SLIDE_TRANSITIONS = [
  // Entry transitions
  { id: 'fade-in', label: 'Fade In', icon: '✨', category: 'entry', desc: 'Smooth opacity fade from black' },
  { id: 'fade-in-color', label: 'Fade from Color', icon: '🎨', category: 'entry', desc: 'Fade from a custom color' },
  { id: 'appear', label: 'Appear', icon: '👁️', category: 'entry', desc: 'Instant appear (no animation)' },
  { id: 'zoom-in', label: 'Zoom In', icon: '🔍', category: 'entry', desc: 'Zoom in from small to full size' },
  { id: 'zoom-out', label: 'Zoom Out', icon: '🔎', category: 'entry', desc: 'Zoom out from large to full size' },
  { id: 'fly-in-left', label: 'Fly In ←', icon: '⬅️', category: 'entry', desc: 'Fly in from the left' },
  { id: 'fly-in-right', label: 'Fly In →', icon: '➡️', category: 'entry', desc: 'Fly in from the right' },
  { id: 'fly-in-top', label: 'Fly In ↑', icon: '⬆️', category: 'entry', desc: 'Fly in from above' },
  { id: 'fly-in-bottom', label: 'Fly In ↓', icon: '⬇️', category: 'entry', desc: 'Fly in from below' },
  { id: 'spin-in', label: 'Spin In', icon: '🌀', category: 'entry', desc: 'Spin and zoom into view' },
  { id: 'bounce-in', label: 'Bounce In', icon: '🏀', category: 'entry', desc: 'Bouncy entrance animation' },
  { id: 'elastic-in', label: 'Elastic In', icon: '🪀', category: 'entry', desc: 'Elastic overshoot entrance' },

  // Exit transitions
  { id: 'fade-out', label: 'Fade Out', icon: '💨', category: 'exit', desc: 'Smooth opacity fade to black' },
  { id: 'zoom-out-exit', label: 'Zoom Out Exit', icon: '🔭', category: 'exit', desc: 'Zoom out and disappear' },
  { id: 'fly-out-left', label: 'Fly Out ←', icon: '🛫', category: 'exit', desc: 'Fly out to the left' },
  { id: 'fly-out-right', label: 'Fly Out →', icon: '✈️', category: 'exit', desc: 'Fly out to the right' },
  { id: 'spin-out', label: 'Spin Out', icon: '💫', category: 'exit', desc: 'Spin and zoom away' },
  { id: 'shrink-out', label: 'Shrink', icon: '📉', category: 'exit', desc: 'Shrink to nothing' },

  // Emphasis
  { id: 'pulse', label: 'Pulse', icon: '💓', category: 'emphasis', desc: 'Pulse/scale animation' },
  { id: 'shake', label: 'Shake', icon: '🫨', category: 'emphasis', desc: 'Shake/vibrate effect' },
  { id: 'wiggle', label: 'Wiggle', icon: '🤌', category: 'emphasis', desc: 'Wiggle side to side' },
  { id: 'flash', label: 'Flash', icon: '⚡', category: 'emphasis', desc: 'Flash white overlay' },
  { id: 'grow', label: 'Grow', icon: '📈', category: 'emphasis', desc: 'Scale up and back' },
  { id: 'teeter', label: 'Teeter', icon: '⚖️', category: 'emphasis', desc: 'Rock back and forth' },
  { id: 'turn', label: 'Turn', icon: '🔄', category: 'emphasis', desc: '3D flip turn' },
  { id: 'glitch', label: 'Glitch', icon: '💻', category: 'emphasis', desc: 'Digital glitch effect' },

  // Slide transitions (between images)
  { id: 'dissolve', label: 'Dissolve', icon: '🌫️', category: 'slide', desc: 'Cross-dissolve between slides' },
  { id: 'wipe-left', label: 'Wipe Left', icon: '◀️', category: 'slide', desc: 'Wipe transition left' },
  { id: 'wipe-right', label: 'Wipe Right', icon: '▶️', category: 'slide', desc: 'Wipe transition right' },
  { id: 'wipe-up', label: 'Wipe Up', icon: '🔼', category: 'slide', desc: 'Wipe transition upward' },
  { id: 'wipe-down', label: 'Wipe Down', icon: '🔽', category: 'slide', desc: 'Wipe transition downward' },
  { id: 'push-left', label: 'Push Left', icon: '👈', category: 'slide', desc: 'Push current left, new slides in' },
  { id: 'push-right', label: 'Push Right', icon: '👉', category: 'slide', desc: 'Push current right, new slides in' },
  { id: 'push-up', label: 'Push Up', icon: '☝️', category: 'slide', desc: 'Push current up, new slides in' },
  { id: 'cover-left', label: 'Cover Left', icon: '📚', category: 'slide', desc: 'New slide covers from left' },
  { id: 'cover-right', label: 'Cover Right', icon: '📖', category: 'slide', desc: 'New slide covers from right' },
  { id: 'split-horizontal', label: 'Split H', icon: '↔️', category: 'slide', desc: 'Split horizontally open' },
  { id: 'split-vertical', label: 'Split V', icon: '↕️', category: 'slide', desc: 'Split vertically open' },
  { id: 'circle-open', label: 'Circle Open', icon: '⭕', category: 'slide', desc: 'Circle iris open' },
  { id: 'circle-close', label: 'Circle Close', icon: '🔴', category: 'slide', desc: 'Circle iris close' },
  { id: 'diamond', label: 'Diamond', icon: '💎', category: 'slide', desc: 'Diamond iris transition' },
  { id: 'plus', label: 'Plus', icon: '➕', category: 'slide', desc: 'Plus shape open/close' },
  { id: 'blinds-h', label: 'Blinds H', icon: '🪟', category: 'slide', desc: 'Horizontal blinds' },
  { id: 'blinds-v', label: 'Blinds V', icon: '🪟', category: 'slide', desc: 'Vertical blinds' },
  { id: 'random-bars', label: 'Random Bars', icon: '📊', category: 'slide', desc: 'Random horizontal/vertical bars' },
  { id: 'checkerboard', label: 'Checkerboard', icon: '🏁', category: 'slide', desc: 'Checkerboard pattern reveal' },
];

// ═══════════════════════════════════════════════════════════════════
// IMAGE ANIMATIONS (all Ken Burns + creative)
// ═══════════════════════════════════════════════════════════════════
const IMAGE_ANIMATIONS = [
  // Ken Burns
  { id: 'ken-burns-in', label: 'Ken Burns In', icon: '🎬', category: 'ken-burns', desc: 'Slow zoom in, classic documentary' },
  { id: 'ken-burns-out', label: 'Ken Burns Out', icon: '🎥', category: 'ken-burns', desc: 'Slow zoom out, reveal context' },
  { id: 'ken-burns-pan-left', label: 'KB Pan Left', icon: '⬅️', category: 'ken-burns', desc: 'Slow pan to the left' },
  { id: 'ken-burns-pan-right', label: 'KB Pan Right', icon: '➡️', category: 'ken-burns', desc: 'Slow pan to the right' },
  { id: 'ken-burns-pan-up', label: 'KB Pan Up', icon: '⬆️', category: 'ken-burns', desc: 'Slow pan upward' },
  { id: 'ken-burns-pan-down', label: 'KB Pan Down', icon: '⬇️', category: 'ken-burns', desc: 'Slow pan downward' },
  { id: 'ken-burns-zoom-pan', label: 'KB Zoom+Pan', icon: '🔄', category: 'ken-burns', desc: 'Zoom in while panning' },
  { id: 'ken-burns-drift', label: 'KB Drift', icon: '🌫️', category: 'ken-burns', desc: 'Gentle drifting movement' },

  // Zoom
  { id: 'zoom-in', label: 'Zoom In', icon: '🔍', category: 'zoom', desc: 'Smooth zoom into center' },
  { id: 'zoom-out', label: 'Zoom Out', icon: '🔎', category: 'zoom', desc: 'Smooth zoom out from center' },
  { id: 'zoom-in-fast', label: 'Zoom In Fast', icon: '⚡', category: 'zoom', desc: 'Quick punch-in zoom' },
  { id: 'zoom-out-fast', label: 'Zoom Out Fast', icon: '💨', category: 'zoom', desc: 'Quick zoom out' },
  { id: 'zoom-in-top-left', label: 'Zoom TL', icon: '↖️', category: 'zoom', desc: 'Zoom into top-left' },
  { id: 'zoom-in-top-right', label: 'Zoom TR', icon: '↗️', category: 'zoom', desc: 'Zoom into top-right' },
  { id: 'zoom-in-bottom-left', label: 'Zoom BL', icon: '↙️', category: 'zoom', desc: 'Zoom into bottom-left' },
  { id: 'zoom-in-bottom-right', label: 'Zoom BR', icon: '↘️', category: 'zoom', desc: 'Zoom into bottom-right' },

  // Pan
  { id: 'pan-left', label: 'Pan Left', icon: '◀️', category: 'pan', desc: 'Pan camera left' },
  { id: 'pan-right', label: 'Pan Right', icon: '▶️', category: 'pan', desc: 'Pan camera right' },
  { id: 'pan-up', label: 'Pan Up', icon: '🔼', category: 'pan', desc: 'Pan camera up' },
  { id: 'pan-down', label: 'Pan Down', icon: '🔽', category: 'pan', desc: 'Pan camera down' },
  { id: 'pan-left-right', label: 'Pan L↔R', icon: '↔️', category: 'pan', desc: 'Pan left then right' },
  { id: 'pan-up-down', label: 'Pan U↕D', icon: '↕️', category: 'pan', desc: 'Pan up then down' },
  { id: 'dolly-in', label: 'Dolly In', icon: '🚂', category: 'pan', desc: 'Dolly push forward' },
  { id: 'dolly-out', label: 'Dolly Out', icon: '🚃', category: 'pan', desc: 'Dolly pull back' },

  // Rotate
  { id: 'rotate-cw', label: 'Rotate CW', icon: '🔃', category: 'rotate', desc: 'Clockwise rotation' },
  { id: 'rotate-ccw', label: 'Rotate CCW', icon: '🔄', category: 'rotate', desc: 'Counter-clockwise rotation' },
  { id: 'rotate-wobble', label: 'Wobble', icon: '🫨', category: 'rotate', desc: 'Wobbling rotation' },
  { id: 'rotate-360', label: 'Full Spin', icon: '💫', category: 'rotate', desc: 'Full 360° rotation' },

  // Creative
  { id: 'parallax', label: 'Parallax', icon: '🏔️', category: 'creative', desc: '3D parallax depth effect' },
  { id: 'tilt-shift', label: 'Tilt Shift', icon: '🔭', category: 'creative', desc: 'Tilt-shift miniaturize effect' },
  { id: 'vhs-glitch', label: 'VHS Glitch', icon: '📼', category: 'creative', desc: 'VHS tape glitch distortion' },
  { id: 'pixelate', label: 'Pixelate', icon: '👾', category: 'creative', desc: 'Pixelation transition' },
  { id: 'oil-paint', label: 'Oil Paint Flow', icon: '🖼️', category: 'creative', desc: 'Oil painting reveal effect' },
  { id: 'watercolor', label: 'Watercolor', icon: '💧', category: 'creative', desc: 'Watercolor paint splash' },
  { id: 'shatter', label: 'Shatter', icon: '💥', category: 'creative', desc: 'Glass shatter effect' },
  { id: 'aurora', label: 'Aurora', icon: '🌌', category: 'creative', desc: 'Aurora borealis glow sweep' },
  { id: 'fire-sweep', label: 'Fire Sweep', icon: '🔥', category: 'creative', desc: 'Fire engulf sweep' },
  { id: 'light-leak', label: 'Light Leak', icon: '☀️', category: 'creative', desc: 'Film light leak overlay' },
  { id: 'bokeh', label: 'Bokeh Blur', icon: '🫧', category: 'creative', desc: 'Bokeh blur transition' },
  { id: 'cinematic-bars', label: 'Cinema Bars', icon: '🎬', category: 'creative', desc: 'Cinematic letterbox reveal' },
  { id: 'chromatic', label: 'Chromatic Aberration', icon: '🌈', category: 'creative', desc: 'RGB split chromatic effect' },
  { id: 'mirror', label: 'Mirror', icon: '🪞', category: 'creative', desc: 'Mirror/kaleidoscope effect' },
];

// Animation category groups
const ANIM_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'ken-burns', label: '🎬 Ken Burns' },
  { id: 'zoom', label: '🔍 Zoom' },
  { id: 'pan', label: '🎥 Pan' },
  { id: 'rotate', label: '🔄 Rotate' },
  { id: 'creative', label: '✨ Creative' },
];

const TRANSITION_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'entry', label: '🚪 Entry' },
  { id: 'exit', label: '🏃 Exit' },
  { id: 'emphasis', label: '💫 Emphasis' },
  { id: 'slide', label: '📊 Slide' },
];

const EDIT_BUTTONS = [
  { action: 'brightness', value: 1.3, label: 'Bright+', icon: Sun },
  { action: 'brightness', value: 0.7, label: 'Bright-', icon: Moon },
  { action: 'contrast', value: 1.5, label: 'Contrast+', icon: Contrast },
  { action: 'saturate', value: 1.5, label: 'Saturate+', icon: Droplets },
  { action: 'blur', value: 3, label: 'Blur', icon: Wind },
  { action: 'grayscale', value: undefined, label: 'Gray', icon: Grid2x2 },
  { action: 'sepia', value: undefined, label: 'Sepia', icon: Brush },
  { action: 'sharpen', value: undefined, label: 'Sharpen', icon: Sparkles },
  { action: 'flip', value: undefined, label: 'Flip', icon: FlipHorizontal },
];

export function EditTab({ currentImageB64, onRecordUsage }: EditTabProps) {
  // ── Image editing state ──
  const [editImageB64, setEditImageB64] = useState<string | null>(currentImageB64);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturate, setSaturate] = useState(1);
  const [blur, setBlur] = useState(0);
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Load an image or URL to start editing.' });
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // ── URL import state ──
  const [importUrl, setImportUrl] = useState('');
  const [importType, setImportType] = useState<'image' | 'video'>('image');

  // ── Animation state ──
  const [animCategory, setAnimCategory] = useState('all');
  const [selectedAnim, setSelectedAnim] = useState('ken-burns-in');
  const [animDuration, setAnimDuration] = useState(5);
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animPreviewFrame, setAnimPreviewFrame] = useState(0);
  const animTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Transition state ──
  const [transCategory, setTransCategory] = useState('all');
  const [selectedTrans, setSelectedTrans] = useState('dissolve');
  const [transDuration, setTransDuration] = useState(1.0);
  const [slideImages, setSlideImages] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [transPlaying, setTransPlaying] = useState(false);
  const [transFrame, setTransFrame] = useState(0);
  const transTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Slide show state ──
  const [slideshowInterval, setSlideshowInterval] = useState(3);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
      if (transTimerRef.current) clearInterval(transTimerRef.current);
      if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    };
  }, []);

  // ── Filtered lists ──
  const filteredAnims = IMAGE_ANIMATIONS.filter(a =>
    animCategory === 'all' ? true : a.category === animCategory
  );
  const filteredTrans = SLIDE_TRANSITIONS.filter(t =>
    transCategory === 'all' ? true : t.category === transCategory
  );

  // ── Load image from file ──
  const loadEditImage = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const b64 = (e.target?.result as string).split(',')[1];
      setEditImageB64(b64);
      setStatus({ type: 'ok', message: `Loaded: ${file.name}` });
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Import from URL ──
  async function importFromUrl() {
    if (!importUrl.trim()) { setStatus({ type: 'err', message: 'Enter a URL first.' }); return; }
    setLoading(true);
    setStatus({ type: 'loading', message: 'Importing from URL...' });
    try {
      if (importType === 'image') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image from URL'));
          img.src = importUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const b64 = dataUrl.split(',')[1];
        setEditImageB64(b64);
        setStatus({ type: 'ok', message: 'Image imported from URL!' });
        onRecordUsage('import-url', 'image', 'ok');
      } else {
        // For video, just set the URL directly as a reference
        setStatus({ type: 'ok', message: 'Video URL imported! Use Video tab for full editing.' });
        onRecordUsage('import-url', 'video', 'ok');
      }
    } catch (err) {
      setStatus({ type: 'err', message: err instanceof Error ? err.message : 'Import failed' });
      onRecordUsage('import-url', importType, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Add image to slideshow ──
  function addToSlideshow() {
    if (!editImageB64) { setStatus({ type: 'err', message: 'Load an image first.' }); return; }
    setSlideImages(prev => [...prev, `data:image/png;base64,${editImageB64}`]);
    setStatus({ type: 'ok', message: `Added to slideshow (${slideImages.length + 1} slides)` });
  }

  // ── Add from URL to slideshow ──
  function addUrlToSlideshow() {
    if (!importUrl.trim()) { setStatus({ type: 'err', message: 'Enter a URL first.' }); return; }
    setSlideImages(prev => [...prev, importUrl]);
    setImportUrl('');
    setStatus({ type: 'ok', message: `Added URL to slideshow (${slideImages.length + 1} slides)` });
  }

  // ── Backend edit ──
  async function applyEdit(action: string, value?: number) {
    if (!editImageB64) { setStatus({ type: 'err', message: 'Load an image first.' }); return; }
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
    if (!editImageB64) { setStatus({ type: 'err', message: 'Load an image first.' }); return; }
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

  function reset() { setBrightness(1); setContrast(1); setSaturate(1); setBlur(0); }

  // ── Animation preview ──
  function previewAnimation() {
    if (animPlaying) {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
      setAnimPlaying(false);
      setAnimPreviewFrame(0);
      return;
    }
    setAnimPlaying(true);
    setAnimPreviewFrame(0);
    let frame = 0;
    const totalFrames = animDuration * 30; // 30fps
    animTimerRef.current = setInterval(() => {
      frame++;
      setAnimPreviewFrame(frame);
      if (frame >= totalFrames) {
        clearInterval(animTimerRef.current!);
        setAnimPlaying(false);
        setAnimPreviewFrame(0);
      }
    }, 33);
  }

  // ── Transition preview ──
  function previewTransition() {
    if (slideImages.length < 1) {
      setStatus({ type: 'err', message: 'Add at least 1 image to the slideshow.' });
      return;
    }
    if (transPlaying) {
      if (transTimerRef.current) clearInterval(transTimerRef.current);
      setTransPlaying(false);
      setCurrentSlide(0);
      setTransFrame(0);
      return;
    }
    setTransPlaying(true);
    setTransFrame(0);
    setCurrentSlide(0);
    let frame = 0;
    const totalFrames = transDuration * 30;
    transTimerRef.current = setInterval(() => {
      frame++;
      setTransFrame(frame);
      if (frame >= totalFrames) {
        setCurrentSlide(prev => (prev + 1) % slideImages.length);
        frame = 0;
        setTransFrame(0);
      }
    }, 33);
  }

  // ── Generate animation video via backend ──
  async function generateAnimationVideo() {
    if (!editImageB64) { setStatus({ type: 'err', message: 'Load an image first.' }); return; }
    setLoading(true);
    setStatus({ type: 'loading', message: `Generating ${selectedAnim} animation...` });
    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Animate this image with ${selectedAnim} effect`,
          image_b64: editImageB64,
          kb_effect: selectedAnim,
          kb_duration: animDuration,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStatus({ type: 'err', message: data.error || data.detail || 'Animation generation failed.' });
        onRecordUsage('animate', selectedAnim, 'error');
        return;
      }
      const vUrl = data.video_url || data.video || data.file;
      if (vUrl) {
        setStatus({ type: 'ok', message: 'Animation video generated!' });
        onRecordUsage('animate', selectedAnim, 'ok');
      } else {
        setStatus({ type: 'ok', message: 'Animation processed (check downloads).' });
      }
    } catch (e) {
      setStatus({ type: 'err', message: `Error: ${(e as Error).message}` });
      onRecordUsage('animate', selectedAnim, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Animation CSS for preview ──
  function getAnimStyle(): React.CSSProperties {
    const t = animPreviewFrame / (animDuration * 30);
    const base: React.CSSProperties = { transition: 'none', willChange: 'transform, opacity' };

    switch (selectedAnim) {
      case 'ken-burns-in': return { ...base, transform: `scale(${1 + t * 0.3})` };
      case 'ken-burns-out': return { ...base, transform: `scale(${1.3 - t * 0.3})` };
      case 'ken-burns-pan-left': return { ...base, transform: `scale(1.15) translateX(${-t * 15}%)` };
      case 'ken-burns-pan-right': return { ...base, transform: `scale(1.15) translateX(${t * 15}%)` };
      case 'ken-burns-pan-up': return { ...base, transform: `scale(1.15) translateY(${-t * 15}%)` };
      case 'ken-burns-pan-down': return { ...base, transform: `scale(1.15) translateY(${t * 15}%)` };
      case 'ken-burns-zoom-pan': return { ...base, transform: `scale(${1 + t * 0.2}) translateX(${t * 10}%)` };
      case 'ken-burns-drift': return { ...base, transform: `scale(1.1) translate(${Math.sin(t * Math.PI) * 5}%, ${Math.cos(t * Math.PI) * 3}%)` };
      case 'zoom-in': return { ...base, transform: `scale(${1 + t * 0.5})` };
      case 'zoom-out': return { ...base, transform: `scale(${1.5 - t * 0.5})` };
      case 'zoom-in-fast': return { ...base, transform: `scale(${1 + t * t * 2})` };
      case 'zoom-out-fast': return { ...base, transform: `scale(${3 - t * t * 2})` };
      case 'zoom-in-top-left': return { ...base, transformOrigin: 'top left', transform: `scale(${1 + t * 0.5})` };
      case 'zoom-in-top-right': return { ...base, transformOrigin: 'top right', transform: `scale(${1 + t * 0.5})` };
      case 'zoom-in-bottom-left': return { ...base, transformOrigin: 'bottom left', transform: `scale(${1 + t * 0.5})` };
      case 'zoom-in-bottom-right': return { ...base, transformOrigin: 'bottom right', transform: `scale(${1 + t * 0.5})` };
      case 'pan-left': return { ...base, transform: `translateX(${-t * 20}%)` };
      case 'pan-right': return { ...base, transform: `translateX(${t * 20}%)` };
      case 'pan-up': return { ...base, transform: `translateY(${-t * 20}%)` };
      case 'pan-down': return { ...base, transform: `translateY(${t * 20}%)` };
      case 'pan-left-right': return { ...base, transform: `translateX(${Math.sin(t * Math.PI * 2) * 10}%)` };
      case 'pan-up-down': return { ...base, transform: `translateY(${Math.sin(t * Math.PI * 2) * 10}%)` };
      case 'dolly-in': return { ...base, transform: `scale(${1 + t * 0.8}) perspective(800px) translateZ(${t * 50}px)` };
      case 'dolly-out': return { ...base, transform: `scale(${1.8 - t * 0.8}) perspective(800px) translateZ(${-t * 50}px)` };
      case 'rotate-cw': return { ...base, transform: `rotate(${t * 360}deg)` };
      case 'rotate-ccw': return { ...base, transform: `rotate(${-t * 360}deg)` };
      case 'rotate-wobble': return { ...base, transform: `rotate(${Math.sin(t * Math.PI * 4) * 15}deg)` };
      case 'rotate-360': return { ...base, transform: `rotate(${t * 360}deg) scale(${1 + Math.sin(t * Math.PI) * 0.1})` };
      case 'parallax': return { ...base, transform: `perspective(1000px) rotateY(${t * 10}deg) scale(1.05)` };
      case 'tilt-shift': return { ...base, filter: `blur(${Math.max(0, 3 - Math.abs(t - 0.5) * 6)}px)` };
      case 'vhs-glitch': return { ...base, transform: `translateX(${Math.random() > 0.5 ? 2 : -2}px) skewX(${Math.sin(t * 20) * 2}deg)` };
      case 'pixelate': return { ...base, filter: `blur(${t * 5}px)` };
      case 'shatter': return { ...base, transform: `scale(${1 + t * 0.1}) rotate(${t * 5}deg)`, opacity: 1 - t * 0.5 };
      case 'aurora': return { ...base, filter: `hue-rotate(${t * 360}deg) brightness(${1 + Math.sin(t * Math.PI) * 0.3})` };
      case 'fire-sweep': return { ...base, filter: `brightness(${1 + t * 0.5}) saturate(${1 + t})` };
      case 'light-leak': return { ...base, filter: `brightness(${1 + Math.sin(t * Math.PI) * 0.8}) contrast(${1 + t * 0.3})` };
      case 'bokeh': return { ...base, filter: `blur(${Math.sin(t * Math.PI) * 4}px)` };
      case 'cinematic-bars': return { ...base, clipPath: `inset(${10 - t * 10}% 0)` };
      case 'chromatic': return { ...base, filter: `hue-rotate(${t * 30}deg)`, textShadow: `${t * 3}px 0 red, ${-t * 3}px 0 cyan` };
      case 'mirror': return { ...base, transform: `scaleX(${1 + Math.sin(t * Math.PI * 2) * 0.3})` };
      case 'pulse': return { ...base, transform: `scale(${1 + Math.sin(t * Math.PI * 4) * 0.05})` };
      case 'shake': return { ...base, transform: `translateX(${Math.sin(t * 40) * 5}px)` };
      case 'wiggle': return { ...base, transform: `rotate(${Math.sin(t * 30) * 5}deg)` };
      case 'flash': return { ...base, filter: `brightness(${1 + (t < 0.1 ? t * 10 : (1 - t) * 0.5)})` };
      case 'grow': return { ...base, transform: `scale(${1 + Math.sin(t * Math.PI) * 0.2})` };
      case 'teeter': return { ...base, transform: `rotate(${Math.sin(t * Math.PI * 3) * 8}deg)` };
      case 'turn': return { ...base, transform: `perspective(800px) rotateY(${t * 360}deg)` };
      case 'glitch': return { ...base, transform: `translate(${Math.random() * 4 - 2}px, ${Math.random() * 4 - 2}px)` };
      default: return base;
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* ── Top row: Source + Preview ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Source Panel */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-cyan-500/15">
              <Scissors size={16} className="text-cyan-400" />
            </div>
            <h2 className="text-base font-bold tracking-tight">Image Editor</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            Edit images, add animations & transitions, import from files or URLs.
          </p>

          {/* Import Sources */}
          <div className="flex gap-2 mb-3">
            <input ref={fileInputRef} type="file" accept="image/*"
              onChange={e => loadEditImage(e.target.files?.[0] ?? null)}
              className="flex-1 text-[11px] text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-surface-3 file:text-gray-300 file:text-xs file:cursor-pointer"
            />
            <input ref={videoInputRef} type="file" accept="video/*"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  const url = URL.createObjectURL(f);
                  setStatus({ type: 'ok', message: `Video loaded: ${f.name} — use Video tab for full editing` });
                }
              }}
              className="hidden"
            />
          </div>

          {/* URL Import */}
          <div className="flex gap-2 mb-4">
            <input
              type="url"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="Paste image or video URL..."
              className="input-field flex-1 text-xs"
            />
            <select value={importType} onChange={e => setImportType(e.target.value as 'image' | 'video')}
              className="input-field text-xs w-20">
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
            <button onClick={importFromUrl} disabled={loading || !importUrl.trim()}
              className="px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/25 transition-all disabled:opacity-40">
              <Link2 size={14} />
            </button>
          </div>

          {/* Image Preview with Animation */}
          <div className="bg-black rounded-[10px] min-h-[200px] flex items-center justify-center border border-white/[0.06] overflow-hidden relative">
            {editImageB64 ? (
              <div className="overflow-hidden w-full h-full">
                <img
                  src={`data:image/png;base64,${editImageB64}`}
                  alt="Edit preview"
                  className="max-w-full max-h-[400px] rounded-[10px] object-contain mx-auto"
                  style={animPlaying ? getAnimStyle() : undefined}
                />
                {animPlaying && (
                  <div className="absolute bottom-2 right-2 bg-black/70 rounded-full px-3 py-1 flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-white font-bold">ANIMATING</span>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-gray-600 text-[13px]">Load an image or paste a URL</span>
            )}
          </div>

          {loading && (
            <div className="mt-3 flex items-center text-amber-400 text-xs">
              <Spinner /> Processing...
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 mt-3">
            <button onClick={addToSlideshow} disabled={!editImageB64}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[11px] font-bold hover:bg-purple-500/20 transition-all disabled:opacity-40">
              <Film size={12} /> Add to Slideshow
            </button>
            <button onClick={() => videoInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-3 border border-white/[0.06] text-gray-400 text-[11px] font-bold hover:text-white transition-all">
              <Upload size={12} /> Import Video
            </button>
          </div>
        </div>

        {/* Preview / Animation Result Panel */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-emerald-500/15">
              <Eye size={16} className="text-emerald-400" />
            </div>
            <h2 className="text-base font-bold tracking-tight">Animation Preview</h2>
          </div>

          {/* Transition Preview Area */}
          <div className="bg-black rounded-2xl min-h-[300px] flex items-center justify-center overflow-hidden relative border border-white/[0.06]">
            {slideImages.length > 0 ? (
              <div className="relative w-full h-full">
                <img
                  src={slideImages[currentSlide]}
                  alt={`Slide ${currentSlide + 1}`}
                  className="w-full h-full object-contain"
                  style={transPlaying ? getAnimStyle() : undefined}
                />
                {transPlaying && (
                  <div className="absolute bottom-2 left-2 bg-black/70 rounded-full px-3 py-1 flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-white font-bold">SLIDESHOW · {currentSlide + 1}/{slideImages.length}</span>
                  </div>
                )}
                {/* Slide indicators */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {slideImages.map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-all ${
                      i === currentSlide ? 'bg-white scale-125' : 'bg-white/30'
                    }`} />
                  ))}
                </div>
              </div>
            ) : editImageB64 ? (
              <img
                src={`data:image/png;base64,${editImageB64}`}
                alt="Preview"
                className="max-h-[400px] w-full object-contain rounded-lg"
                style={animPlaying ? getAnimStyle() : undefined}
              />
            ) : (
              <div className="text-center text-gray-600 text-[13px] px-10 py-10 leading-relaxed">
                <MonitorPlay size={40} className="mx-auto mb-3 opacity-40" />
                Animation preview appears here
                <span className="block text-[11px] opacity-60 mt-1">
                  Select an animation or transition to preview
                </span>
              </div>
            )}
          </div>

          {/* Preview Controls */}
          <div className="flex gap-2 mt-3">
            <button onClick={previewAnimation}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/25 transition-all">
              {animPlaying ? <Pause size={14} /> : <Play size={14} />}
              {animPlaying ? 'Stop' : 'Preview Animation'}
            </button>
            <button onClick={previewTransition}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 text-xs font-bold hover:bg-purple-500/25 transition-all">
              {transPlaying ? <Pause size={14} /> : <Play size={14} />}
              {transPlaying ? 'Stop' : 'Preview Slideshow'}
            </button>
          </div>

          <div className="flex gap-2 mt-2">
            <button onClick={generateAnimationVideo} disabled={loading || !editImageB64}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg btn-primary text-xs font-bold disabled:opacity-40">
              {loading ? <Spinner size={14} /> : <Wand2 size={14} />}
              Export as Video
            </button>
          </div>

          {/* Slideshow Management */}
          {slideImages.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Slideshow ({slideImages.length} slides)</span>
                <button onClick={() => { setSlideImages([]); setCurrentSlide(0); }}
                  className="text-[10px] text-gray-600 hover:text-rose-400 transition-colors">Clear All</button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {slideImages.map((src, i) => (
                  <div key={i} className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                    i === currentSlide ? 'border-purple-400' : 'border-white/[0.06] hover:border-white/[0.15]'
                  }`} onClick={() => setCurrentSlide(i)}>
                    <img src={src} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0.5 right-1 text-[8px] text-white font-bold drop-shadow">{i + 1}</span>
                    <button onClick={(e) => { e.stopPropagation(); setSlideImages(prev => prev.filter((_, j) => j !== i)); }}
                      className="absolute top-0.5 right-0.5 w-3 h-3 bg-black/60 rounded-full flex items-center justify-center text-[8px] text-white/70 hover:text-rose-400">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <StatusBadge status={status} />
        </div>
      </div>

      {/* ── Bottom row: Animations + Transitions + Editing Tools ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Image Animations Panel */}
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Film size={16} className="text-cyan-400" />
            <h3 className="text-sm font-bold">Image Animations</h3>
            <span className="text-[10px] text-gray-600">{IMAGE_ANIMATIONS.length}</span>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2 mb-3">
            <Clock size={12} className="text-gray-500" />
            <span className="text-[10px] text-gray-500">Duration:</span>
            {[3, 5, 8, 10, 15].map(d => (
              <button key={d} onClick={() => setAnimDuration(d)}
                className={`px-2 py-1 rounded text-[9px] font-bold transition-all border ${
                  animDuration === d
                    ? 'bg-cyan-500/15 border-cyan-400 text-white'
                    : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                }`}>{d}s</button>
            ))}
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1 mb-3">
            {ANIM_CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setAnimCategory(c.id)}
                className={`px-2 py-1 rounded-full text-[9px] font-semibold transition-all border ${
                  animCategory === c.id
                    ? 'bg-cyan-500/10 border-cyan-400 text-white'
                    : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                }`}>{c.label}</button>
            ))}
          </div>

          {/* Animation Grid */}
          <div className="grid grid-cols-3 gap-1.5 max-h-[350px] overflow-y-auto pr-1">
            {filteredAnims.map(a => (
              <button key={a.id} onClick={() => setSelectedAnim(a.id)} title={a.desc}
                className={`px-2 py-2 rounded-lg text-[9px] font-semibold transition-all border text-center ${
                  selectedAnim === a.id
                    ? 'bg-cyan-500/10 border-cyan-400 text-white'
                    : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                }`}>
                <span className="text-sm block">{a.icon}</span>
                <span className="block mt-0.5 leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Transitions Panel */}
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight size={16} className="text-purple-400" />
            <h3 className="text-sm font-bold">Transitions</h3>
            <span className="text-[10px] text-gray-600">{SLIDE_TRANSITIONS.length}</span>
          </div>

          {/* Transition Duration */}
          <div className="flex items-center gap-2 mb-3">
            <Gauge size={12} className="text-gray-500" />
            <span className="text-[10px] text-gray-500">Speed:</span>
            {[0.5, 1.0, 1.5, 2.0, 3.0].map(d => (
              <button key={d} onClick={() => setTransDuration(d)}
                className={`px-2 py-1 rounded text-[9px] font-bold transition-all border ${
                  transDuration === d
                    ? 'bg-purple-500/15 border-purple-400 text-white'
                    : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                }`}>{d}s</button>
            ))}
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1 mb-3">
            {TRANSITION_CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setTransCategory(c.id)}
                className={`px-2 py-1 rounded-full text-[9px] font-semibold transition-all border ${
                  transCategory === c.id
                    ? 'bg-purple-500/10 border-purple-400 text-white'
                    : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                }`}>{c.label}</button>
            ))}
          </div>

          {/* Transition Grid */}
          <div className="grid grid-cols-3 gap-1.5 max-h-[350px] overflow-y-auto pr-1">
            {filteredTrans.map(t => (
              <button key={t.id} onClick={() => setSelectedTrans(t.id)} title={t.desc}
                className={`px-2 py-2 rounded-lg text-[9px] font-semibold transition-all border text-center ${
                  selectedTrans === t.id
                    ? 'bg-purple-500/10 border-purple-400 text-white'
                    : 'bg-[#0a0a12] border-white/[0.06] text-gray-500 hover:border-white/[0.12]'
                }`}>
                <span className="text-sm block">{t.icon}</span>
                <span className="block mt-0.5 leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Image Adjustments Panel */}
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sliders size={16} className="text-teal-400" />
            <h3 className="text-sm font-bold">Adjustments</h3>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {EDIT_BUTTONS.map((btn, i) => {
              const Icon = btn.icon;
              return (
                <button key={i} onClick={() => applyEdit(btn.action, btn.value)} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#0a0a12] border border-white/[0.06] text-[11px] font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all disabled:opacity-40">
                  <Icon size={13} />{btn.label}
                </button>
              );
            })}
          </div>

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

          <button onClick={applyAllEdits} disabled={loading}
            className="btn-primary w-full py-3 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-2">
            {loading ? <Spinner /> : <Brush size={15} />}
            Apply All Edits
          </button>
          <button onClick={reset}
            className="w-full mt-2 py-2.5 rounded-[10px] bg-surface-3 border border-white/[0.06] text-xs text-gray-400 hover:text-white transition-all flex items-center justify-center gap-2">
            <RefreshCw size={13} /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}
