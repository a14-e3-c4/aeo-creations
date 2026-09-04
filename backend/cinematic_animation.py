"""High-quality deterministic cinematic animation from a single image."""
from __future__ import annotations

import io
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_DURATION = 30.0
FPS = 30
WIDTH = 1920
HEIGHT = 1080


def render_cinematic_animation(
    image_bytes: bytes,
    output_path: Path,
    effect: str = "zoom-in",
    duration: float = 5.0,
) -> None:
    """Render a polished 1080p/30fps camera move from the exact source image.

    This cannot invent semantic motion the way a generative video model can.
    Instead it maximizes the quality of deterministic camera motion: large
    overscan, eased movement, high-quality scaling, subtle grading, sharpening,
    fade transitions, and stream-optimized H.264 output.
    """
    from backend.main import FFMPEG_PATH

    allowed = {
        "zoom-in", "zoom-out", "pan-left", "pan-right",
        "zoom-in-pan", "zoom-pan", "dolly",
    }
    effect = effect if effect in allowed else "zoom-in"
    duration = max(1.0, min(float(duration), MAX_DURATION))
    frames = max(1, round(duration * FPS))

    with Image.open(io.BytesIO(image_bytes)) as source:
        source = source.convert("RGB")
        scale = max(WIDTH / source.width, HEIGHT / source.height) * 2.0
        source = source.resize(
            (max(WIDTH * 2, int(source.width * scale)), max(HEIGHT * 2, int(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        temp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        temp_name = temp.name
        try:
            source.save(temp, "PNG", optimize=True)
            temp.close()

            n = "max(1,ceil({fps}*{dur}))-1".format(fps=FPS, dur=duration)
            p = f"on/({n})"
            t = f"on/({FPS}*{duration})"

            if effect == "zoom-out":
                zoom = f"1.30-0.27*({p})"
                x = "(iw-iw/zoom)/2"
                y = "(ih-ih/zoom)/2"
            elif effect == "pan-left":
                zoom = "1.13"
                x = f"(iw-iw/zoom)*(1-{p})"
                y = f"(ih-ih/zoom)*(0.48-0.06*{p})"
            elif effect == "pan-right":
                zoom = "1.13"
                x = f"(iw-iw/zoom)*{p}"
                y = f"(ih-ih/zoom)*(0.48-0.06*{p})"
            elif effect in {"zoom-in-pan", "zoom-pan"}:
                zoom = f"1.03+0.19*pow({p},1.55)"
                x = f"(iw-iw/zoom)*(0.25+0.50*{p})"
                y = f"(ih-ih/zoom)*(0.35+0.22*{p})"
            elif effect == "dolly":
                zoom = f"1.03+0.23*(1-pow(1-{p},2))"
                x = f"(iw-iw/zoom)*(0.50+0.035*sin({t}*PI))"
                y = f"(ih-ih/zoom)*(0.48-0.045*sin({t}*PI))"
            else:
                zoom = f"1.03+0.20*pow({p},1.55)"
                x = f"(iw-iw/zoom)*(0.48+0.035*sin({t}*PI))"
                y = f"(ih-ih/zoom)*(0.46-0.035*sin({t}*PI))"

            fade = min(0.22, duration / 8)
            fade_out = max(0.0, duration - fade)
            vf = (
                f"zoompan=z='{zoom}':x='{x}':y='{y}':d=1:s={WIDTH}x{HEIGHT}:fps={FPS},"
                "eq=contrast=1.025:saturation=1.035:brightness=0.002,"
                "unsharp=5:5:0.35:5:5:0.0,"
                f"fade=t=in:st=0:d={fade:.3f},"
                f"fade=t=out:st={fade_out:.3f}:d={fade:.3f},"
                "format=yuv420p"
            )
            cmd = [
                FFMPEG_PATH, "-y", "-hide_banner", "-loglevel", "error",
                "-loop", "1", "-i", temp_name,
                "-vf", vf, "-frames:v", str(frames),
                "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(output_path),
            ]
            subprocess.run(cmd, check=True, timeout=max(120, int(duration * 30)))
        finally:
            try:
                os.unlink(temp_name)
            except OSError:
                pass
