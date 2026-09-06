import { useRef, useState, useCallback } from "react";
import { Download, Loader2, RefreshCw, Save, Sparkles, User, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { saveImage } from "@/lib/creations";

// ── Pollinations AI: Free, no API key ──────────────────────────────
function pollinationsAvatarUrl(prompt: string, size = 512): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${size}&height=${size}&nologo=true&seed=${Date.now()}`;
}

// ── DiceBear: Free, no API key ─────────────────────────────────────
type DiceBearStyle =
  | "adventurer"
  | "avataaars"
  | "big-ears"
  | "bottts"
  | "fun-emoji"
  | "lorelei"
  | "micah"
  | "notionists"
  | "open-peeps"
  | "personas"
  | "pixel-art"
  | "rings"
  | "shapes"
  | "thumbs";

const DICEBEAR_STYLES: { id: DiceBearStyle; label: string; emoji: string }[] = [
  { id: "avataaars", label: "Avataaars", emoji: "🧑" },
  { id: "adventurer", label: "Adventurer", emoji: "⚔️" },
  { id: "big-ears", label: "Big Ears", emoji: "🐘" },
  { id: "fun-emoji", label: "Fun Emoji", emoji: "😄" },
  { id: "lorelei", label: "Lorelei", emoji: "👩" },
  { id: "micah", label: "Micah", emoji: "🎨" },
  { id: "notionists", label: "Notionists", emoji: "📝" },
  { id: "open-peeps", label: "Open Peeps", emoji: "👥" },
  { id: "personas", label: "Personas", emoji: "🎭" },
  { id: "pixel-art", label: "Pixel Art", emoji: "👾" },
  { id: "bottts", label: "Bottts", emoji: "🤖" },
  { id: "rings", label: "Rings", emoji: "💍" },
  { id: "shapes", label: "Shapes", emoji: "🔷" },
  { id: "thumbs", label: "Thumbs", emoji: "👍" },
];

function diceBearUrl(style: DiceBearStyle, seed: string): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=512`;
}

// ── AI Avatar Styles ───────────────────────────────────────────────
const AVATAR_STYLES = [
  { id: "photorealistic", label: "Photorealistic", hint: "ultra-realistic, studio portrait, soft lighting, detailed skin texture" },
  { id: "anime", label: "Anime", hint: "anime style, vibrant colors, detailed eyes, cel shading" },
  { id: "cartoon", label: "Cartoon", hint: "cartoon style, bold outlines, bright colors, friendly expression" },
  { id: "3d-render", label: "3D Render", hint: "3D rendered character, Pixar style, subsurface scattering, soft shadows" },
  { id: "oil-painting", label: "Oil Painting", hint: "oil painting style, rich brushstrokes, classical portrait" },
  { id: "cyberpunk", label: "Cyberpunk", hint: "cyberpunk aesthetic, neon lighting, futuristic, high-tech" },
  { id: "fantasy", label: "Fantasy", hint: "fantasy character, magical glow, ethereal, detailed armor or robes" },
  { id: "pixel-art", label: "Pixel Art", hint: "pixel art style, retro gaming, 16-bit, clean pixels" },
];

const EXPRESSIONS = [
  { id: "smiling", label: "Smiling" },
  { id: "serious", label: "Serious" },
  { id: "laughing", label: "Laughing" },
  { id: "thoughtful", label: "Thoughtful" },
  { id: "confident", label: "Confident" },
  { id: "mysterious", label: "Mysterious" },
];

const GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "non-binary", label: "Non-binary" },
];

const BACKGROUNDS = [
  { id: "studio", label: "Studio" },
  { id: "nature", label: "Nature" },
  { id: "city", label: "City" },
  { id: "space", label: "Space" },
  { id: "gradient", label: "Gradient" },
  { id: "transparent", label: "None" },
];

const SIZES = [
  { id: "256", label: "256px" },
  { id: "512", label: "512px" },
  { id: "1024", label: "1024px" },
];

