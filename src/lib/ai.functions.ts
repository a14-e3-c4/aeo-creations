import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

async function gatewayError(res: Response) {
  const text = await res.text().catch(() => "");
  let message = text;
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: { message?: string } };
    message = parsed.error?.message ?? parsed.message ?? text;
  } catch {
    /* keep raw text */
  }
  if (res.status === 402) {
    return new Error(message || "AI credits exhausted. Add credits to keep creating.");
  }
  if (res.status === 429) {
    return new Error(message || "Rate limited by the AI service. Try again in a moment.");
  }
  return new Error(message || `AI request failed (${res.status})`);
}

/* -------------------------------------------------------------------------- */
/* Script writer                                                              */
/* -------------------------------------------------------------------------- */

const ScriptInput = z.object({
  idea: z.string().min(3).max(4000),
  style: z.string().default("cinematic"),
  duration: z.string().default("60s"),
  tone: z.string().default("engaging"),
});

export const generateScript = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ScriptInput.parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.6-terra",
        input: [
          {
            role: "system",
            content:
              "You are a senior creative director writing production-ready short-form video scripts. " +
              "Always answer in clean markdown with: a Logline, a Shot List table (Shot | Visual | Camera | Duration), " +
              "a Voiceover / Dialogue section with timecodes, a Sound Design note, and finally a section titled " +
              "'AI Image Prompts' with 3-5 richly detailed prompts (lighting, lens, film stock, mood) ready to paste " +
              "into an image generator. Be specific and visual, never generic.",
          },
          {
            role: "user",
            content: `Idea: ${data.idea}\nVisual style: ${data.style}\nTarget length: ${data.duration}\nTone: ${data.tone}`,
          },
        ],
      }),
    });
    if (!res.ok) throw await gatewayError(res);

    const json = (await res.json()) as {
      output_text?: string;
      output?: { content?: { type?: string; text?: string }[] }[];
    };
    const text =
      json.output_text ??
      (json.output ?? [])
        .flatMap((item) => item.content ?? [])
        .filter((c) => typeof c.text === "string")
        .map((c) => c.text)
        .join("\n")
        .trim();

    if (!text) throw new Error("The script model returned no text. Try again.");
    return { script: text };
  });

/* -------------------------------------------------------------------------- */
/* Prompt enhancer                                                            */
/* -------------------------------------------------------------------------- */

const EnhanceInput = z.object({
  prompt: z.string().min(2).max(2000),
  target: z.enum(["image", "video"]).default("image"),
});

export const enhancePrompt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => EnhanceInput.parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.6-luna",
        input: [
          {
            role: "system",
            content:
              `Rewrite the user's idea into one dense, cinematic ${data.target} generation prompt. ` +
              "Add subject detail, composition, lens and camera, lighting, colour grade, texture and mood. " +
              (data.target === "video"
                ? "Describe a single continuous 8-second moment with one camera move. "
                : "Describe a single still frame in ultra-high detail. ") +
              "Return ONLY the prompt text, max 90 words, no quotes, no preamble.",
          },
          { role: "user", content: data.prompt },
        ],
      }),
    });
    if (!res.ok) throw await gatewayError(res);
    const json = (await res.json()) as {
      output_text?: string;
      output?: { content?: { text?: string }[] }[];
    };
    const text =
      json.output_text ??
      (json.output ?? [])
        .flatMap((i) => i.content ?? [])
        .map((c) => c.text ?? "")
        .join("")
        .trim();
    return { prompt: text || data.prompt };
  });

/* -------------------------------------------------------------------------- */
/* Video generation (async job)                                               */
/* -------------------------------------------------------------------------- */

const VideoInput = z.object({
  prompt: z.string().min(3).max(4000),
  model: z.enum(["google/veo-3.1-lite", "google/veo-3.1-fast", "google/veo-3.1"]),
  resolution: z.enum(["720p", "1080p", "4k"]),
  durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  aspectRatio: z.enum(["16:9", "9:16"]),
  generateAudio: z.boolean(),
  negativePrompt: z.string().max(500).optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
});

export const createVideoJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VideoInput.parse(d))
  .handler(async ({ data }) => {
    const hasImage = Boolean(data.imageBase64);
    // 1080p / 4k generations are 8-second only.
    const duration = data.resolution === "720p" ? data.durationSeconds : 8;

    const instance: Record<string, unknown> = { prompt: data.prompt };
    if (hasImage) {
      instance["image"] = {
        bytesBase64Encoded: data.imageBase64,
        mimeType: data.imageMimeType ?? "image/png",
      };
    }

    const parameters: Record<string, unknown> = {
      durationSeconds: duration,
      resolution: data.resolution,
      sampleCount: 1,
      generateAudio: data.generateAudio,
    };
    if (!hasImage) parameters["aspectRatio"] = data.aspectRatio;
    if (data.negativePrompt) parameters["negativePrompt"] = data.negativePrompt;

    const res = await fetch(`${GATEWAY}/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: data.model, instances: [instance], parameters }),
    });
    if (!res.ok) throw await gatewayError(res);
    const job = (await res.json()) as { id: string; status: string };
    return { id: job.id, status: job.status };
  });

const PollInput = z.object({ id: z.string().min(3) });

export const pollVideoJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PollInput.parse(d))
  .handler(async ({ data }) => {
    const key = apiKey();
    const res = await fetch(`${GATEWAY}/videos/${data.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw await gatewayError(res);
    const job = (await res.json()) as {
      id: string;
      status: string;
      progress?: number;
      error?: { message?: string };
    };

    if (job.status === "failed") {
      throw new Error(job.error?.message ?? "Video generation failed.");
    }
    if (job.status !== "completed") {
      return { status: job.status, progress: job.progress ?? 0, storagePath: null as string | null };
    }

    // Completed: pull the MP4 before the gateway copy expires and store it.
    const content = await fetch(`${GATEWAY}/videos/${data.id}/content`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!content.ok) throw await gatewayError(content);
    const bytes = new Uint8Array(await content.arrayBuffer());

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `videos/${data.id}.mp4`;
    const { error } = await supabaseAdmin.storage
      .from("creations")
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Could not store the video: ${error.message}`);

    return { status: "completed", progress: 100, storagePath: path };
  });
