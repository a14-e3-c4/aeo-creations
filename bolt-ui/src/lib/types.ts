export type GenerationType = 'image' | 'video' | 'ai-video';

export interface Generation {
  id: string;
  type: GenerationType;
  prompt: string;
  model: string;
  style: string;
  aspect_ratio: string;
  resolution: string;
  width: number;
  height: number;
  effect: string;
  duration: number;
  media_url: string;
  thumbnail_url: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LibraryItem {
  id: string;
  filename: string;
  type: 'image' | 'video';
  url: string;
  size: number;
  created_at: string;
}

export interface UsageEntry {
  id: string;
  action: string;
  model: string | null;
  status: string;
  created_at: string;
}

export interface ScriptScene {
  scene_number: number;
  duration: number;
  visual_prompt: string;
  voiceover: string;
  caption: string;
}

export interface GeneratedScript {
  title: string;
  message: string;
  scenes: ScriptScene[];
  full_script: string;
}

export interface StatusResponse {
  type: 'idle' | 'loading' | 'ok' | 'err' | 'cached';
  message: string;
}
