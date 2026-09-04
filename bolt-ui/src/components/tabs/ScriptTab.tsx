import { useState } from 'react';
import { Sparkles, Copy, Film, Clapperboard, Mic, MessageSquare } from 'lucide-react';
import { SCRIPT_STYLES, SCRIPT_DURATIONS } from '@/lib/presets';
import type { GeneratedScript, StatusResponse } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/Spinner';

interface ScriptTabProps {
  onUsePrompt: (prompt: string) => void;
  onRecordUsage: (action: string, model: string, status: string) => void;
}

export function ScriptTab({ onUsePrompt, onRecordUsage }: ScriptTabProps) {
  const [idea, setIdea] = useState('');
  const [style, setStyle] = useState('cinematic');
  const [duration, setDuration] = useState('30');
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [status, setStatus] = useState<StatusResponse>({ type: 'idle', message: 'Enter your video idea and hit Generate.' });
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!idea.trim()) {
      setStatus({ type: 'err', message: 'Enter a video idea first.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'loading', message: 'AI is writing your script...' });
    try {
      const resp = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, style, duration: parseInt(duration) }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus({ type: 'err', message: data.error || 'Script generation failed.' });
        onRecordUsage('script', 'groq', 'error');
        return;
      }
      setScript(data);
      setStatus({ type: 'ok', message: data.message });
      onRecordUsage('script', 'groq', 'ok');
    } catch (e) {
      setStatus({ type: 'err', message: `Network error: ${(e as Error).message}` });
      onRecordUsage('script', 'groq', 'error');
    } finally {
      setLoading(false);
    }
  }

  function copyScript() {
    if (script) {
      navigator.clipboard.writeText(script.full_script);
      setStatus({ type: 'ok', message: 'Script copied to clipboard!' });
    }
  }

  function generateAllScenes() {
    if (script && script.scenes.length) {
      onUsePrompt(script.scenes[0].visual_prompt);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1400px] mx-auto">
      {/* Input Panel */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-cyan-500/15">
            <Sparkles size={16} className="text-cyan-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">AI Script Generator</h2>
        </div>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
          Powered by Groq AI. Generate complete video scripts with scenes, voiceover, and cinematic visual prompts.
        </p>

        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Video Idea</label>
        <textarea
          value={idea}
          onChange={e => setIdea(e.target.value)}
          placeholder="A short documentary about how coffee is made, from farm to cup..."
          className="input-field min-h-[88px] resize-y leading-relaxed"
        />

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Visual Style</label>
            <select value={style} onChange={e => setStyle(e.target.value)} className="input-field cursor-pointer">
              {SCRIPT_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Duration</label>
            <select value={duration} onChange={e => setDuration(e.target.value)} className="input-field cursor-pointer">
              {SCRIPT_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="btn-primary w-full mt-4 py-3 rounded-[10px] text-[13px] font-bold tracking-wide flex items-center justify-center gap-2"
        >
          {loading ? <Spinner /> : <Sparkles size={15} />}
          {loading ? 'Generating...' : 'Generate Script'}
        </button>
        <StatusBadge status={status} />
      </div>

      {/* Output Panel */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center bg-teal-500/15">
            <Clapperboard size={16} className="text-teal-400" />
          </div>
          <h2 className="text-base font-bold tracking-tight">Generated Script</h2>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {!script ? (
            <p className="text-gray-600 text-[13px] text-center py-16">Your script will appear here after generation.</p>
          ) : (
            <div>
              <h3 className="text-cyan-400 font-bold text-base mb-2">{script.title}</h3>
              <p className="text-xs text-gray-500 mb-4">{script.message}</p>
              {script.scenes.map(scene => (
                <div key={scene.scene_number} className="glass-panel rounded-[14px] p-4 mb-2.5 animate-slide-up">
                  <div className="flex justify-between items-center mb-2">
                    <strong className="text-cyan-400 text-sm">Scene {scene.scene_number}</strong>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-white/[0.06] text-gray-400">{scene.duration}s</span>
                  </div>
                  <p className="text-xs mb-1.5 flex items-start gap-1.5">
                    <Film size={13} className="text-gray-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Visual:</strong> {scene.visual_prompt}</span>
                  </p>
                  <p className="text-xs mb-1.5 text-teal-400/80 flex items-start gap-1.5">
                    <Mic size={13} className="text-teal-400/60 mt-0.5 flex-shrink-0" />
                    <span><strong>Voiceover:</strong> {scene.voiceover}</span>
                  </p>
                  {scene.caption && (
                    <p className="text-[11px] text-gray-500 italic flex items-start gap-1.5">
                      <MessageSquare size={12} className="text-gray-600 mt-0.5 flex-shrink-0" />
                      {scene.caption}
                    </p>
                  )}
                  <button
                    onClick={() => onUsePrompt(scene.visual_prompt)}
                    className="mt-2.5 px-3 py-1.5 rounded-md bg-surface-3 border border-white/[0.06] text-[11px] font-medium text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all flex items-center gap-1.5"
                  >
                    <Film size={12} />
                    Generate This Scene
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-3">
                <button onClick={copyScript} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-surface-3 border border-white/[0.06] text-xs text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all">
                  <Copy size={13} />
                  Copy
                </button>
                <button onClick={generateAllScenes} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-surface-3 border border-white/[0.06] text-xs text-gray-400 hover:border-cyan-500/40 hover:text-white transition-all">
                  <Film size={13} />
                  Generate All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
