export interface StylePreset {
  id: string;
  label: string;
  hint: string;
  icon: string;
}

export interface AspectPreset {
  ratio: string;
  label: string;
  width: number;
  height: number;
  hint: string;
}

export interface EffectPreset {
  id: string;
  label: string;
  icon: string;
}

export interface AIModelOption {
  value: string;
  label: string;
  group: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'cinematic', label: 'Cinematic', hint: 'Film-quality lighting', icon: 'Clapperboard' },
  { id: 'photorealistic', label: 'Photorealistic', hint: 'Ultra-real photos', icon: 'Camera' },
  { id: 'anime', label: 'Anime', hint: 'Japanese animation', icon: 'Palette' },
  { id: '3d render', label: '3D Render', hint: 'CGI quality', icon: 'Box' },
  { id: 'digital art', label: 'Digital Art', hint: 'Illustration style', icon: 'Brush' },
  { id: 'oil painting', label: 'Oil Painting', hint: 'Classical artwork', icon: 'Image' },
  { id: 'watercolor', label: 'Watercolor', hint: 'Soft painted look', icon: 'Droplets' },
  { id: 'pixel art', label: 'Pixel Art', hint: 'Retro game style', icon: 'Grid3x3' },
];

export const ASPECT_PRESETS: AspectPreset[] = [
  { ratio: '16:9', label: '16:9 Landscape', width: 4096, height: 2304, hint: '4096x2304 - 4K Ultra HD' },
  { ratio: '9:16', label: '9:16 Portrait', width: 2304, height: 4096, hint: '2304x4096 - 4K Vertical' },
  { ratio: '1:1', label: '1:1 Square', width: 4096, height: 4096, hint: '4096x4096 - 4K Square' },
  { ratio: '4:3', label: '4:3 Classic', width: 4096, height: 3072, hint: '4096x3072 - 4K Classic' },
  { ratio: '21:9', label: '21:9 Ultrawide', width: 5120, height: 2160, hint: '5120x2160 - 5K Cinema' },
  { ratio: '2:1', label: '2:1 Univisium', width: 4096, height: 2048, hint: '4096x2048 - 4K Wide' },
];

export const EFFECT_PRESETS: EffectPreset[] = [
  { id: 'zoom-in', label: 'Zoom In', icon: 'ZoomIn' },
  { id: 'zoom-out', label: 'Zoom Out', icon: 'ZoomOut' },
  { id: 'pan-left', label: 'Pan Left', icon: 'ArrowLeft' },
  { id: 'pan-right', label: 'Pan Right', icon: 'ArrowRight' },
  { id: 'zoom-pan', label: 'Zoom+Pan', icon: 'Move' },
  { id: 'dolly', label: 'Dolly', icon: 'Film' },
];

export const AI_MODELS: AIModelOption[] = [
  { value: 'openrouter', label: 'Veo 3.1 / Wan 3.0 / FLUX 3', group: 'OpenRouter' },
  { value: 'rewind', label: 'Seedance / Kling / Veo', group: 'Rewind AI' },
  { value: 'json2video', label: 'Cinematic text effects', group: 'JSON2Video' },
  { value: 'pixverse', label: '5s clips', group: 'PixVerse v6' },
  { value: 'ngrok-video', label: 'Free GPU tunnel', group: 'Kaggle Tunnel' },
  { value: 'ltx-2.3', label: 'Fast generation', group: 'LTX 2.3' },
  { value: 'wan-2.2', label: 'Strong physics', group: 'WAN 2.2' },
  { value: 'kling-3.0', label: 'Best quality', group: 'Kling 3.0' },
];

export const PROMPT_PRESETS: string[] = [
  'a golden retriever running on a beach at sunset, cinematic, slow motion',
  'astronaut floating in space, earth in background, 4k, highly detailed',
  'a cat walking through a neon-lit tokyo street at night, rain, reflections',
  'timelapse of clouds over a mountain range, golden hour, cinematic',
  'close-up of a coffee cup with steam rising, morning light, shallow depth of field',
  'dragon flying over a medieval castle, fire breath, epic cinematic shot',
  'underwater coral reef with colorful fish, sunlight filtering through water',
  'cyberpunk city street at night, neon signs, rain, reflections, 4k cinematic',
];

export const SCRIPT_STYLES = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'vlog', label: 'Vlog' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'music-video', label: 'Music Video' },
  { value: 'tutorial', label: 'Tutorial' },
];

export const SCRIPT_DURATIONS = [
  { value: '15', label: '15s (Short)' },
  { value: '30', label: '30s (Medium)' },
  { value: '60', label: '60s (Long)' },
  { value: '120', label: '2 min' },
  { value: '300', label: '5 min' },
];

export const VIDEO_DURATIONS = [
  { value: 3, label: '3 seconds' },
  { value: 5, label: '5 seconds' },
  { value: 8, label: '8 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
];

export const RESOLUTIONS = [
  { value: '480p', label: '480p (Free tier)' },
  { value: '720p', label: '720p HD' },
  { value: '1080p', label: '1080p Full HD' },
  { value: '1440p', label: '1440p QHD' },
  { value: '2160p', label: '2160p 4K Ultra HD' },
];

export const IMAGE_RESOLUTIONS = [
  { value: '1080p', label: '1080p Full HD', width: 1920, height: 1080 },
  { value: '1440p', label: '1440p QHD', width: 2560, height: 1440 },
  { value: '4k', label: '4K Ultra HD', width: 4096, height: 2304 },
  { value: '5k', label: '5K Cinema', width: 5120, height: 2880 },
  { value: '8k', label: '8K Ultra HD', width: 7680, height: 4320 },
];