// ── Main Component ─────────────────────────────────────────────────
export function AvatarStudio({ onSaved }: { onSaved: () => void }) {
  const [mode, setMode] = useState<"ai" | "dicebear">("ai");

  // AI mode state
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("photorealistic");
  const [expression, setExpression] = useState("smiling");
  const [gender, setGender] = useState("female");
  const [background, setBackground] = useState("studio");
  const [size, setSize] = useState("512");

  // DiceBear mode state
  const [dicebearStyle, setDicebearStyle] = useState<DiceBearStyle>("avataaars");
  const [seed, setSeed] = useState("aeo-user-1");

  // Shared state
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Build AI prompt ──────────────────────────────────────────────
  const buildAvatarPrompt = useCallback(() => {
    const styleHint = AVATAR_STYLES.find((s) => s.id === style)?.hint ?? "";
    const bgHint =
      background === "transparent"
        ? ""
        : background === "studio"
          ? "studio portrait background"
          : background === "nature"
            ? "natural outdoor background"
            : background === "city"
              ? "urban cityscape background"
              : background === "space"
                ? "cosmic space background"
                : "smooth gradient background";

    const parts = [
      `${gender} character portrait`,
      styleHint,
      `${expression} expression`,
      bgHint,
      "headshot, centered face, high detail",
      prompt.trim(),
    ].filter(Boolean);

    return parts.join(", ");
  }, [gender, style, expression, background, prompt]);

  // ── Generate AI Avatar ───────────────────────────────────────────
  const generateAIAvatar = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const url = pollinationsAvatarUrl(buildAvatarPrompt(), parseInt(size));
      // Preload the image
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to generate avatar"));
        img.src = url;
      });

      // Convert to data URL via canvas
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || parseInt(size);
      canvas.height = img.naturalHeight || parseInt(size);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      setResult(canvas.toDataURL("image/png"));
      toast.success("Avatar generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar generation failed");
    } finally {
      setBusy(false);
    }
  }, [buildAvatarPrompt, size]);

  // ── Generate DiceBear Avatar ─────────────────────────────────────
  const generateDiceBear = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const url = diceBearUrl(dicebearStyle, seed);
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load DiceBear avatar"));
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 512, 512);
      setResult(canvas.toDataURL("image/png"));
      toast.success("Avatar generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "DiceBear generation failed");
    } finally {
      setBusy(false);
    }
  }, [dicebearStyle, seed]);

  // ── Save to library ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      await saveImage({
        dataUrl: result,
        prompt: mode === "ai" ? buildAvatarPrompt() : `DiceBear ${dicebearStyle}: ${seed}`,
        model: mode === "ai" ? "pollinations-ai" : `dicebear-${dicebearStyle}`,
        aspectRatio: "1:1",
        resolution: size,
      });
      toast.success("Avatar saved to library!");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }, [result, mode, buildAvatarPrompt, dicebearStyle, seed, size, onSaved]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* ── Controls Panel ──────────────────────────────────────────── */}
      <div className="panel space-y-5 p-6">
        <div className="flex items-center gap-2">
          <User className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">AI Avatar Generator</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Generate unique avatars using free AI services — no API keys required.
        </p>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "ai" | "dicebear")}>
          <TabsList className="w-full">
            <TabsTrigger value="ai" className="flex-1 gap-2">
              <Sparkles className="size-3.5" /> AI Generated
            </TabsTrigger>
            <TabsTrigger value="dicebear" className="flex-1 gap-2">
              <span className="text-sm">🎨</span> Stylized
            </TabsTrigger>
          </TabsList>

          {/* ── AI Generated Tab ──────────────────────────────────────── */}
          <TabsContent value="ai" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="avatar-prompt">Description (optional)</Label>
              <Textarea
                id="avatar-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A young woman with curly hair, wearing a leather jacket..."
                className="resize-none bg-background/60"
              />
            </div>

            <ChipRow label="Style" options={AVATAR_STYLES} value={style} onChange={setStyle} />
            <ChipRow label="Expression" options={EXPRESSIONS} value={expression} onChange={setExpression} />
            <ChipRow label="Character" options={GENDERS} value={gender} onChange={setGender} />
            <ChipRow label="Background" options={BACKGROUNDS} value={background} onChange={setBackground} />
            <ChipRow label="Resolution" options={SIZES} value={size} onChange={setSize} />

            <Button onClick={generateAIAvatar} disabled={busy} size="lg" className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? "Generating..." : "Generate AI Avatar"}
            </Button>
          </TabsContent>

          {/* ── DiceBear Tab ──────────────────────────────────────────── */}
          <TabsContent value="dicebear" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="seed">Seed (name or keyword)</Label>
              <div className="flex gap-2">
                <input
                  id="seed"
                  type="text"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="Enter a name or keyword..."
                  className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Same seed + style = same avatar. Change the seed for a different character.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Avatar Style</Label>
              <div className="grid grid-cols-2 gap-2">
                {DICEBEAR_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDicebearStyle(s.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                      dicebearStyle === s.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/50 text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    <span>{s.emoji}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={generateDiceBear} disabled={busy} size="lg" className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {busy ? "Generating..." : "Generate Stylized Avatar"}
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Preview Panel ────────────────────────────────────────────── */}
      <div className="panel flex flex-col gap-4 p-6">
        <div className="relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-background/60">
          {result ? (
            <img
              src={result}
              alt="Generated avatar"
              className="max-h-[62vh] w-full object-contain rounded-lg"
            />
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {busy ? (
                <div className="space-y-3">
                  <Loader2 className="mx-auto size-10 animate-spin opacity-60" />
                  <p className="animate-pulse">
                    {mode === "ai" ? "Drawing your avatar with AI..." : "Crafting your stylized avatar..."}
                  </p>
                </div>
              ) : (
                <>
                  <User className="mx-auto mb-3 size-10 opacity-40" />
                  <p className="font-medium mb-1">Your avatar appears here</p>
                  <p className="text-xs text-muted-foreground">
                    Pick a style and generate — it's completely free.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={!result || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save to library
          </Button>
          <Button asChild variant="secondary" disabled={!result}>
            <a href={result ?? "#"} download={`aeo-avatar-${Date.now()}.png`}>
              <Download className="size-4" /> Download
            </a>
          </Button>
          {result && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (mode === "ai" ? generateAIAvatar() : generateDiceBear())}
              disabled={busy}
            >
              <RefreshCw className="size-3.5" /> Regenerate
            </Button>
          )}
        </div>

        {/* ── Quick presets ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Quick Presets</Label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "🧑‍💼 Professional", prompt: "professional business portrait, suit, confident" },
              { label: "🧙 Fantasy Hero", prompt: "fantasy warrior character, armor, epic lighting" },
              { label: "🤖 Cyberpunk Bot", prompt: "cyberpunk android, neon glow, futuristic" },
              { label: "🌸 Anime Protagonist", prompt: "anime protagonist, determined expression, vibrant" },
              { label: "🎮 Pixel Gamer", prompt: "pixel art gamer character, retro style" },
              { label: "👑 Royal Portrait", prompt: "royal king or queen portrait, crown, majestic" },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPrompt(preset.prompt);
                  setMode("ai");
                  // Auto-generate after a tick
                  setTimeout(() => {
                    const url = pollinationsAvatarUrl(
                      `${AVATAR_STYLES.find((s) => s.id === style)?.hint ?? ""}, ${preset.prompt}, headshot, centered face`,
                      parseInt(size)
                    );
                    setBusy(true);
                    setResult(null);
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      canvas.width = img.naturalWidth || 512;
                      canvas.height = img.naturalHeight || 512;
                      const ctx = canvas.getContext("2d")!;
                      ctx.drawImage(img, 0, 0);
                      setResult(canvas.toDataURL("image/png"));
                      setBusy(false);
                      toast.success("Preset avatar generated!");
                    };
                    img.onerror = () => {
                      setBusy(false);
                      toast.error("Failed to generate preset");
                    };
                    img.src = url;
                  }, 50);
                }}
                className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared Chip Row Component ──────────────────────────────────────
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
                : "border-border bg-background/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
