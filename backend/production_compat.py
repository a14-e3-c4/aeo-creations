"""Production compatibility wrapper.

Handles legacy multipart image animation plus the new free/local avatar
animation endpoint while forwarding normal traffic to backend.production.
"""
from __future__ import annotations

import asyncio
import io
import json
import uuid
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.production import app as production_app
from backend.cinematic_animation import render_cinematic_animation, MAX_IMAGE_BYTES
from backend.avatar_animation import render_with_optional_neural_engine, MAX_AUDIO_BYTES, MAX_DURATION
import store

ANIMATION_COST = 2
AVATAR_COST = 2


class ProductionCompatMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope.get("type") != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path not in {"/api/generate", "/api/animate-avatar"}:
            await self.app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode(errors="replace") for k, v in scope.get("headers", [])}
        content_type = headers.get("content-type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            await self.app(scope, receive, send)
            return

        user = self._authenticate(headers.get("authorization", ""))
        if not user:
            await self._json(send, 401, {"detail": "Authentication required"})
            return

        is_avatar = path == "/api/animate-avatar"
        cost = AVATAR_COST if is_avatar else ANIMATION_COST
        key = headers.get("idempotency-key") or uuid.uuid4().hex
        try:
            reservation = store.reserve_credits(user["id"], "video", cost, key)
        except Exception:
            if store.USE_SUPABASE:
                await self._json(send, 503, {"detail": "Credit service temporarily unavailable"})
                return
            reservation = {"allowed": True, "reservation_id": None}

        if not reservation.get("allowed"):
            await self._json(send, 402, {
                "detail": reservation.get("reason", "Insufficient credits"),
                "remaining": reservation.get("remaining", 0),
            })
            return

        try:
            request = Request(scope, receive=receive)
            form = await request.form()
            upload = form.get("file")
            if upload is None or not hasattr(upload, "read"):
                raise ValueError("No image file was uploaded")
            image_bytes = await upload.read()
            if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
                raise ValueError("Image is empty or exceeds the 25MB limit")

            from PIL import Image
            with Image.open(io.BytesIO(image_bytes)) as image:
                image.verify()

            from backend.main import OUTPUT_DIR
            video_name = f"{'avatar' if is_avatar else 'auto_cinematic'}_{uuid.uuid4().hex[:12]}.mp4"
            video_path = OUTPUT_DIR / video_name

            if is_avatar:
                audio = form.get("audio")
                if audio is None or not hasattr(audio, "read"):
                    raise ValueError("Upload a WAV audio file for free avatar animation")
                audio_bytes = await audio.read()
                if not audio_bytes or len(audio_bytes) > MAX_AUDIO_BYTES:
                    raise ValueError("Audio is empty or exceeds the 50MB limit")
                mode = str(form.get("mode") or "talking")
                duration_raw = form.get("duration")
                duration = max(1.0, min(float(duration_raw or MAX_DURATION), MAX_DURATION))
                await asyncio.to_thread(render_with_optional_neural_engine, image_bytes, audio_bytes, video_path, mode, duration)
                message = f"Free local {mode} avatar animation complete."
            else:
                effect = str(form.get("effect") or "zoom-in")
                duration = max(1.0, min(float(form.get("duration") or 5), MAX_DURATION))
                await asyncio.to_thread(render_cinematic_animation, image_bytes, video_path, effect, duration)
                message = f"Cinematic animation complete ({effect}, 30fps, 1080p)."

            if not video_path.exists() or video_path.stat().st_size == 0:
                raise RuntimeError("Animation output was not created")

            url = f"/api/file/{video_name}"
            store.finalize_reservation(reservation.get("reservation_id"), cost)
            payload = {
                "status": "ok", "cached": False, "file": url,
                "video": url, "video_url": url, "message": message,
            }
            if is_avatar:
                payload.update({"mode": mode, "duration": duration, "free": True})
            else:
                payload.update({"effect": effect, "duration": duration})
            await self._json(send, 200, payload)
        except Exception as exc:
            try:
                store.refund_reservation(reservation.get("reservation_id"), "animation_failed")
            except Exception:
                pass
            await self._json(send, 500, {"detail": f"Animation failed: {str(exc)[:240]}"})

    @staticmethod
    def _authenticate(auth: str):
        if not auth.startswith("Bearer "):
            return None
        try:
            from backend.main import _verify_token
            payload = _verify_token(auth[7:])
            return store.get_user(payload.get("user_id")) if payload else None
        except Exception:
            return None

    @staticmethod
    async def _json(send: Send, status: int, payload: dict):
        data = json.dumps(payload).encode("utf-8")
        await send({
            "type": "http.response.start", "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(data)).encode("ascii"))],
        })
        await send({"type": "http.response.body", "body": data})


app = ProductionCompatMiddleware(production_app)
