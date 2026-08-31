# AI Video Generator

Free AI video generation web app. Runs locally on your machine. Uses the
**Hugging Face Inference API** free tier — no credit card required.

> ⚠ **Your machine**: this is the front-end only. Video generation happens on
> Hugging Face's free GPU cloud, not your machine. Your hardware doesn't matter
> for this build.

---

## What you need

1. **A free Hugging Face account**
   - Go to https://huggingface.co/join and sign up with email (no card).
2. **A free API token**
   - Go to https://huggingface.co/settings/tokens
   - Click "New token" → type "Read" → create.
   - Copy the token (starts with `hf_...`).
3. **Python 3.10 or newer** on your machine.
   - Check: open a terminal and run `python --version`.
   - If missing, install from https://www.python.org/downloads/ (tick "Add to PATH").

That's it. No GPU required for you — generation runs on HF's free GPUs.

---

## Setup (one-time)

Open a terminal in this folder (`aivideo/`) and run:

```bash
cd backend
python -m venv .venv

# Activate the venv:
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (cmd):
.venv\Scripts\activate.bat
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Copy the env file and paste your token:

```bash
# Windows (cmd):
copy ..\.env.example ..\.env
# macOS / Linux / Git Bash:
cp ../.env.example ../.env
```

Then edit `../.env` (in the `aivideo` folder, not `backend`) and replace
`hf_paste_your_token_here` with your actual token.

---

## Run the app

```bash
# (still inside backend/ with venv active)
uvicorn main:app --reload
```

Open http://127.0.0.1:8000 in your browser.

If everything is set up right, you'll see "● ready" in the top right.

---

## How to use it without wasting quota

The free tier has limits — **use them carefully**:

| Tip | Why |
|-----|-----|
| Start with **8 frames** | First call validates your prompt without burning 4× the time/credits. |
| Use a **preset prompt** the first time | They're tested to produce decent output. |
| Same prompt + settings = **free cache hit** | Re-runs of an identical request cost zero. |
| Avoid re-rolling the seed | Each new seed is a new generation. Leave seed empty unless you have a reason. |
| Don't loop "Generate" | Each click burns a call. Wait for the result. |

**Weekly usage is shown live** in the right panel — the counter resets every 7 days.

---

## Two models

- **Text → Video** (`ModelScope 1.7B`) — fast, decent short clips, 256×256 resolution.
- **Image → Video** (`Stable Video Diffusion XT`) — animate a photo you upload.
  Resolution ~512×512. Slower and stricter rate limits.

Pick in the dropdown. Image-to-video needs an uploaded image.

---

## Troubleshooting

**`⚠ no HF token`** — you didn't put the token in `.env`, or the server didn't reload.

**`Model is currently loading`** — HF free tier cold-starts. The request waits
automatically (the `x-wait-for-model` header). First call to a model can take
1–2 minutes.

**`403 Forbidden`** — your token doesn't have access. Generate the access token
again and make sure it's the "Read" type (or higher).

**`429 Rate limit`** — you've hit the weekly free tier. Wait, or upgrade HF Pro
($9/mo, paid).

**Empty MP4 / corrupt file** — some HF responses aren't real MP4. The app saves
whatever it gets. If playback fails, try a different prompt — the model sometimes
returns nothing for very short or vague prompts.

---

## File layout

```
aivideo/
├── .env                # ← your HF token lives here (NOT committed)
├── .env.example
├── backend/
│   ├── main.py         # FastAPI server
│   └── requirements.txt
├── frontend/
│   └── index.html      # served at /
├── cache/              # cached generations (free re-runs)
└── output/             # newest generations
```

---

## Costs

Hugging Face Inference API free tier is currently a few hundred to ~1000 calls
per month depending on model and load. For personal use this is usually plenty.

If you need more, the cheapest paid option is Hugging Face Pro at $9/mo for
higher rate limits — no code changes needed, just upgrade and the same token
gets more capacity.

---

## What I'd add for v2

- Image-to-video working with SVD's dedicated pipeline
- Auto-prompt-rewrite (use a small LLM to expand vague prompts before sending)
- Cost estimation per generation
- "Resume from cache" — store thumbnails so you can browse past generations
- WebSocket progress bar (HF inference is slow; the current spinner is honest but boring)

These all assume you want to keep building. Happy to add any of them on request.
