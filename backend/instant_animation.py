"""High-quality automatic image animation for AEO Creations.

This layer keeps the existing generation providers intact while upgrading the
single-image fallback into a polished cinematic motion renderer. It uses the
exact generated image, high-resolution overscan, smooth easing, 30fps output,
and high-quality H.264 encoding.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from starlette.types import ASGIApp, Receive, Scope, Send

from backend.production import app as production_app


MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_DURATION = 30.0


def _render_cinematic_animation(image_bytes: bytes, output_path: Path, effect: str, duration: float) -> None:
    """Render a high-quality 2D cinematic camera move with FFmpeg.

    This is deliberately deterministic: unlike an AI video model it cannot
    invent motion in the scene, but it produces much cleaner camera movement
    than a basic Ken Burns implementation and is extremely reliable as an
    automatic fallback.
    """
    from PIL import Image
    from backend.main import FFMPEG_PATH

    allowed = {
        "zoom-in", "zoom-out", "pan-left", "pan-right",
        "zoom-in-pan", "zoom-pan", "dolly",
    }
    if effect not in allowed:
        effect = "zoom-in"

    duration = max(1.0, min(float(duration), MAX_DURATION))
    fps = 30
    width, height = 1920, 1080

    # Work from a large source so the camera has real pixels to move through.
    # 2.0x overscan gives substantially more headroom than the old 1.1x crop.
    with Image.open(io.BytesIO(image_bytes)) as src:
        src = src.convert("RGB")
        scale = max(width / src.width, height / src.height) * 2.0
        sw = max(width * 2, int(src.width * scale))
        sh = max(height * 2, int(src.height * scale))
        src = src.resize((sw, sh), Image.Resampling.LANCZOS)
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        try:
            src.save(tmp.name, "PNG", optimize=True)
            tmp.close()

            # Motion is intentionally eased rather than linear. This creates
            # the acceleration/deceleration of a real camera move.
            if effect == "zoom-out":
                zoom = "1.32-0.32*on/(max(1,ceil({fps}*{dur}))-1)".format(fps=fps, dur=duration)
                x = "(iw-iw/zoom)/2"
                y = "(ih-ih/zoom)/2"
            elif effect == "pan-left":
                zoom = "1.12"
                x = "(iw-iw/zoom)*(1-on/(max(1,ceil({fps}*{dur}))-1))".format(fps=fps, dur=duration)
                y = "(ih-ih/zoom)*(0.46-0.08*on/(max(1,ceil({fps}*{dur}))-1))".format(fps=fps, dur=duration)
            elif effect == "pan-right":
                zoom = "1.12"
                x = "(iw-iw/zoom)*(on/(max(1,ceil({fps}*{dur}))-1))".format(fps=fps, dur=duration)
                y = "(ih-ih/zoom)*(0.46-0.08*on/(max(1,ceil({fps}*{dur}))-1))".format(fps=fps, dur=duration)
            elif effect in {"zoom-in-pan", "zoom-pan"}:
                # Smooth push-in plus diagonal camera drift.
                zoom = "1.04+0.18*pow(on/(max(1,ceil({fps}*{dur}))-1),2)".format(fps=fps, dur=duration)
                x = "(iw-iw/zoom)*(0.30+0.40*on/(max(1,ceil({fps}*{dur}))-1))"
                y = "(ih-ih/zoom)*(0.34+0.22*on/(max(1,ceil({fps}*{dur}))-1))"
            elif effect == "dolly":
                zoom = "1.03+0.22*(1-pow(1-on/(max(1,ceil({fps}*{dur}))-1),2))".format(fps=fps, dur=duration)
                x = "(iw-iw/zoom)*(0.50+0.04*sin(on/({fps}*{dur})*PI))".format(fps=fps, dur=duration)
                y = "(ih-ih/zoom)*(0.48-0.05*sin(on/({fps}*{dur})*PI))".format(fps=fps, dur=duration)
            else:
                # Premium default push-in with a tiny organic drift.
                zoom = "1.03+0.19*pow(on/(max(1,ceil({fps}*{dur}))-1),1.55)".format(fps=fps, dur=duration)
                x = "(iw-iw/zoom)*(0.48+0.04*sin(on/({fps}*{dur})*PI))".format(fps=fps, dur=duration)
                y = "(ih-ih/zoom)*(0.46-0.035*sin(on/({fps}*{dur})*PI))".format(fps=fps, dur=duration)

            frames = int(round(duration * fps))
            fade = min(0.22, duration / 8)
            fade_out_start = max(0, duration - fade)

            vf = (
                f"zoompan=z='{zoom}':x='{x}':y='{y}':"
                f"d=1:s={width}x{height}:fps={fps},"
                f"eq=contrast=1.025:saturation=1.035:brightness=0.002,"
                f"unsharp=5:5:0.35:5:5:0.0,"
                f"fade=t=in:st=0:d={fade:.3f},"
                f"fade=t=out:st={fade_out_start:.3f}:d={fade:.3f},"
                f"format=yuv420p"
            )

            cmd = [
                FFMPEG_PATH, "-y", "-hide_banner", "-loglevel", "error",
                "-loop", "1", "-i", tmp.name,
                "-vf", vf,
                "-frames:v", str(frames),
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "17",
                "-profile:v", "high",
                "-level", "4.1",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(output_path),
            ]
            subprocess.run(cmd, check=True, timeout=max(120, int(duration * 30)))
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


class ExactImageAnimationMiddleware:
    """Automatically animate the exact generated image supplied by the UI."""

    def __init__(self, app_: ASGIApp):
        self.app = app_

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/api/generate"
        ):
            await self.app(scope, receive, send)
            return

        body = bytearray()
        while True:
            message = await receive()
            if message.get("type") != "http.request":
                continue
            body.extend(message.get("body", b""))
            if not message.get("more_body", False):
                break

        async def replay_receive():
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        try:
            payload = json.loads(bytes(body).decode("utf-8"))
        except Exception:
            await self.app(scope, replay_receive, send)
            return

        image_b64 = payload.get("image_b64")
        if not image_b64:
            await self.app(scope, replay_receive, send)
            return

        try:
            raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
            image_bytes = base64.b64decode(raw, validate=True)
            if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
                raise ValueError("Invalid image size")

            from PIL import Image
            with Image.open(io.BytesIO(image_bytes)) as image:
                image.verify()

            effect = str(payload.get("kb_effect") or "zoom-in")
            duration = float(payload.get("kb_duration") or 5)
            duration = max(1.0, min(duration, MAX_DURATION))

            from backend.main import OUTPUT_DIR
            video_name = f"auto_cinematic_{uuid.uuid4().hex[:12]}.mp4"
            video_path = OUTPUT_DIR / video_name

            await asyncio.to_thread(
                _render_cinematic_animation,
                image_bytes,
                video_path,
                effect,
                duration,
            )

            if not video_path.exists() or video_path.stat().st_size == 0:
                raise RuntimeError("Animation output was not created")

            url = f"/api/file/{video_name}"
            response = {
                "status": "ok",
                "cached": False,
                "file": url,
                "video": url,
                "video_url": url,
                "image": image_b64,
                "message": f"Cinematic animation complete ({effect}, 30fps, 1080p).",
            }
            data = json.dumps(response).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(data)).encode("ascii")),
                ],
            })
            await send({"type": "http.response.body", "body": data})
        except Exception:
            # Never let the animation upgrade break normal generation.
            await self.app(scope, replay_receive, send)


app = ExactImageAnimationMiddleware(production_app)
