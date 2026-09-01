import { createFileRoute } from "@tanstack/react-router";

type Body = {
  prompt: string;
  stream?: boolean;
  model?: string;
  referenceImages?: string[]; // data URLs
};

const ALLOWED_MODELS = [
  "google/gemini-3-pro-image",
  "google/gemini-3.1-flash-image",
] as const;

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, stream = true, model, referenceImages } = (await request.json()) as Body;
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        if (!prompt || !prompt.trim()) {
          return new Response("Prompt is required", { status: 400 });
        }

        const chosen =
          model && (ALLOWED_MODELS as readonly string[]).includes(model)
            ? model
            : "google/gemini-3-pro-image";

        const content: unknown[] = [{ type: "text", text: prompt }];
        for (const img of referenceImages ?? []) {
          content.push({ type: "image_url", image_url: { url: img } });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: chosen,
            messages: [
              {
                role: "user",
                content: content.length === 1 ? prompt : content,
              },
            ],
            modalities: ["image", "text"],
            ...(stream ? { stream: true } : {}),
          }),
        });

        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), { status: upstream.status });
        }
        if (!stream) {
          return new Response(upstream.body, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
