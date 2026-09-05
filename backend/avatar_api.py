"""Free, low-GPU voiceover + avatar API.

Voice generation uses edge-tts: no API key or paid account is required, and the
actual avatar renderer remains CPU-based. A local Piper installation can be
added later without changing the browser API.
"""
from __future__ import annotations

import asyncio
import io
import subprocess
import tempfile
import uuid
import wave
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.avatar_animation import render_avatar_animation
from backend.main import FFMPEG_PATH, OUTPUT_DIR

try:
    import edge_tts
except ImportError:  # pragma: no cover
    edge_tts = None

router = APIRouter()

VOICE_OPTIONS = {
    "en-US-Aria": "en-US-AriaNeural",
    "en-US-Guy": "en-US-GuyNeural",
    "en-GB-Sonia": "en-GB-SoniaNeural",
    "en-GB-Ryan": "en-GB-RyanNeural",
}


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = "en-US-Aria"
    rate: str = "+0%"
    pitch: str = "+0Hz"


def _safe_name(prefix: str, suffix: str) -> Path:
    OUTPUT_DIR.mkdir(exist_ok=True)
    return OUTPUT_DIR / f"{prefix}_{uuid.uuid4().hex[:12]}{suffix}"


async def _synthesize(text: str, voice: str, rate: str, pitch: str, output_mp3: Path) -> None:
    if edge_tts is None:
        raise HTTPException(503, "Free voiceover engine is not installed on the server.")
    selected = VOICE_OPTIONS.get(voice, VOICE_OPTIONS["en-US-Aria"])
    communicate = edge_tts.Communicate(text, selected, rate=rate, pitch=pitch)
    await communicate.save(str(output_mp3))


def _mp3_to_wav(mp3: Path, wav: Path) -> None:
    subprocess.run(
        [FFMPEG_PATH, "-y", "-hide_banner", "-loglevel", "error", "-i", str(mp3),
         "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", str(wav)],
        check=True,
        timeout=120,
    )


def _silence_wav(seconds: float) -> bytes:
    seconds = max(0.25, min(30.0, seconds))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        wf.writeframes(b"\x00\x00" * int(22050 * seconds))
    return buf.getvalue()


@router.get("/api/tts/voices")
def tts_voices():
    return {"voices": [{"id": key, "label": key.replace("-", " ")} for key in VOICE_OPTIONS]}


@router.post("/api/tts")
async def text_to_speech(body: TTSRequest):
    """Generate a downloadable MP3 without a paid API key."""
    output = _safe_name("voiceover", ".mp3")
    await _synthesize(body.text.strip(), body.voice, body.rate, body.pitch, output)
    return FileResponse(output, media_type="audio/mpeg", filename="aeo-voiceover.mp3")


@router.post("/api/animate-avatar")
async def animate_avatar(
    file: UploadFile = File(...),
    audio: UploadFile | None = File(None),
    text: str | None = Form(None),
    voice: str = Form("en-US-Aria"),
    mode: str = Form("talking"),
    duration: float = Form(5.0),
):
    """Create a CPU-friendly avatar video.

    For talking/singing, users may supply WAV audio OR text. Text is converted
    to speech first, so the browser never needs to manage an audio file.
    """
    image_bytes = await file.read()
    if not image_bytes or len(image_bytes) > 25 * 1024 * 1024:
        raise HTTPException(400, "Image must be present and smaller than 25MB.")

    mode = mode if mode in {"talking", "singing", "expression", "idle"} else "talking"
    duration = max(2.0, min(30.0, duration))

    temp_dir = Path(tempfile.mkdtemp(prefix="aeo_avatar_api_"))
    try:
        wav_path = temp_dir / "voice.wav"
        if audio is not None:
            audio_bytes = await audio.read()
            if len(audio_bytes) > 50 * 1024 * 1024:
                raise HTTPException(400, "Audio must be smaller than 50MB.")
            wav_path.write_bytes(audio_bytes)
        elif text and mode in {"talking", "singing"}:
            mp3_path = temp_dir / "voice.mp3"
            await _synthesize(text.strip(), voice, "+0%", "+0Hz", mp3_path)
            _mp3_to_wav(mp3_path, wav_path)
        else:
            wav_path.write_bytes(_silence_wav(duration))

        output = _safe_name("avatar", ".mp4")
        render_avatar_animation(image_bytes, wav_path.read_bytes(), output, mode=mode, duration=duration)
        return {
            "status": "ok",
            "video_url": f"/output/{output.name}",
            "message": "Free CPU avatar video ready.",
            "voice_generated": audio is None and bool(text),
        }
    finally:
        for child in temp_dir.iterdir():
            child.unlink(missing_ok=True)
        temp_dir.rmdir()
