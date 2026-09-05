import { useEffect, useState } from 'react';
import { Download, Mic, Play, Sparkles, UserRound, X } from 'lucide-react';

const VOICES = [
  ['en-US-Aria', 'US — Aria'],
  ['en-US-Guy', 'US — Guy'],
  ['en-GB-Sonia', 'UK — Sonia'],
  ['en-GB-Ryan', 'UK — Ryan'],
] as const;

type AvatarMode = 'talking' | 'singing' | 'expression' | 'idle';

export function FreeAvatarStudio() {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('en-US-Aria');
  const [mode, setMode] = useState<AvatarMode>('talking');
  const [audio, setAudio] = useState<File | null>(null);
  const [duration, setDuration] = useState(5);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function makeVoiceover() {
    if (!text.trim()) return setError('Enter the script first.');
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice }),
      });
      if (!response.ok) throw new Error((await response.text()) || 'Voiceover failed.');
      const blob = await response.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) { setError(e instanceof Error ? e.message : 'Voiceover failed.'); }
    finally { setBusy(false); }
  }

  async function makeAvatar() {
    if (!image) return setError('Upload a character image first.');
    if ((mode === 'talking' || mode === 'singing') && !text.trim() && !audio) return setError('Enter a script or upload audio.');
    setBusy(true); setError(''); setVideoUrl(null);
    try {
      const form = new FormData();
      form.append('file', image);
      if (audio) form.append('audio', audio);
      if (text.trim()) form.append('text', text.trim());
      form.append('voice', voice);
      form.append('mode', mode);
      form.append('duration', String(duration));
      const response = await fetch('/api/animate-avatar', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Avatar generation failed.');
      if (!data.video_url) throw new Error('No video was returned.');
      setVideoUrl(data.video_url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Avatar generation failed.'); }
    finally { setBusy(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-fuchsia-400/40 bg-[#10101a]/95 px-4 py-3 text-xs font-bold text-fuchsia-100 shadow-2xl backdrop-blur hover:border-fuchsia-300">
      <UserRound size={15} /> Free Voice + Avatar
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0b0b12] p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/15"><Sparkles size={17} className="text-fuchsia-300" /></div>
          <div><h2 className="font-bold">Free Voice & Avatar Studio</h2><p className="text-[10px] text-gray-500">CPU-friendly • no API key • no generation charges</p></div>
          <button onClick={() => setOpen(false)} className="ml-auto text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Character image</label>
            <input type="file" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} className="w-full text-xs text-gray-500 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-gray-300" />
            {image && <img src={URL.createObjectURL(image)} alt="Character" className="max-h-56 w-full rounded-xl object-contain bg-black" />}

            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Animation</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['talking','singing','expression','idle'] as AvatarMode[]).map(item => <button key={item} onClick={() => setMode(item)} className={`rounded-lg border px-2 py-2 text-[10px] capitalize ${mode === item ? 'border-fuchsia-400 bg-fuchsia-500/10 text-white' : 'border-white/[0.06] text-gray-500'}`}>{item}</button>)}
            </div>

            {(mode === 'talking' || mode === 'singing') && <>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Script</label>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type what your character should say..." className="min-h-28 w-full rounded-xl border border-white/[0.08] bg-black/30 p-3 text-xs text-white outline-none focus:border-fuchsia-400" />
              <div className="grid grid-cols-2 gap-2">
                <select value={voice} onChange={e => setVoice(e.target.value)} className="rounded-lg border border-white/[0.08] bg-[#11111a] px-2 py-2 text-xs text-gray-300">{VOICES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                <input type="file" accept="audio/*" onChange={e => setAudio(e.target.files?.[0] || null)} className="w-full text-[10px] text-gray-500 file:mr-1 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-2 file:text-gray-300" />
              </div>
              <button onClick={makeVoiceover} disabled={busy || !text.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40"><Mic size={14} /> Generate free voiceover</button>
              {audioUrl && <div className="flex items-center gap-2"><audio src={audioUrl} controls className="h-8 flex-1" /><a href={audioUrl} download="aeo-voiceover.mp3" className="rounded-lg border border-white/10 p-2 text-gray-300"><Download size={14} /></a></div>}
            </>}

            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Duration: {duration}s</label>
            <input type="range" min="2" max="30" step="1" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full accent-fuchsia-400" />
            <button onClick={makeAvatar} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-500/15 py-3 text-xs font-bold text-fuchsia-100 border border-fuchsia-400/30 disabled:opacity-40"><Play size={14} /> {busy ? 'Rendering on CPU...' : 'Create avatar video'}</button>
            {error && <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-2 text-[10px] text-rose-300">{error}</p>}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-black p-3 min-h-[320px] flex items-center justify-center">
            {videoUrl ? <div className="w-full"><video src={videoUrl} controls autoPlay loop className="max-h-[500px] w-full rounded-lg object-contain" /><a href={videoUrl} download="aeo-avatar.mp4" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-white"><Download size={14} /> Download MP4</a></div> : <div className="text-center text-gray-600"><UserRound size={40} className="mx-auto mb-2" /><p className="text-xs">Your avatar video will appear here.</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
