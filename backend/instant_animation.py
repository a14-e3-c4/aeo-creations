"""High-quality automatic image animation for AEO Creations.

Handles both JSON base64 images and the multipart upload format used by the
Generate UI's manual Animate button. The exact supplied image is rendered into
a polished 1080p/30fps cinematic MP4 without regenerating it.
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

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.production import app as production_app


MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_DURATION = 30.0


def _render_cinematic_animation(image_bytes: bytes, output_path: Path, effect: str, duration: float) -> None:
    """Render a polished 1080p cinematic camera move with FFmpeg."""
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

    with Image.open(io.BytesIO(image_bytes)) as src:
        src = src.convert("RGB")
        # Large overscan preserves detail while giving the camera real pixels
        # to travel through, avoiding the crude cropped look of basic zooms.
        scale = max(width / src.width, height / src.height) * 2.0
        sw = max(width * 2, int(src.width * scale))
        sh = max(height * 2, int(src.height * scale))
        src = src.resize((sw, sh), Image.Resampling.LANCZOS)
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        try:
            src.save(tmp.name, "PNG", optimize=True)
            tmp.close()

            frames_total = max(2, int(round(duration * fps)))
            last = frames_total - 1
            progress = f"on/{last}"

            if effect == "zoom-out":
                zoom = f"1.32-0.32*({progress})"
                x = "(iw-iw/zoom)/2"
                y = "(ih-ih/zoom)/2"
            elif effect == "pan-left":
                zoom = "1.12"
                x = f"(iw-iw/zoom)*(1-{progress})"
                y = f"(ih-ih/zoom)*(0.46-0.08*{progress})"
            elif effect == "pan-right":
                zoom = "1.12"
                x = f"(iw-iw/zoom)*({progress})"
                y = f"(ih-ih/zoom)*(0.46-0.08*{progress})"
            elif effect in {"zoom-in-pan", "zoom-pan"}:
                zoom = f"1.04+0.18*pow({progress},2)"
                x = f"(iw-iw/zoom)*(0.30+0.40*{progress})"
                y = f"(ih-ih/zoom)*(0.34+0.22*{progress})"
            elif effect == "dolly":
                zoom = f"1.03+0.22*(1-pow(1-{progress},2))"
                x = f"(iw-iw/zoom)*(0.50+0.04*sin(on/({fps}*{duration})*PI))"
                y = f"(ih-ih/zoom)*(0.48-0.05*sin(on/({fps}*{duration})*PI))"
            else:
                zoom = f"1.03+0.19*pow({progress},1.55)"
                x = f"(iw-iw/zoom)*(0.48+0.04*sin(on/({fps}*{duration})*PI))"
                y = f"(ih-ih/zoom)*(0.46-0.035*sin(on/({fps}*{duration})*PI))"

            fade = min(0.22, duration / 8)
            fade_out_start = max(0.0, duration - fade)
            vf = (
                f"zoompan=z='{zoom}':x='{x}':y='{y}':d=1:s={width}x{height}:fps={fps},"
                "eq=contrast=1.025:saturation=1.035:brightness=0.002,"
                "unsharp=5:5:0.35:5:5:0.0,"
                f"fade=t=in:st=0:d={fade:.3f},"
                f"fade=t=out:st={fade_out_start:.3f}:d={fade:.3f},"
                "format=yuv420p"
            )

            cmd = [
                FFMPEG_PATH, "-y", "-hide_banner", "-loglevel", "error",
                "-loop", "1", "-i", tmp.name,
                "-vf", vf,
                "-frames:v", str(frames_total),
                "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(output_path),
            ]
            subprocess.run(cmd, check=True, timeout=max(120, int(duration * 30)))
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


def _image_response(image_b64: str, image_bytes: bytes, effect: str, duration: float):
    """Render and return a standard animation response."""
    from PIL import Image
    from backend.main import OUTPUT_DIR

    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("Invalid image size")
    with Image.open(io.BytesIO(image_bytes)) as image:
        image.verify()

    allowed = {"zoom-in", "zoom-out", "pan-left", "pan-right", "zoom-in-pan", "zoom-pan", "dolly"}
    if effect not in allowed:
        effect = "zoom-in"
    duration = max(1.0, min(float(duration or 5), MAX_DURATION))

    video_name = f"auto_cinematic_{uuid.uuid4().hex[:12]}.mp4"
    video_path = OUTPUT_DIR / video_name
    asyncio_result = (image_bytes, video_path, effect, duration)
    return asyncio_result


class ExactImageAnimationMiddleware:
    """Animate JSON and multipart images sent to the legacy /api/generate path."""

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

        raw_body = bytes(body)
        content_type = ""
        for key, value in scope.get("headers", []):
            if key.lower() == b"content-type":
                content_type = value.decode("latin-1")
                break

        async def replay_receive():
            return {"type": "http.request", "body": raw_body, "more_body": False}

        image_b64 = None
        effect = "zoom-in"
        duration = 5.0
        image_bytes = None

        try:
            if content_type.startswith("application/json"):
                payload = json.loads(raw_body.decode("utf-8"))
                image_b64 = payload.get("image_b64")
                effect = str(payload.get("kb_effect") or payload.get("effect") or "zoom-in")
                duration = float(payload.get("kb_duration") or payload.get("duration") or 5)
                if image_b64:
                    raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
                    image_bytes = base64.b64decode(raw, validate=True)
            elif content_type.startswith("multipart/form-data"):
                # This is the exact format emitted by GenerateTab.animateImage().
                request = Request(scope, replay_receive)
                form = await request.form()
                upload = form.get("file")
                if upload is not None and hasattr(upload, "read"):
                    image_bytes = await upload.read()
                    effect = str(form.get("effect") or "zoom-in")
                    duration = float(form.get("duration") or 5)
                    image_b64 = "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii")
            else:
                await self.app(scope, replay_receive, send)
                return

            if not image_bytes:
                await self.app(scope, replay_receive, send)
                return

            image_bytes, video_path, effect, duration = _image_response(
                image_b64 or "", image_bytes, effect, duration
            )
            await asyncio.to_thread(
                _render_cinematic_animation, image_bytes, video_path, effect, duration
            )
            if not video_path.exists() or video_path.stat().st_size == 0:
                raise RuntimeError("Animation output was not created")

            url = f"/api/file/{video_path.name}"
            response = {
                "status": "ok", "cached": False,
                "file": url, "video": url, "video_url": url,
                "image": image_b64,
                "effect": effect, "duration": duration,
                "message": f"Cinematic animation complete ({effect}, 30fps, 1080p).",
            }
            data = json.dumps(response).encode("utf-8")
            await send({
                "type": "http.response.start", "status": 200,
                "headers": [(b"content-type", b"application/json"),
                             (b"content-length", str(len(data)).encode("ascii"))],
            })
            await send({"type": "http.response.body", "body": data})
        except Exception:
            # Preserve the original endpoint if the compatibility animation cannot run.
            await self.app(scope, replay_receive, send)


app = ExactImageAnimationMiddleware(production_app)
