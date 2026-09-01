import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, ImagePlus, Loader2, Save, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { streamImage } from "@/lib/streamImage";
import { enhancePrompt } from "@/lib/ai.functions";
import { fileToBase64, saveImage } from "@/lib/creations";

const STYLE_PRESETS = [
  { id: "cinematic", label: "Cinematic", hint: "anamorphic lens flare, shallow depth of field, teal-amber grade" },
  { id: "photoreal", label: "Photoreal", hint: "shot on 85mm f/1.4, natural skin texture, true-to-life colour" },
  { id: "product", label: "Product", hint: "studio softbox lighting, seamless backdrop, glossy reflections" },
  { id: "editorial", label: "Editorial", hint: "high-fashion editorial, dramatic rim light, matte film grain" },
  { id: "3d", label: "3D render", hint: "octane render, subsurface scattering, global illumination" },
  { id: "anime", label: "Illustrated", hint: "hand-painted illustration, bold linework, rich gouache texture" },
];

const RATIOS = [
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "21:9", label: "21:9" },
];

const QUALITY = [
  { id: "2K", label: "2K", hint: "2560px wide, crisp detail" },
  { id: "4K", label: "4K", hint: "3840px wide, ultra detail" },
  { id: "8K", label: "8K", hint: "maximum micro-detail" },
];

const MODELS = [
  { id: "google/gemini-3-pro-image", label: "Studio (highest quality)" },
  { id: "google/gemini-3.1-flash-image", label: "Turbo (fast)" },
];

export function ImageStudio({ onSaved }: { onSaved: () => void }) {
  const enhance = useServerFn(enhancePrompt);
  const fileInput = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("blurry, low quality, distorted anatomy, watermark");
  const [style, setStyle] = useState("cinematic");
  const [ratio, setRatio] = useState("16:9");
  const [quality, setQuality] = useState("4K");
  const [model, setModel] = useState(MODELS[0]!.id);
  const [hdr, setHdr] = useState(true);
  const [refs, setRefs] = useState<string[]>([]);

  const [src, setSrc] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  function buildPrompt() {
    const preset = STYLE_PRESETS.find((s) => s.id === style)!;
    return [
      prompt.trim(),
      preset.hint,
      `aspect ratio ${ratio}`,
      `${quality} ultra-high resolution, razor-sharp focus, fine micro-detail`,
      hdr ? "high dynamic range, deep contrast, rich colour depth, professional colour grading" : "",
      negative.trim() ? `Avoid: ${negative.trim()}.` : "",
      refs.length ? "Match the subject, style and identity of the supplied reference image(s)." : "",
    ]
      .filter(Boolean)
      .join(". ");
  }

  async function handleGenerate() {
    if (prompt.trim().length < 3) {
      toast.error("Describe the image you want first.");
      return;
    }
    setBusy(true);
    setSrc(null);
    setIsFinal(false);
    try {
      await streamImage(
        { prompt: buildPrompt(), model, referenceImages: refs },
        (dataUrl, final) => {
          setSrc(dataUrl);
          if (final) setIsFinal(true);
        },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnhance() {
    if (prompt.trim().length < 3) return;
    try {
      const res = await enhance({ data: { prompt, target: "image" } });
      setPrompt(res.prompt);
      toast.success("Prompt upgraded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enhance prompt");
    }
  }

  async function handleSave() {
    if (!src) return;
    setSaving(true);
    try {
      await saveImage({
        dataUrl: src,
        prompt: prompt.trim(),
        model,
        aspectRatio: ratio,
        resolution: quality,
      });
      toast.success("Saved to your library");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 3);
    const encoded = await Promise.all(list.map(fileToBase64));
    setRefs(encoded);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="panel space-y-5 p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="img-prompt">Prompt</Label>
            <Button variant="ghost" size="sm" onClick={handleEnhance}>
              <Wand2 className="size-4" /> Enhance
            </Button>
          </div>
          <Textarea
            id="img-prompt"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A lone rider crossing salt flats at golden hour, dust trailing behind…"
            className="resize-none bg-background/60"
          />
        </div>

        <ChipRow
          label="Look"
          options={STYLE_PRESETS.map((s) => ({ id: s.id, label: s.label }))}
          value={style}
          onChange={setStyle}
        />
        <ChipRow label="Framing" options={RATIOS} value={ratio} onChange={setRatio} />
        <ChipRow label="Resolution" options={QUALITY} value={quality} onChange={setQuality} />
        <ChipRow label="Engine" options={MODELS} value={model} onChange={setModel} />

        <div className="space-y-2">
          <Label htmlFor="neg">Negative prompt</Label>
          <Textarea
            id="neg"
            rows={2}
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            className="resize-none bg-background/60 text-sm"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium">HDR colour grade</p>
            <p className="text-xs text-muted-foreground">Deeper contrast and richer colour depth</p>
          </div>
          <Switch checked={hdr} onCheckedChange={setHdr} />
        </div>

        <div className="space-y-2">
          <Label>Reference images (optional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {refs.map((r, i) => (
              <div key={i} className="relative">
                <img src={r} alt="" className="size-16 rounded-lg border border-border object-cover" />
                <button
                  onClick={() => setRefs(refs.filter((_, idx) => idx !== i))}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-destructive text-destructive-foreground"
                  aria-label="Remove reference"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" /> Add
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Add a photo to edit it, restyle it, or keep a character consistent.
          </p>
        </div>

        <Button onClick={handleGenerate} disabled={busy} size="lg" className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "Rendering…" : "Generate image"}
        </Button>
      </div>

      <div className="panel flex flex-col gap-4 p-6">
        <div className="relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-background/60">
          {src ? (
            <img
              src={src}
              alt={prompt || "Generated image"}
              className={cn(
                "max-h-[62vh] w-full object-contain transition-[filter] duration-500",
                isFinal ? "blur-0" : "blur-2xl",
              )}
            />
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {busy ? (
                <Loader2 className="mx-auto size-8 animate-spin opacity-60" />
              ) : (
                <>
                  <Sparkles className="mx-auto mb-3 size-8 opacity-40" />
                  Your render previews here live as it draws.
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={!src || !isFinal || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save to library
          </Button>
          <Button asChild variant="secondary" disabled={!src || !isFinal}>
            <a href={src ?? "#"} download={`aeo-${Date.now()}.png`}>
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
