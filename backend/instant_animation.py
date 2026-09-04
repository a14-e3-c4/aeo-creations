"""Production launcher that adds instant animation to generated images.

The existing production stack remains untouched. This module imports the
production app and wraps it with a narrowly-scoped middleware that handles the
frontend's existing /api/generate image_b64 animation fallback using the exact
image bytes supplied by the browser.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import uuid
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.production import app as production_app


class ExactImageAnimationMiddleware:
    """Animate the exact image supplied by the Generate UI, without regeneration."""

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
        more_body = True
        while more_body:
            message = await receive()
            if message.get("type") != "http.request":
                continue
            body.extend(message.get("body", b""))
            more_body = message.get("more_body", False)

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
            from backend.main import OUTPUT_DIR, MOVIEPY_AVAILABLE, create_ken_burns_video
            if not MOVIEPY_AVAILABLE:
                await self.app(scope, replay_receive, send)
                return

            raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
            image_bytes = base64.b64decode(raw, validate=True)
            if not image_bytes or len(image_bytes) > 25 * 1024 * 1024:
                await self.app(scope, replay_receive, send)
                return

            from PIL import Image
            with Image.open(io.BytesIO(image_bytes)) as image:
                image.verify()

            allowed_effects = {
                "zoom-in", "zoom-out", "pan-left", "pan-right",
                "zoom-in-pan", "zoom-pan", "dolly",
            }
            effect = str(payload.get("kb_effect") or "zoom-in")
            if effect not in allowed_effects:
                effect = "zoom-in"

            try:
                duration = float(payload.get("kb_duration") or 5)
            except (TypeError, ValueError):
                duration = 5.0
            duration = max(1.0, min(duration, 30.0))

            video_name = f"auto_anim_{uuid.uuid4().hex[:12]}.mp4"
            video_path = OUTPUT_DIR / video_name

            # MoviePy/FFmpeg is CPU-bound, so do not block the FastAPI event loop.
            await asyncio.to_thread(
                create_ken_burns_video,
                image_bytes,
                str(video_path),
                effect=effect,
                duration=duration,
            )

            if not video_path.exists() or video_path.stat().st_size == 0:
                raise RuntimeError("Animation output was not created")

            response = {
                "status": "ok",
                "cached": False,
                "file": f"/api/file/{video_name}",
                "video": f"/api/file/{video_name}",
                "video_url": f"/api/file/{video_name}",
                "image": image_b64,
                "message": f"Image generated and instantly animated with {effect}.",
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
            # Animation must never make normal image generation fail. If the
            # animation step has a problem, preserve the original route behavior.
            await self.app(scope, replay_receive, send)


app = ExactImageAnimationMiddleware(production_app)
