import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Clapperboard, Download, ImagePlus, Loader2, Save, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { createVideoJob, enhancePrompt, pollVideoJob } from "@/lib/ai.functions";
import { fileToBase64, saveVideo, signedUrl } from "@/lib/creations";

const MODELS = [
  { id: "google/veo-3.1-lite", label: "Lite — fastest & cheapest" },
  { id: "google/veo-3.1-fast", label: "Fast — better quality" },
  { id: "google/veo-3.1", label: "Cinema — maximum quality" },
] as const;

const RESOLUTIONS = [
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "4k", label: "4K" },
] as const;

const DURATIONS = [4, 6, 8] as const;
const RATIOS = [
  { id: "16:9", label: "16:9 landscape" },
  { id: "9:16", label: "9:16 vertical" },
] as const;

type Model = (typeof MODELS)[number]["id"];
type Resolution = (typeof RESOLUTIONS)[number]["id"];

export function VideoStudio({ onSaved }: { onSaved: () => void }) {
  const enhance = useServerFn(enhancePrompt);
  const create = useServerFn(createVideoJob);
  const poll = useServerFn(pollVideoJob);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [model, setModel] = useState<Model>("google/veo-3.1-fast");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [duration, setDuration] = useState<4 | 6 | 8>(8);
  const [ratio, setRatio] = useState<"16:9" | "9:16">("16:9");
  const [audio, setAudio] = useState(true);
  const [startFrame, setStartFrame] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  useEffect(() => () => void (cancelled.current = true), []);

  const fourKAvailable = model !== "google/veo-3.1-lite";
  const effectiveResolution: Resolution =
    resolution === "4k" && !fourKAvailable ? "1080p" : resolution;
  const effectiveDuration = effectiveResolution === "720p" ? duration : 8;

  async function handleGenerate() {
    if (prompt.trim().length < 3) {
      toast.error("Describe the shot you want first.");
      return;
    }
    setBusy(true);
    setVideoUrl(null);
    setStoragePath(null);
    setProgress(5);
    setStatusText("Submitting your shot…");
    try {
      const { id } = await create({
        data: {
          prompt: prompt.trim(),
          model,
          resolution: effectiveResolution,
          durationSeconds: effectiveDuration,
          aspectRatio: ratio,
          generateAudio: audio,
          negativePrompt: negative.trim() || undefined,
          imageBase64: startFrame ? startFrame.split(",")[1] : undefined,
          imageMimeType: startFrame
            ? (/:(.*?);/.exec(startFrame)?.[1] ?? "image/png")
            : undefined,
        },
      });

      setStatusText("Generating — this usually takes 1–3 minutes.");
      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((r) => setTimeout(r, 6000));
        if (cancelled.current) return;
        const res = await poll({ data: { id } });
        setProgress(Math.max(10, Math.min(95, res.progress || 10)));
        if (res.status === "completed" && res.storagePath) {
          setProgress(100);
          setStatusText("Done.");
          setStoragePath(res.storagePath);
          setVideoUrl(await signedUrl(res.storagePath));
          return;
        }
      }
      throw new Error("The video is taking unusually long. Check back shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Video generation failed");
      setStatusText("");
      setProgress(0);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnhance() {
    if (prompt.trim().length < 3) return;
    try {
      const res = await enhance({ data: { prompt, target: "video" } });
      setPrompt(res.prompt);
      toast.success("Prompt upgraded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enhance prompt");
    }
  }

  async function handleSave() {
    if (!storagePath) return;
    try {
      await saveVideo({
        storagePath,
        prompt: prompt.trim(),
        model,
        aspectRatio: ratio,
        resolution: effectiveResolution,
        durationSeconds: effectiveDuration,
      });
      toast.success("Saved to your library");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="panel space-y-5 p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="vid-prompt">Shot description</Label>
            <Button variant="ghost" size="sm" onClick={handleEnhance}>
              <Wand2 className="size-4" /> Enhance
            </Button>
          </div>
          <Textarea
            id="vid-prompt"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Slow dolly through a rain-soaked Tokyo alley at night, neon reflections on wet asphalt…"
            className="resize-none bg-background/60"
          />
          <p className="text-xs text-muted-foreground">
            One scene per clip. For spoken lines write: <em>the narrator says: your line</em>.
          </p>
        </div>

        <ChipRow
          label="Engine"
          options={MODELS.map((m) => ({ id: m.id, label: m.label }))}
          value={model}
          onChange={(v) => setModel(v as Model)}
        />
        <ChipRow
          label="Resolution"
          options={RESOLUTIONS.filter((r) => r.id !== "4k" || fourKAvailable).map((r) => ({
            id: r.id,
            label: r.label,
          }))}
          value={effectiveResolution}
          onChange={(v) => setResolution(v as Resolution)}
        />
        <ChipRow
          label="Duration"
          options={DURATIONS.map((d) => ({ id: String(d), label: `${d}s` }))}
          value={String(effectiveDuration)}
          onChange={(v) => setDuration(Number(v) as 4 | 6 | 8)}
        />
        {effectiveResolution !== "720p" && (
          <p className="-mt-2 text-xs text-muted-foreground">
            1080p and 4K clips are always 8 seconds.
          </p>
        )}
        {!startFrame && (
          <ChipRow
            label="Framing"
            options={RATIOS.map((r) => ({ id: r.id, label: r.label }))}
            value={ratio}
            onChange={(v) => setRatio(v as "16:9" | "9:16")}
          />
        )}

        <div className="space-y-2">
          <Label htmlFor="vneg">Keep out of frame</Label>
          <Textarea
            id="vneg"
            rows={2}
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            placeholder="text overlays, cars, crowds"
            className="resize-none bg-background/60 text-sm"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Generate soundtrack</p>
            <p className="text-xs text-muted-foreground">Ambient sound, effects and dialogue</p>
          </div>
          <Switch checked={audio} onCheckedChange={setAudio} />
        </div>

        <div className="space-y-2">
          <Label>Start frame (optional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {startFrame && (
              <div className="relative">
                <img
                  src={startFrame}
                  alt=""
                  className="h-16 rounded-lg border border-border object-cover"
                />
                <button
                  onClick={() => setStartFrame(null)}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-destructive text-destructive-foreground"
                  aria-label="Remove start frame"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" /> Animate an image
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setStartFrame(await fileToBase64(f));
              }}
            />
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={busy} size="lg" className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
          {busy ? "Generating video…" : "Generate video"}
        </Button>
      </div>

      <div className="panel flex flex-col gap-4 p-6">
        <div
          className={cn(
            "relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-background/60",
          )}
        >
          {videoUrl ? (
            <video src={videoUrl} controls playsInline className="max-h-[62vh] w-full" />
          ) : (
            <div className="w-full max-w-sm p-8 text-center text-sm text-muted-foreground">
              {busy ? (
                <>
                  <Loader2 className="mx-auto mb-4 size-8 animate-spin opacity-60" />
                  <Progress value={progress} className="mb-3" />
                  {statusText}
                </>
              ) : (
                <>
                  <Clapperboard className="mx-auto mb-3 size-8 opacity-40" />
                  Your finished clip plays here and is stored safely in your library.
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={!storagePath}>
            <Save className="size-4" /> Save to library
          </Button>
          <Button asChild variant="secondary" disabled={!videoUrl}>
            <a href={videoUrl ?? "#"} download={`aeo-${Date.now()}.mp4`}>
              <Download className="size-4" /> Download
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              value === o.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/50 text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
