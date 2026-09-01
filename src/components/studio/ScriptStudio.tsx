import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PenLine, Save, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateScript } from "@/lib/ai.functions";
import { saveScript } from "@/lib/creations";

const STYLES = ["cinematic", "documentary", "commercial", "vlog", "music video", "explainer"];
const DURATIONS = ["15s", "30s", "60s", "90s", "3 min"];
const TONES = ["engaging", "epic", "warm", "playful", "serious", "luxurious"];

export function ScriptStudio({ onSaved }: { onSaved: () => void }) {
  const run = useServerFn(generateScript);
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [duration, setDuration] = useState("60s");
  const [tone, setTone] = useState("engaging");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleGenerate() {
    if (idea.trim().length < 3) {
      toast.error("Describe your video idea first.");
      return;
    }
    setBusy(true);
    setScript("");
    try {
      const res = await run({ data: { idea, style, duration, tone } });
      setScript(res.script);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Script generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    try {
      await saveScript({ idea, script, style, duration });
      toast.success("Script saved to your library");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="panel space-y-5 p-6">
        <div className="space-y-2">
          <Label htmlFor="idea">Your video idea</Label>
          <Textarea
            id="idea"
            rows={6}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="A short documentary about how coffee is made, from farm to cup..."
            className="resize-none bg-background/60"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Style" value={style} onChange={setStyle} options={STYLES} />
          <Field label="Length" value={duration} onChange={setDuration} options={DURATIONS} />
          <Field label="Tone" value={tone} onChange={setTone} options={TONES} />
        </div>

        <Button onClick={handleGenerate} disabled={busy} className="w-full" size="lg">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
          {busy ? "Writing your script…" : "Generate script"}
        </Button>
        <p className="text-xs text-muted-foreground">
          You get a logline, shot list, timed voiceover, sound design notes and ready-to-use image
          prompts.
        </p>
      </div>

      <div className="panel flex min-h-[420px] flex-col p-6">
        {script ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Your script
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(script);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="size-4" /> Copy
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="size-4" /> Save
                </Button>
              </div>
            </div>
            <pre className="max-h-[560px] flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-background/60 p-4 font-sans text-sm leading-relaxed text-foreground/90">
              {script}
            </pre>
          </>
        ) : (
          <div className="m-auto max-w-sm text-center text-sm text-muted-foreground">
            <PenLine className="mx-auto mb-3 size-8 opacity-40" />
            Your shot-by-shot script will appear here, complete with image prompts you can send
            straight to the image studio.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-background/60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="capitalize">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
