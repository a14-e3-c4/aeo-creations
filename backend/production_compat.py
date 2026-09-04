"""Compatibility wrapper for the production app.

The Generate UI historically posts uploaded images as multipart/form-data to
/api/generate. The production credit middleware expects JSON for that route.
This wrapper handles the legacy multipart shape explicitly, while forwarding
all normal requests to backend.production so the existing billing/security
middleware remains in control.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import uuid
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.production import app as production_app
from backend.cinematic_animation import render_cinematic_animation, MAX_IMAGE_BYTES
import store


ANIMATION_COST = 2
MAX_DURATION = 30.0


class MultipartAnimationCompatibilityMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/api/generate"
        ):
            await self.app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode(errors="replace") for k, v in scope.get("headers", [])}
        content_type = headers.get("content-type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            await self.app(scope, receive, send)
            return

        # Authenticate here because this compatibility path is outside the
        # JSON-only production credit middleware.
        auth = headers.get("authorization", "")
        user = None
        if auth.startswith("Bearer "):
            try:
                from backend.main import _verify_token
                payload = _verify_token(auth[7:])
                user = store.get_user(payload.get("user_id")) if payload else None
            except Exception:
                user = None
        if not user:
            await self._json(send, 401, {"detail": "Authentication required"})
            return

        key = headers.get("idempotency-key") or uuid.uuid4().hex
        try:
            reservation = store.reserve_credits(user["id"], "video", ANIMATION_COST, key)
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

            effect = str(form.get("effect") or "zoom-in")
            duration = max(1.0, min(float(form.get("duration") or 5), MAX_DURATION))

            from backend.main import OUTPUT_DIR
            video_name = f"auto_cinematic_{uuid.uuid4().hex[:12]}.mp4"
            video_path = OUTPUT_DIR / video_name

            await asyncio.to_thread(
                render_cinematic_animation,
                image_bytes,
                video_path,
                effect,
                duration,
            )

            if not video_path.exists() or video_path.stat().st_size == 0:
                raise RuntimeError("Animation output was not created")

            url = f"/api/file/{video_name}"
            store.finalize_reservation(reservation.get("reservation_id"), ANIMATION_COST)
            await self._json(send, 200, {
                "status": "ok",
                "cached": False,
                "file": url,
                "video": url,
                "video_url": url,
                "effect": effect,
                "duration": duration,
                "message": f"Cinematic animation complete ({effect}, 30fps, 1080p).",
            })
        except Exception as exc:
            try:
                store.refund_reservation(reservation.get("reservation_id"), "animation_failed")
            except Exception:
                pass
            await self._json(send, 500, {"detail": f"Animation failed: {str(exc)[:240]}"})

    @staticmethod
    async def _json(send: Send, status: int, payload: dict):
        data = json.dumps(payload).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(data)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": data})


app = MultipartAnimationCompatibilityMiddleware(production_app)
