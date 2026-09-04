# aeo.creations — AI Video Studio

A full-stack AI video generation app that creates images with AI, animates them into Ken Burns MP4 videos, and generates scripts with AI.

## Architecture

```
bolt-ui/          → React + TypeScript + Vite frontend (port 3000)
backend/          → Python FastAPI backend (port 8000)
```

## Features

- **Script Tab**: AI script generation (Groq AI) — generates video scripts with scenes, voiceover, cinematic prompts
- **Image Tab**: AI image generation with 5 free models via Puter.js + backend fallback (Pollinations FLUX, Gemini, Kling)
  - Resolutions up to 8K (7680×4320)
  - 8 styles: Cinematic, Photorealistic, Anime, 3D Render, Digital Art, Oil Painting, Watercolor, Pixel Art
  - 6 animation effects: Zoom In/Out, Pan Left/Right, Zoom+Pan, Dolly
  - "Instant animate" toggle for auto Ken Burns video
- **AI Video Tab**: Real AI video generation via Kling AI
- **Ken Burns Video**: Automatic MP4 creation from any generated image
- **Upload**: Upload images/videos from PC or URL
- **Edit Tab**: Image/video editing capabilities
- **Video Tab**: Video playback and management

## API Keys Required (see .env.example)

| Service | Purpose |
|---------|---------|
| Groq AI | Script generation |
| Hugging Face | Image generation fallback |
| Kling AI | Image + video generation (66 free credits/day) |
| Magic Hour | AI video generation |
| Gemini | Image generation |
| Pollinations | Free unlimited image fallback |

## Running Locally

```bash
# Backend
cd backend
pip install fastapi uvicorn httpx moviepy Pillow
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Frontend
cd bolt-ui
npm install
npm run dev
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Python 3.13, FastAPI, MoviePy, Pillow, httpx
- **AI Models**: Puter.js (free: Gemini 3 Pro, GPT Image 2, FLUX.2 Pro, Grok, SD3), Kling AI, Pollinations FLUX
- **Video**: Ken Burns effect (MoviePy + FFmpeg), Kling AI image-to-video
