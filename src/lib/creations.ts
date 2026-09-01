import { supabase } from "@/integrations/supabase/client";

export type Creation = {
  id: string;
  user_id: string | null;
  kind: "image" | "video" | "script";
  title: string | null;
  prompt: string;
  model: string | null;
  aspect_ratio: string | null;
  resolution: string | null;
  storage_path: string | null;
  poster_path: string | null;
  content: string | null;
  meta: unknown;
  created_at: string;
};

const BUCKET = "creations";

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head ?? "")?.[1] ?? "image/png";
  const binary = atob(body ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function signedUrl(path: string, expiresIn = 60 * 60 * 8): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function saveImage(input: {
  dataUrl: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  title?: string;
}): Promise<Creation> {
  const userId = await currentUserId();
  const blob = dataUrlToBlob(input.dataUrl);
  const path = `images/${crypto.randomUUID()}.png`;
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (up.error) throw new Error(up.error.message);

  const { data, error } = await supabase
    .from("creations")
    .insert({
      user_id: userId,
      kind: "image",
      title: input.title ?? input.prompt.slice(0, 70),
      prompt: input.prompt,
      model: input.model,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      storage_path: path,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Creation;
}

export async function saveVideo(input: {
  storagePath: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
}): Promise<Creation> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("creations")
    .insert({
      user_id: userId,
      kind: "video",
      title: input.prompt.slice(0, 70),
      prompt: input.prompt,
      model: input.model,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      storage_path: input.storagePath,
      meta: { durationSeconds: input.durationSeconds },
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Creation;
}

export async function saveScript(input: {
  idea: string;
  script: string;
  style: string;
  duration: string;
}): Promise<Creation> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("creations")
    .insert({
      user_id: userId,
      kind: "script",
      title: input.idea.slice(0, 70),
      prompt: input.idea,
      model: "openai/gpt-5.6-terra",
      content: input.script,
      meta: { style: input.style, duration: input.duration },
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Creation;
}

export async function listCreations(kind?: Creation["kind"]): Promise<Creation[]> {
  let query = supabase
    .from("creations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Creation[];
}

export async function deleteCreation(id: string): Promise<void> {
  const { error } = await supabase.from("creations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
