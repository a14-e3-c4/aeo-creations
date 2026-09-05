"""Free/local character animation from a still image and audio.

This renderer is deliberately dependency-light. It creates a talking/singing-style
animation locally from the supplied image and audio by analyzing audio energy and
animating mouth/eye/expression overlays. It does not call a paid AI API.

For higher-fidelity neural lip-sync, WAV2LIP_COMMAND may optionally point to a
locally installed compatible runner; the deterministic renderer remains the
zero-API fallback.
"""
from __future__ import annotations

import io
import math
import os
import subprocess
import tempfile
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_AUDIO_BYTES = 50 * 1024 * 1024
MAX_DURATION = 30.0
FPS = 24
WIDTH = 720
HEIGHT = 720

MODES = {"talking", "singing", "expression", "idle"}


def _audio_envelope(audio_bytes: bytes, frame_count: int) -> list[float]:
    """Return normalized RMS energy for each output frame."""
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
            rate = wf.getframerate()
            channels = wf.getnchannels()
            width = wf.getsampwidth()
            raw = wf.readframes(wf.getnframes())
        if width not in (1, 2, 4) or not raw:
            return [0.0] * frame_count
        step = max(1, int(rate / FPS))
        bytes_per_sample = width * channels
        values: list[float] = []
        for start in range(0, len(raw), step * bytes_per_sample):
            chunk = raw[start : start + step * bytes_per_sample]
            if width == 1:
                samples = [(b - 128) / 128.0 for b in chunk]
            elif width == 2:
                import struct
                samples = [v / 32768.0 for v in struct.unpack("<%dh" % (len(chunk) // 2), chunk)]
            else:
                import struct
                samples = [v / 2147483648.0 for v in struct.unpack("<%di" % (len(chunk) // 4), chunk)]
            if channels > 1:
                samples = samples[::channels]
            rms = math.sqrt(sum(v * v for v in samples) / max(1, len(samples)))
            values.append(min(1.0, rms * 4.0))
        if not values:
            return [0.0] * frame_count
        peak = max(values) or 1.0
        values = [min(1.0, v / peak) for v in values]
        return [values[min(len(values) - 1, int(i * len(values) / max(1, frame_count)))] for i in range(frame_count)]
    except Exception:
        return [0.0] * frame_count


def render_avatar_animation(
    image_bytes: bytes,
    audio_bytes: bytes,
    output_path: Path,
    mode: str = "talking",
    duration: float | None = None,
) -> None:
    """Render a free local talking/singing-style avatar MP4."""
    if mode not in MODES:
        mode = "talking"
    with Image.open(io.BytesIO(image_bytes)) as source:
        source = source.convert("RGB")
        scale = max(WIDTH / source.width, HEIGHT / source.height)
        source = source.resize((max(WIDTH, int(source.width * scale)), max(HEIGHT, int(source.height * scale))), Image.Resampling.LANCZOS)
        left = (source.width - WIDTH) // 2
        top = (source.height - HEIGHT) // 2
        source = source.crop((left, top, left + WIDTH, top + HEIGHT))

    with tempfile.TemporaryDirectory(prefix="aeo_avatar_") as tmp:
        tmp_path = Path(tmp)
        try:
            with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
                audio_duration = wf.getnframes() / float(wf.getframerate() or 1)
        except Exception as exc:
            raise ValueError("Audio must be an uncompressed WAV file for the free local renderer") from exc

        total_duration = min(MAX_DURATION, float(duration or audio_duration or 5.0))
        frames = max(1, int(round(total_duration * FPS)))
        envelope = _audio_envelope(audio_bytes, frames)
        frame_paths: list[str] = []

        for i in range(frames):
            t = i / FPS
            energy = envelope[i]
            frame = source.copy()
            draw = ImageDraw.Draw(frame, "RGBA")

            # Gentle head/idle motion so a still portrait does not remain perfectly static.
            dx = int(math.sin(t * 1.35) * 4)
            dy = int(math.sin(t * 0.9 + 0.7) * 3)
            if mode in {"talking", "singing", "idle"}:
                frame = Image.new("RGB", frame.size)
                frame.paste(source, (dx, dy))
                draw = ImageDraw.Draw(frame, "RGBA")

            # Portrait-oriented heuristic face placement. The overlay is intentionally
            # subtle and works best with a single front-facing face centered in frame.
            cx = WIDTH // 2 + dx
            eye_y = int(HEIGHT * 0.40 + dy)
            mouth_y = int(HEIGHT * 0.61 + dy)
            mouth_w = int(45 + energy * 70)
            mouth_h = int(4 + energy * 25)

            if mode in {"talking", "singing"}:
                # Mouth opening follows audio energy; singing gets a wider motion range.
                if mode == "singing":
                    mouth_w = int(55 + energy * 95)
                    mouth_h = int(5 + energy * 34)
                draw.ellipse((cx - mouth_w, mouth_y - mouth_h, cx + mouth_w, mouth_y + mouth_h), fill=(35, 8, 12, 155))
                draw.arc((cx - mouth_w, mouth_y - mouth_h, cx + mouth_w, mouth_y + mouth_h), 0, 180, fill=(255, 255, 255, 170), width=3)

                # Occasional blink tied to a smooth periodic schedule.
                blink = (math.sin(t * 0.65) > 0.985) or (math.sin(t * 0.41 + 2.0) > 0.995)
                if blink:
                    for ex in (cx - int(WIDTH * 0.075), cx + int(WIDTH * 0.075)):
                        draw.line((ex - 12, eye_y, ex + 12, eye_y), fill=(40, 25, 25, 190), width=5)

            elif mode == "expression":
                # Small smile/neutral/surprise cycles; no external model required.
                phase = math.sin(t * 1.2)
                if phase > 0.35:
                    draw.arc((cx - 45, mouth_y - 10, cx + 45, mouth_y + 28), 10, 170, fill=(45, 12, 18, 170), width=5)
                elif phase < -0.35:
                    draw.line((cx - 32, mouth_y + 3, cx + 32, mouth_y + 3), fill=(45, 12, 18, 150), width=5)
                else:
                    draw.ellipse((cx - 12, mouth_y - 8, cx + 12, mouth_y + 8), fill=(45, 12, 18, 130))

            elif mode == "idle":
                glow = int(12 + 16 * (0.5 + 0.5 * math.sin(t * 1.7)))
                overlay = Image.new("RGBA", frame.size, (255, 255, 255, 0))
                od = ImageDraw.Draw(overlay, "RGBA")
                od.ellipse((cx - 130, eye_y - 90, cx + 130, eye_y + 170), fill=(120, 210, 255, glow))
                overlay = overlay.filter(ImageFilter.GaussianBlur(35))
                frame = Image.alpha_composite(frame.convert("RGBA"), overlay).convert("RGB")

            path = tmp_path / f"frame_{i:06d}.png"
            frame.save(path, "PNG", optimize=True)
            frame_paths.append(str(path))

        from backend.main import FFMPEG_PATH
        silent_audio = tmp_path / "audio.wav"
        silent_audio.write_bytes(audio_bytes)
        pattern = str(tmp_path / "frame_%06d.png")
        cmd = [
            FFMPEG_PATH, "-y", "-hide_banner", "-loglevel", "error",
            "-framerate", str(FPS), "-i", pattern,
            "-i", str(silent_audio), "-t", f"{total_duration:.3f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", str(output_path),
        ]
        subprocess.run(cmd, check=True, timeout=max(120, int(total_duration * 40)))


def render_with_optional_neural_engine(*args, **kwargs) -> None:
    """Use an optional local neural runner when configured, otherwise fallback."""
    command = os.getenv("WAV2LIP_COMMAND", "").strip()
    if not command:
        return render_avatar_animation(*args, **kwargs)
    # The command is deliberately operator-configured; no secrets or URLs are
    # accepted from the browser. If it fails, the free deterministic renderer is used.
    try:
        image_bytes, audio_bytes, output_path = args[:3]
        with tempfile.TemporaryDirectory(prefix="aeo_wav2lip_") as tmp:
            image_path = Path(tmp) / "image.png"
            audio_path = Path(tmp) / "audio.wav"
            image_path.write_bytes(image_bytes)
            audio_path.write_bytes(audio_bytes)
            rendered = command.format(image=str(image_path), audio=str(audio_path), output=str(output_path))
            subprocess.run(rendered, shell=True, check=True, timeout=600)
            if output_path.exists() and output_path.stat().st_size > 0:
                return
    except Exception:
        pass
    return render_avatar_animation(*args, **kwargs)
