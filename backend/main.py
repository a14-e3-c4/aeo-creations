"""
AI Video Generation App — Backend v4
- FastAPI server
- Hugging Face FLUX.1-schnell for AI images (free tier)
- Magic Hour AI for REAL AI video generation (text-to-video)
- moviepy + ffmpeg for Ken Burns MP4 from images
- Groq AI for script generation
- Image/URL upload
- Image editing (crop, filter, brightness)
- Video editing (trim, transitions)
"""

import os
import json
import asyncio
import time
import hashlib
import shutil
import logging
import io
import base64
import uuid
import secrets
import urllib.request
import tempfile
import math
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import requests as http_requests
from huggingface_hub import InferenceClient
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageDraw
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# moviepy imports for real video generation
try:
    from moviepy import (
        ImageClip,
        CompositeVideoClip,
        concatenate_videoclips,
        concatenate_audioclips,
        ColorClip,
        TextClip,
    )
    MOVIEPY_AVAILABLE = True
    logger.info("moviepy available — real MP4 generation enabled")
except ImportError:
    MOVIEPY_AVAILABLE = False
    logger.warning("moviepy not available — will return images only")

# Find ffmpeg
try:
    import imageio_ffmpeg
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
    os.environ["FFMPEG_BINARY"] = FFMPEG_PATH
    logger.info(f"ffmpeg found at: {FFMPEG_PATH}")
except Exception:
    FFMPEG_PATH = shutil.which("ffmpeg") or "ffmpeg"
    logger.info(f"ffmpeg from PATH: {FFMPEG_PATH}")

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

HF_TOKEN = os.getenv("HF_TOKEN", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
MAGIC_HOUR_API_KEY = os.getenv("MAGIC_HOUR_API_KEY", "").strip()
NGROK_VIDEO_URL = os.getenv("NGROK_VIDEO_URL", "https://anew-jigsaw-fancy.ngrok-free.dev/generate-video").strip()
PIXVERSE_API_KEY = os.getenv("PIXVERSE_API_KEY", "").strip()
JSON2VIDEO_API_KEY = os.getenv("JSON2VIDEO_API_KEY", "").strip()
REWIND_API_KEY = os.getenv("REWIND_API_KEY", "").strip()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODAL_TOKEN_ID = os.getenv("MODAL_TOKEN_ID", "").strip()
MODAL_TOKEN_SECRET = os.getenv("MODAL_TOKEN_SECRET", "").strip()
CACHE_DIR = ROOT / "cache"
OUTPUT_DIR = ROOT / "output"
UPLOAD_DIR = ROOT / "uploads"
USAGE_FILE = ROOT / "usage.json"

CACHE_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)

MODELS = {
    "text-to-video": {
        "id": "black-forest-labs/FLUX.1-schnell",
        "kind": "t2v",
        "description": "Generate a cinematic image + Ken Burns video from your prompt",
    },
    "ai-video": {
        "id": "magic-hour",
        "kind": "t2v-ai",
        "description": "Generate REAL AI video from text using Magic Hour (Kling, Seedance, etc.)",
    },
    "ngrok-video": {
        "id": "ngrok-proxy",
        "kind": "t2v-proxy",
        "description": "Generate video via Ngrok tunnel endpoint",
    },
    "image-to-video": {
        "id": "black-forest-labs/FLUX.1-schnell",
        "kind": "i2v",
        "description": "Upload an image to animate into a video",
    },
}

hf_client = InferenceClient(token=HF_TOKEN) if HF_TOKEN else None

# Modal cloud GPU for premium FLUX.1-dev image generation
MODAL_AVAILABLE = False
try:
    if MODAL_TOKEN_ID and MODAL_TOKEN_SECRET:
        import modal as _modal
        os.environ["MODAL_TOKEN_ID"] = MODAL_TOKEN_ID
        os.environ["MODAL_TOKEN_SECRET"] = MODAL_TOKEN_SECRET
        MODAL_AVAILABLE = True
        logger.info("Modal cloud GPU configured — premium FLUX.1-dev available")
    else:
        logger.info("No Modal credentials — using local image generation")
except ImportError:
    logger.info("Modal not installed — using local image generation")


def generate_image_modal(prompt: str) -> bytes:
    """Generate premium image via Modal cloud GPU (FLUX.1-dev on A10G)."""
    import modal as _modal
    # Import the function from the sibling script
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from flux_modal import generate_high_quality_image

    logger.info(f"Modal FLUX.1-dev: generating on cloud A10G GPU...")
    img_bytes = generate_high_quality_image.remote(prompt)
    logger.info(f"Modal image generated: {len(img_bytes)} bytes")
    return img_bytes


# Groq client for script generation
try:
    from groq import Groq
    groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
    if groq_client:
        logger.info("Groq client ready — script generation enabled")
except ImportError:
    groq_client = None
    logger.warning("groq package not installed — script generation unavailable")

# Magic Hour API
MAGIC_HOUR_BASE = "https://api.magichour.ai/v1"
MAGIC_HOUR_MODELS = {
    "ltx-2.3": {"name": "LTX 2.3 (Fast)", "max_dur": 30, "free_tier": True},
    "wan-2.2": {"name": "WAN 2.2 (Strong)", "max_dur": 15, "free_tier": True},
    "seedance-2.0-mini": {"name": "Seedance Mini", "max_dur": 15, "free_tier": True},
    "kling-3.0": {"name": "Kling 3.0 (Best)", "max_dur": 15, "free_tier": False},
    "sora-2": {"name": "Sora 2 (OpenAI)", "max_dur": 60, "free_tier": False},
    "veo3.1": {"name": "Veo 3.1 (Google)", "max_dur": 56, "free_tier": False},
}

# Track async video generation jobs in memory
video_jobs = {}

app = FastAPI(title="AI Video Generator", version="4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# -----------------------------------------------------------------------------
# Usage tracker
# -----------------------------------------------------------------------------
USAGE_RESET_DAYS = 7


def load_usage() -> dict:
    if not USAGE_FILE.exists():
        return {"calls": [], "cycle_start": datetime.now().isoformat()}
    try:
        return json.loads(USAGE_FILE.read_text())
    except Exception:
        return {"calls": [], "cycle_start": datetime.now().isoformat()}


def save_usage(data: dict) -> None:
    USAGE_FILE.write_text(json.dumps(data, indent=2))


def record_call(model_id: str, status: str) -> None:
    data = load_usage()
    data["calls"].append(
        {"ts": datetime.now().isoformat(), "model": model_id, "status": status}
    )
    data["calls"] = data["calls"][-200:]
    save_usage(data)


def usage_summary() -> dict:
    data = load_usage()
    cutoff = datetime.now() - timedelta(days=USAGE_RESET_DAYS)
    recent = [
        c for c in data["calls"] if datetime.fromisoformat(c["ts"]) > cutoff
    ]
    success = sum(1 for c in recent if c["status"] == "ok")
    failed = sum(1 for c in recent if c["status"] == "error")
    return {
        "cycle_days": USAGE_RESET_DAYS,
        "window_calls": len(recent),
        "successful": success,
        "failed": failed,
        "cycle_start": data.get("cycle_start"),
        "by_model": {
            m: sum(1 for c in recent if c["model"] == m) for m in MODELS.keys()
        },
    }


# -----------------------------------------------------------------------------
# Caching
# -----------------------------------------------------------------------------
def cache_key(payload: dict) -> str:
    s = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(s.encode()).hexdigest()[:16]


def cached_path(key: str, ext: str = "png") -> Path:
    return CACHE_DIR / f"{key}.{ext}"


# -----------------------------------------------------------------------------
# Request/response models
# -----------------------------------------------------------------------------
class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    model: str = Field(default="text-to-video")
    negative_prompt: Optional[str] = Field(
        default="blurry, low quality, distorted, watermark, text"
    )
    num_frames: int = Field(default=16, ge=8, le=48)
    fps: int = Field(default=8, ge=4, le=24)
    seed: Optional[int] = Field(default=None, ge=0, le=2_147_483_647)
    image_b64: Optional[str] = None  # for image-to-video
    # Ken Burns settings
    kb_effect: str = Field(default="zoom-in")
    kb_duration: float = Field(default=5.0, ge=2.0, le=30.0)


class EditImageRequest(BaseModel):
    image_b64: str
    action: str
    value: Optional[float] = None
    crop_box: Optional[dict] = None


class TrimVideoRequest(BaseModel):
    file_path: str
    start_time: float = 0.0
    end_time: float = -1


class TransitionRequest(BaseModel):
    file_paths: List[str]
    transition_type: str = "fade"
    transition_duration: float = 1.0


class GenerateResponse(BaseModel):
    status: str
    cached: bool
    file: Optional[str]
    image: Optional[str]
    video: Optional[str]
    message: Optional[str]
    usage: dict


# -----------------------------------------------------------------------------
# Magic Hour API helpers
# -----------------------------------------------------------------------------
def magic_hour_headers():
    return {
        "Authorization": f"Bearer {MAGIC_HOUR_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def magic_hour_submit_video(prompt: str, model: str = "ltx-2.3",
                            duration: int = 5, aspect_ratio: str = "16:9",
                            resolution: str = "480p", audio: bool = False) -> dict:
    """Submit a text-to-video job to Magic Hour API."""
    payload = {
        "end_seconds": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "model": model,
        "audio": audio,
        "style": {"prompt": prompt},
        "name": f"aivideo-{uuid.uuid4().hex[:8]}",
    }
    resp = http_requests.post(
        f"{MAGIC_HOUR_BASE}/text-to-video",
        headers=magic_hour_headers(),
        json=payload,
        timeout=30,
    )
    if resp.status_code == 402:
        raise HTTPException(502, "Magic Hour credits depleted. Check your plan.")
    if resp.status_code == 401:
        raise HTTPException(502, "Magic Hour API key is invalid.")
    resp.raise_for_status()
    return resp.json()


def magic_hour_check_status(project_id: str) -> dict:
    """Check Magic Hour video project status."""
    resp = http_requests.get(
        f"{MAGIC_HOUR_BASE}/video-projects/{project_id}",
        headers=magic_hour_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def magic_hour_download_video(download_url: str, output_path: str) -> str:
    """Download a completed video from Magic Hour."""
    resp = http_requests.get(download_url, timeout=120, stream=True)
    resp.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    return output_path


# -----------------------------------------------------------------------------
# Pre-flight validation
# -----------------------------------------------------------------------------
def preflight(req: GenerateRequest) -> Optional[str]:
    # text-to-video works without HF_TOKEN — falls back to Pollinations.ai (free)
    if req.model == "ai-video" and not MAGIC_HOUR_API_KEY:
        return (
            "No MAGIC_HOUR_API_KEY configured. Get one at magichour.ai/api."
        )
    if req.model not in MODELS:
        return f"Unknown model '{req.model}'. Available: {list(MODELS.keys())}"
    bad = ["test", "asdf", "123", "qwerty"]
    if req.prompt.strip().lower() in bad:
        return "Prompt looks like a test string. Use a descriptive prompt."
    return None


# -----------------------------------------------------------------------------
# Image Generation — HF FLUX.1-schnell
# -----------------------------------------------------------------------------
def generate_image_from_pollinations(prompt: str, style: str = "cinematic", width: int = 4096, height: int = 2304, enhance: bool = True, nologo: bool = False) -> bytes:
    """Generate a high-quality image using Pollinations.ai (free, no key)."""
    import urllib.parse
    from PIL import ImageFilter, ImageEnhance

    # Build Lovable-style enhanced prompt for maximum quality
    style_hints = {
        "cinematic": "anamorphic lens flare, shallow depth of field, teal-amber color grade, cinematic lighting",
        "photorealistic": "shot on 85mm f/1.4, natural skin texture, true-to-life colour, photorealistic",
        "anime": "hand-painted illustration, bold linework, rich gouache texture, anime style",
        "3d render": "octane render, subsurface scattering, global illumination, 3D render",
        "digital art": "detailed digital painting, vibrant colors, concept art quality, digital art",
        "oil painting": "classical oil painting, rich brushstrokes, gallery quality",
        "watercolor": "soft watercolor painting, delicate washes, artistic watercolor",
        "pixel art": "retro pixel art, 16-bit style, nostalgic pixel art",
    }
    style_hint = style_hints.get(style, style_hints["cinematic"])
    if enhance:
        cinematic_prompt = (
            f"{prompt}. "
            f"{style_hint}. "
            f"Ultra-high resolution, razor-sharp focus, fine micro-detail. "
            f"High dynamic range, deep contrast, rich color depth, professional color grading. "
            f"Masterpiece quality, award-winning photography. "
            f"Avoid: blurry, low quality, distorted, watermark, text."
        )
    else:
        cinematic_prompt = prompt
    encoded_prompt = urllib.parse.quote(cinematic_prompt)
    # Use flux model (best quality) at max resolution with enhance=true
    seed = int(time.time() * 1000) % 100000
    url = (
        f"https://image.pollinations.ai/prompt/{encoded_prompt}"
        f"?width={width}&height={height}&seed={seed}&model=flux&enhance=true"
    )

    for attempt in range(3):
        try:
            logger.info(f"Pollinations flux (attempt {attempt+1}/3) for: {prompt[:80]}...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=90) as response:
                img_bytes = response.read()

            if len(img_bytes) < 1000:
                logger.warning(f"Pollinations returned tiny image ({len(img_bytes)} bytes)")
                time.sleep(3)
                continue

            # Post-process: upscale + sharpen + boost contrast for cinematic feel
            try:
                pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                orig_w, orig_h = pil_img.size
                target_w, target_h = width, height

                # Only upscale if image is smaller than target
                if orig_w < target_w or orig_h < target_h:
                    # Multi-step upscale: go 2x then down to target for better sharpness
                    pil_img = pil_img.resize(
                        (target_w * 2, target_h * 2), Image.LANCZOS
                    )
                    pil_img = pil_img.resize(
                        (target_w, target_h), Image.LANCZOS
                    )

                # Boost contrast slightly for cinematic look
                enhancer = ImageEnhance.Contrast(pil_img)
                pil_img = enhancer.enhance(1.15)

                # Boost color saturation for vivid cinematic feel
                enhancer = ImageEnhance.Color(pil_img)
                pil_img = enhancer.enhance(1.10)

                # Sharpen to recover crisp details
                pil_img = pil_img.filter(
                    ImageFilter.UnsharpMask(radius=3, percent=150, threshold=2)
                )

                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                img_bytes = buf.getvalue()
                logger.info(
                    f"Upscaled {orig_w}x{orig_h} → {target_w}x{target_h}, "
                    f"contrast+15%, saturation+10%, sharpened"
                )
            except Exception as ue:
                logger.warning(f"Post-process failed, using raw: {ue}")

            logger.info(f"Pollinations image generated: {len(img_bytes)} bytes")
            return img_bytes
        except Exception as e:
            logger.error(f"Pollinations failed (attempt {attempt+1}/3): {str(e)[:100]}")
            time.sleep(5)
    
    raise HTTPException(status_code=502, detail="All image generation providers failed")


def generate_image_gemini(prompt: str, style: str = "cinematic", width: int = 4096, height: int = 2304, enhance: bool = True) -> bytes:
    """Generate a high-quality image using Google Gemini (free tier). Lovable-quality output."""
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY not configured")

    # Build the Lovable-style enhanced prompt
    style_hints = {
        "cinematic": "anamorphic lens flare, shallow depth of field, teal-amber color grade",
        "photorealistic": "shot on 85mm f/1.4, natural skin texture, true-to-life colour",
        "anime": "hand-painted illustration, bold linework, rich gouache texture",
        "3d render": "octane render, subsurface scattering, global illumination",
        "digital art": "detailed digital painting, vibrant colors, concept art quality",
        "oil painting": "classical oil painting, rich brushstrokes, gallery quality",
        "watercolor": "soft watercolor painting, delicate washes, artistic",
        "pixel art": "retro pixel art, 16-bit style, nostalgic",
    }
    style_hint = style_hints.get(style, style_hints["cinematic"])
    aspect = f"{width}:{height}"

    enhanced_prompt = (
        f"{prompt}. "
        f"{style_hint}. "
        f"Aspect ratio {aspect}. "
        f"Ultra-high resolution, razor-sharp focus, fine micro-detail. "
        f"High dynamic range, deep contrast, rich color depth, professional color grading. "
        f"Masterpiece quality, award-winning photography."
    )

    import urllib.parse
    import base64

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
        f"models/gemini-2.5-flash-image:generateContent?key={GEMINI_API_KEY}"
    )

    payload = {
        "contents": [{"parts": [{"text": enhanced_prompt}]}],
        "generationConfig": {
            "responseModalities": ["image", "text"],
            "temperature": 1.0,
        },
    }

    for attempt in range(2):
        try:
            logger.info(f"Gemini image gen (attempt {attempt+1}/2): {prompt[:80]}...")
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                result = json.loads(resp.read().decode())

            # Extract image from response
            candidates = result.get("candidates", [])
            if not candidates:
                logger.warning("Gemini returned no candidates")
                time.sleep(3)
                continue

            parts = candidates[0].get("content", {}).get("parts", [])
            img_bytes = None
            for part in parts:
                if "inlineData" in part:
                    img_bytes = base64.b64decode(part["inlineData"]["data"])
                    break

            if not img_bytes or len(img_bytes) < 1000:
                logger.warning(f"Gemini returned tiny/no image ({len(img_bytes) if img_bytes else 0} bytes)")
                time.sleep(3)
                continue

            # Post-process: resize to target + enhance
            try:
                pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                orig_w, orig_h = pil_img.size
                if orig_w < width or orig_h < height:
                    pil_img = pil_img.resize((width * 2, height * 2), Image.LANCZOS)
                    pil_img = pil_img.resize((width, height), Image.LANCZOS)
                enhancer = ImageEnhance.Contrast(pil_img)
                pil_img = enhancer.enhance(1.10)
                enhancer = ImageEnhance.Color(pil_img)
                pil_img = enhancer.enhance(1.05)
                pil_img = pil_img.filter(
                    ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2)
                )
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                img_bytes = buf.getvalue()
                logger.info(f"Gemini image: {orig_w}x{orig_h} → {width}x{height}, {len(img_bytes)} bytes")
            except Exception as pe:
                logger.warning(f"Post-process failed: {pe}")

            return img_bytes
        except urllib.error.HTTPError as he:
            body = he.read().decode() if he.fp else str(he)
            logger.error(f"Gemini HTTP {he.code}: {body[:200]}")
            if he.code == 429:
                time.sleep(10)
            else:
                time.sleep(3)
        except Exception as e:
            logger.error(f"Gemini failed: {str(e)[:150]}")
            time.sleep(3)

    raise HTTPException(status_code=502, detail="Gemini image generation failed after retries")


def generate_image(prompt: str, negative_prompt: str = "", style: str = "cinematic", width: int = 4096, height: int = 2304, enhance: bool = True, nologo: bool = False) -> bytes:
    """Generate an image: Modal FLUX.1-dev (best) → Gemini → HF FLUX → Pollinations (free)."""
    # Priority 0: Modal Cloud GPU — FLUX.1-dev on A10G (cinema-grade quality)
    if MODAL_AVAILABLE:
        try:
            logger.info("Trying Modal FLUX.1-dev on cloud A10G GPU...")
            return generate_image_modal(prompt)
        except Exception as e:
            logger.warning(f"Modal failed, falling back: {str(e)[:100]}")

    # Priority 1: Gemini (Lovable-quality)
    if GEMINI_API_KEY:
        try:
            logger.info("Trying Gemini for image generation...")
            return generate_image_gemini(prompt, style=style, width=width, height=height, enhance=enhance)
        except Exception as e:
            logger.warning(f"Gemini failed, falling back: {str(e)[:100]}")

    # Priority 2: HuggingFace FLUX
    if not hf_client:
        logger.warning("No HF client — using Pollinations fallback")
        return generate_image_from_pollinations(prompt, style=style, width=width, height=height, enhance=enhance, nologo=nologo)

    last_error = None
    hf_depleted = False
    for attempt in range(3):
        try:
            logger.info(f"Generating image (attempt {attempt+1}/3) for: {prompt[:80]}...")
            # Build Lovable-style enhanced prompt for HF FLUX
            style_hints_hf = {
                "cinematic": "anamorphic lens flare, shallow depth of field, teal-amber color grade",
                "photorealistic": "shot on 85mm f/1.4, natural skin texture, true-to-life colour",
                "anime": "hand-painted illustration, bold linework, rich gouache texture",
                "3d render": "octane render, subsurface scattering, global illumination",
                "digital art": "detailed digital painting, vibrant colors, concept art quality",
                "oil painting": "classical oil painting, rich brushstrokes, gallery quality",
                "watercolor": "soft watercolor painting, delicate washes",
                "pixel art": "retro pixel art, 16-bit style",
            }
            hint = style_hints_hf.get(style, style_hints_hf["cinematic"])
            hf_prompt = (
                f"{prompt}. {hint}. "
                f"Ultra-high resolution, razor-sharp focus, fine micro-detail. "
                f"High dynamic range, deep contrast, rich color depth, professional color grading. "
                f"Masterpiece quality. Avoid: blurry, low quality, distorted."
            )
            img = hf_client.text_to_image(
                prompt=hf_prompt,
                model="black-forest-labs/FLUX.1-schnell",
            )

            buf = io.BytesIO()
            img.save(buf, format="PNG", quality=95)
            img_bytes = buf.getvalue()
            logger.info(f"Image generated: {len(img_bytes)} bytes, size: {img.size}")

            if len(img_bytes) < 1000:
                last_error = "Generated image too small"
                time.sleep(3)
                continue

            return img_bytes

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Image generation failed (attempt {attempt+1}/3): {error_msg[:200]}")
            last_error = error_msg

            if "402" in error_msg or "Payment" in error_msg or "depleted" in error_msg.lower():
                hf_depleted = True
                logger.warning("HF credits depleted — switching to Pollinations fallback")
                break

            wait = (attempt + 1) * 5
            logger.warning(f"Waiting {wait}s before retry...")
            time.sleep(wait)
            continue

    # If HF failed or depleted, fall back to Pollinations
    if hf_depleted or last_error:
        logger.info("Falling back to Pollinations.ai image generation")
        return generate_image_from_pollinations(prompt, style=style, width=width, height=height, enhance=enhance, nologo=nologo)

    raise HTTPException(
        status_code=502,
        detail=f"Image generation failed after 3 attempts: {last_error}"
    )


# -----------------------------------------------------------------------------
# Ken Burns video generation from image
# -----------------------------------------------------------------------------
def _ease_in_out(t: float) -> float:
    """Smooth ease-in-out curve for natural camera movement."""
    return t * t * (3 - 2 * t)


def create_ken_burns_video(
    image_bytes: bytes,
    output_path: str,
    effect: str = "zoom-in",
    duration: float = 5.0,
    fps: int = 24,
    resolution: tuple = (1920, 1080),
) -> str:
    """Create a cinematic MP4 video from an image with advanced Ken Burns effects.
    
    Effects:
    - zoom-in: Smooth zoom into center with slight upward drift
    - zoom-out: Start zoomed, pull back to reveal full scene
    - pan-left: Slow cinematic pan from right to left
    - pan-right: Slow cinematic pan from left to right
    - zoom-pan: Zoom in while panning — the classic documentary move
    - dolly: Push-in with slight rotation feel
    """
    if not MOVIEPY_AVAILABLE:
        raise HTTPException(status_code=500, detail="moviepy not installed — cannot create video")

    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    target_w, target_h = resolution
    img_w, img_h = pil_img.size
    
    # Scale image to fill target with minimal room for movement
    # Use 1.1x overscan — keeps the full image visible, no cropping
    overscan = 1.1
    scale = max(target_w / img_w, target_h / img_h) * overscan
    new_w = int(img_w * scale)
    new_h = int(img_h * scale)
    pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

    # Center crop as starting position
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    pil_img = pil_img.crop((left, top, left + target_w, top + target_h))

    temp_img = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    pil_img.save(temp_img.name, "PNG")
    temp_img.close()

    try:
        from moviepy import vfx
        
        clip = ImageClip(temp_img.name, duration=duration)
        
        # --- Cinematic camera movements ---
        max_zoom = 1.08  # Subtle zoom — keeps full image visible
        pan_amount = 0.06  # Gentle pan — no cropping
        
        if effect == "zoom-in":
            # Smooth zoom in with slight upward drift
            def zoom_func(t):
                progress = _ease_in_out(t / duration)
                return 1 + (max_zoom - 1) * progress
            clip = clip.with_effects([vfx.Resize(zoom_func)])
            
        elif effect == "zoom-out":
            # Start zoomed, pull back
            def zoom_func(t):
                progress = _ease_in_out(t / duration)
                return max_zoom - (max_zoom - 1) * progress
            clip = clip.with_effects([vfx.Resize(zoom_func)])
            
        elif effect == "pan-left":
            # Cinematic left pan with subtle zoom
            def pos_func(t):
                progress = _ease_in_out(t / duration)
                x = int(target_w * pan_amount * (1 - progress))
                y = int(-target_h * 0.02 * progress)  # slight upward drift
                return (x, y)
            clip = clip.with_position(pos_func)
            clip = clip.with_effects([vfx.Resize(lambda t: 1 + 0.05 * _ease_in_out(t / duration))])
            
        elif effect == "pan-right":
            # Cinematic right pan with subtle zoom
            def pos_func(t):
                progress = _ease_in_out(t / duration)
                x = int(-target_w * pan_amount * (1 - progress))
                y = int(-target_h * 0.02 * progress)
                return (x, y)
            clip = clip.with_position(pos_func)
            clip = clip.with_effects([vfx.Resize(lambda t: 1 + 0.05 * _ease_in_out(t / duration))])
            
        elif effect == "zoom-pan":
            # The classic: zoom in while panning diagonally
            def zoom_func(t):
                progress = _ease_in_out(t / duration)
                return 1 + (max_zoom - 1) * progress
            def pos_func(t):
                progress = _ease_in_out(t / duration)
                x = int(-target_w * pan_amount * 0.5 * progress)
                y = int(-target_h * pan_amount * 0.3 * progress)
                return (x, y)
            clip = clip.with_effects([vfx.Resize(zoom_func)])
            clip = clip.with_position(pos_func)
            
        elif effect == "dolly":
            # Dolly push-in: fast start, slow end (like a real dolly)
            def zoom_func(t):
                # Logarithmic easing for dolly feel
                progress = math.log(1 + t / duration * 9) / math.log(10)
                return 1 + (max_zoom - 1) * progress
            clip = clip.with_effects([vfx.Resize(zoom_func)])
            
        else:
            # Default: gentle zoom in
            clip = clip.with_effects([vfx.Resize(lambda t: 1 + 0.08 * _ease_in_out(t / duration))])

        # --- Cinematic overlays ---
        
        # 1. Fade in/out (0.3s each — subtle)
        fade_time = min(0.3, duration * 0.1)
        clip = clip.with_effects([vfx.FadeIn(fade_time), vfx.FadeOut(fade_time)])
        
        # 2. No letterbox bars — full clean image display
        final = clip

        final.write_videofile(
            output_path, fps=fps, codec="libx264", audio=False,
            preset="slow", threads=4, logger=None,
            ffmpeg_params=["-crf", "18", "-pix_fmt", "yuv420p"],
        )

        logger.info(f"Video created: {output_path} ({os.path.getsize(output_path)} bytes) [effect={effect}]")
        return output_path

    finally:
        try:
            os.unlink(temp_img.name)
        except Exception:
            pass
        try:
            if 'vignette_temp' in locals():
                os.unlink(vignette_temp.name)
        except Exception:
            pass


# -----------------------------------------------------------------------------
# Image editing
# -----------------------------------------------------------------------------
def edit_image(image_bytes: bytes, action: str, value: float = None, crop_box: dict = None) -> bytes:
    """Apply image editing operations."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    if action == "crop" and crop_box:
        w, h = img.size
        x = int(crop_box.get("x", 0) * w / 100)
        y = int(crop_box.get("y", 0) * h / 100)
        cw = int(crop_box.get("w", 100) * w / 100)
        ch = int(crop_box.get("h", 100) * h / 100)
        img = img.crop((x, y, x + cw, y + ch))
    elif action == "brightness":
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(value or 1.5)
    elif action == "contrast":
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(value or 1.5)
    elif action == "saturate":
        enhancer = ImageEnhance.Color(img)
        img = enhancer.enhance(value or 1.5)
    elif action == "blur":
        img = img.filter(ImageFilter.GaussianBlur(radius=value or 3))
    elif action == "grayscale":
        img = ImageOps.grayscale(img).convert("RGB")
    elif action == "sepia":
        gray = ImageOps.grayscale(img)
        sepia = Image.merge("RGB", [
            gray.point(lambda x: min(255, int(x * 1.2 + 40))),
            gray.point(lambda x: min(255, int(x * 1.0 + 20))),
            gray.point(lambda x: min(255, int(x * 0.8))),
        ])
        img = sepia
    elif action == "flip":
        img = ImageOps.mirror(img)
    elif action == "rotate":
        img = img.rotate(value or 90, expand=True)
    elif action == "sharpen":
        img = img.filter(ImageFilter.SHARPEN)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    buf = io.BytesIO()
    img.save(buf, format="PNG", quality=95)
    return buf.getvalue()


# =============================================================================
# ROUTES
# =============================================================================

@app.get("/")
def root():
    ui = ROOT / "frontend" / "index.html"
    if ui.exists():
        return FileResponse(ui)
    return {
        "app": "AI Video Generator",
        "version": "4.0",
        "status": "ok",
        "hf_configured": bool(HF_TOKEN),
        "magic_hour_configured": bool(MAGIC_HOUR_API_KEY),
        "modal_configured": MODAL_AVAILABLE,
        "moviepy_available": MOVIEPY_AVAILABLE,
        "models": list(MODELS.keys()),
    }


app.mount("/static", StaticFiles(directory=str(ROOT / "frontend")), name="static")


@app.get("/api/status")
def api_status():
    return {
        "app": "AI Video Generator",
        "version": "4.0",
        "status": "ok",
        "hf_configured": bool(HF_TOKEN),
        "magic_hour_configured": bool(MAGIC_HOUR_API_KEY),
        "groq_configured": bool(GROQ_API_KEY),
        "gemini_configured": bool(GEMINI_API_KEY),
        "modal_configured": MODAL_AVAILABLE,
        "moviepy_available": MOVIEPY_AVAILABLE,
        "ffmpeg_path": FFMPEG_PATH,
        "models": list(MODELS.keys()),
        "ai_video_models": MAGIC_HOUR_MODELS,
    }


@app.get("/api/prompt-tips")
def prompt_tips():
    return {
        "do": [
            "Describe the subject + action + setting + camera style",
            "Add cinematic/quality terms: 'cinematic, 4k, highly detailed, slow motion'",
            "Be specific: 'a calico cat on a wooden fence at sunset' beats 'a cat outside'",
            "Mention lighting: 'golden hour', 'neon lighting', 'overcast'",
        ],
        "dont": [
            "Don't use just one or two words — too vague",
            "Don't include words you want to avoid — use the negative prompt field",
            "Don't chain unrelated ideas in one prompt — pick one scene",
        ],
        "examples": [
            "a calico cat walking on a wooden fence at sunset, cinematic, slow motion",
            "astronaut floating in space with earth behind, 4k, highly detailed",
            "close-up of a coffee cup, steam rising, morning window light",
            "timelapse of clouds over snow-capped mountains, golden hour, cinematic",
        ],
    }


@app.get("/api/models")
def list_models():
    return MODELS


@app.get("/api/effects")
def list_effects():
    return {
        "ken_burns": [
            {"id": "zoom-in", "name": "Zoom In"},
            {"id": "zoom-out", "name": "Zoom Out"},
            {"id": "pan-left", "name": "Pan Left"},
            {"id": "pan-right", "name": "Pan Right"},
            {"id": "zoom-in-pan", "name": "Zoom + Pan"},
        ],
        "image_filters": [
            {"id": "brightness", "name": "Brightness"},
            {"id": "contrast", "name": "Contrast"},
            {"id": "saturate", "name": "Saturation"},
            {"id": "blur", "name": "Blur"},
            {"id": "grayscale", "name": "Grayscale"},
            {"id": "sepia", "name": "Sepia"},
            {"id": "sharpen", "name": "Sharpen"},
            {"id": "flip", "name": "Flip Horizontal"},
        ],
    }


@app.get("/api/ai-video-models")
def ai_video_models():
    """List available Magic Hour AI video models."""
    return {
        "models": MAGIC_HOUR_MODELS,
        "api_configured": bool(MAGIC_HOUR_API_KEY),
    }


# -----------------------------------------------------------------------------
# Script Generation — Groq
# -----------------------------------------------------------------------------
class ScriptRequest(BaseModel):
    idea: str = Field(..., min_length=3, max_length=500)
    style: str = Field(default="cinematic")
    duration: int = Field(default=30, ge=10, le=300)


class ScriptResponse(BaseModel):
    status: str
    title: str
    scenes: List[dict]
    full_script: str
    message: str


@app.post("/api/generate-script")
async def generate_script(request: Request, body: ScriptRequest):
    """Generate a video script with scenes using Groq AI."""
    _enforce_credits(request, "script")
    if not groq_client:
        raise HTTPException(400, "Groq API not configured. Add GROQ_API_KEY to .env file.")

    prompt = f"""
You are a professional video scriptwriter. Generate a detailed video script based on this idea:

Idea: {body.idea}
Style: {body.style}
Target duration: {body.duration} seconds

Return a JSON object with this EXACT structure (no markdown, just raw JSON):
{{
  "title": "Video title",
  "scenes": [
    {{
      "scene_number": 1,
      "duration": 5,
      "description": "What happens in this scene",
      "visual_prompt": "AI image generation prompt for this scene - detailed, cinematic",
      "voiceover": "What the narrator says",
      "caption": "On-screen text"
    }}
  ]
}}

Make sure:
- Each scene is 3-10 seconds
- Total duration adds up to approximately {body.duration} seconds
- Visual prompts are detailed enough for AI image/video generation
- Voiceover text is natural and engaging
- Captions are short and impactful
- The script tells a complete story
- Return ONLY the JSON, no other text
"""

    try:
        response = groq_client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": "You are a professional video scriptwriter. Always return valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
        )

        content = response.choices[0].message.content.strip()

        if content.startswith("```"):
            content = content.split("\n", 1)[1]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        script_data = json.loads(content)

        title = script_data.get("title", "Untitled Video")
        scenes = script_data.get("scenes", [])

        if not scenes:
            raise HTTPException(500, "AI returned empty scenes")

        full_script = f"# {title}\n\n"
        for scene in scenes:
            full_script += f"## Scene {scene.get('scene_number', '?')} ({scene.get('duration', '?')}s)\n"
            full_script += f"{scene.get('voiceover', '')}\n\n"

        record_call("groq-script", "ok")

        return ScriptResponse(
            status="ok",
            title=title,
            scenes=scenes,
            full_script=full_script,
            message=f"Generated script with {len(scenes)} scenes ({body.duration}s target)",
        )

    except json.JSONDecodeError as e:
        record_call("groq-script", "error")
        raise HTTPException(500, f"AI returned invalid JSON: {str(e)[:100]}")
    except Exception as e:
        record_call("groq-script", "error")
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg:
            raise HTTPException(400, "Invalid Groq API key. Check GROQ_API_KEY in .env")
        raise HTTPException(500, f"Script generation failed: {error_msg[:200]}")


# =============================================================================
# AI VIDEO GENERATION — Magic Hour API (REAL AI VIDEO!)
# =============================================================================
class AIVideoRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    model: str = Field(default="ltx-2.3")
    duration: int = Field(default=5, ge=1, le=30)
    aspect_ratio: str = Field(default="16:9")
    resolution: str = Field(default="480p")
    audio: bool = Field(default=False)


@app.post("/api/generate-ai-video")
async def generate_ai_video(request: Request, body: AIVideoRequest):
    """
    Submit an AI video generation job to Magic Hour.
    Returns immediately with a job ID for polling.
    """
    _enforce_credits(request, "magic-hour")
    if not MAGIC_HOUR_API_KEY:
        raise HTTPException(400, "Magic Hour API not configured. Add MAGIC_HOUR_API_KEY to .env")

    # Validate model
    model_info = MAGIC_HOUR_MODELS.get(body.model)
    if not model_info:
        raise HTTPException(400, f"Unknown model '{body.model}'. Available: {list(MAGIC_HOUR_MODELS.keys())}")

    # Validate duration for this model
    if body.duration > model_info["max_dur"]:
        body.duration = model_info["max_dur"]

    try:
        logger.info(f"Submitting Magic Hour video job: model={body.model}, dur={body.duration}s, prompt={body.prompt[:60]}...")
        result = magic_hour_submit_video(
            prompt=body.prompt,
            model=body.model,
            duration=body.duration,
            aspect_ratio=body.aspect_ratio,
            resolution=body.resolution,
            audio=body.audio,
        )

        job_id = result.get("id", "unknown")
        credits = result.get("credits_charged", 0)

        # Store job info in memory
        video_jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "prompt": body.prompt,
            "model": body.model,
            "duration": body.duration,
            "credits_estimated": credits,
            "created_at": datetime.now().isoformat(),
            "download_url": None,
            "local_path": None,
            "error": None,
        }

        record_call("magic-hour-video", "ok")
        logger.info(f"Magic Hour job submitted: id={job_id}, credits={credits}")

        return {
            "status": "queued",
            "job_id": job_id,
            "credits_estimated": credits,
            "message": f"Video generation started with {model_info['name']}. Poll /api/video-status/{job_id} for progress.",
        }

    except HTTPException as http_err:
        # Structured error response so the frontend can fall back gracefully
        if http_err.status_code == 502 and "credits" in str(http_err.detail).lower():
            record_call("magic-hour-video", "error")
            return JSONResponse(status_code=502, content={
                "error": True,
                "error_type": "credits_exhausted",
                "message": "Magic Hour credits are exhausted. They reset monthly.",
                "fallback": {
                    "available": True,
                    "method": "ken_burns",
                    "message": "Falling back to AI Image + Ken Burns video (free, unlimited).",
                },
            })
        if http_err.status_code == 502 and "invalid" in str(http_err.detail).lower():
            record_call("magic-hour-video", "error")
            return JSONResponse(status_code=502, content={
                "error": True,
                "error_type": "invalid_key",
                "message": "Magic Hour API key is invalid.",
                "fallback": {
                    "available": True,
                    "method": "ken_burns",
                    "message": "Falling back to AI Image + Ken Burns video (free, unlimited).",
                },
            })
        raise
    except Exception as e:
        record_call("magic-hour-video", "error")
        error_msg = str(e)
        logger.error(f"Magic Hour submission failed: {error_msg[:300]}")
        # Return structured error with fallback
        if "402" in error_msg or "credit" in error_msg.lower():
            return JSONResponse(status_code=502, content={
                "error": True,
                "error_type": "credits_exhausted",
                "message": "Magic Hour credits are exhausted. They reset monthly.",
                "fallback": {
                    "available": True,
                    "method": "ken_burns",
                    "message": "Falling back to AI Image + Ken Burns video (free, unlimited).",
                },
            })
        return JSONResponse(status_code=500, content={
            "error": True,
            "error_type": "generation_failed",
            "message": f"Video generation failed: {error_msg[:300]}",
            "fallback": {
                "available": True,
                "method": "ken_burns",
                "message": "Falling back to AI Image + Ken Burns video (free, unlimited).",
            },
        })


@app.get("/api/video-status/{job_id}")
async def get_video_status(job_id: str):
    """Poll Magic Hour for video generation status."""
    if job_id not in video_jobs:
        raise HTTPException(404, f"Job {job_id} not found")

    job = video_jobs[job_id]

    # If already completed, return cached result
    if job["status"] == "completed":
        return {
            "status": "completed",
            "job_id": job_id,
            "video_url": f"/api/file/{Path(job['local_path']).name}" if job["local_path"] else None,
            "message": "Video ready!",
        }

    if job["status"] == "failed":
        return {
            "status": "failed",
            "job_id": job_id,
            "error": job["error"],
        }

    # Poll Magic Hour
    try:
        result = magic_hour_check_status(job_id)
        mh_status = result.get("status", "unknown")
        logger.info(f"Magic Hour job {job_id}: status={mh_status}")

        if mh_status == "complete":
            # Download the video
            downloads = result.get("downloads", [])
            if downloads:
                download_url = downloads[0].get("url", "")
                if download_url:
                    output_name = f"mh_{job_id[:12]}.mp4"
                    output_path = OUTPUT_DIR / output_name
                    magic_hour_download_video(download_url, str(output_path))

                    job["status"] = "completed"
                    job["local_path"] = str(output_path)
                    job["download_url"] = f"/api/file/{output_name}"

                    final_credits = result.get("credits_charged", job["credits_estimated"])
                    job["credits_actual"] = final_credits

                    record_call("magic-hour-video-download", "ok")
                    logger.info(f"Magic Hour video downloaded: {output_path} ({os.path.getsize(output_path)} bytes)")

                    return {
                        "status": "completed",
                        "job_id": job_id,
                        "video_url": f"/api/file/{output_name}",
                        "credits_charged": final_credits,
                        "message": "Video ready for playback!",
                    }

            job["status"] = "failed"
            job["error"] = "No download URL in completed response"
            return {"status": "failed", "job_id": job_id, "error": "No download URL available"}

        elif mh_status == "error":
            job["status"] = "failed"
            job["error"] = result.get("error", "Unknown error from Magic Hour")
            record_call("magic-hour-video", "error")
            return {"status": "failed", "job_id": job_id, "error": job["error"]}

        else:
            # Still processing
            job["status"] = "processing"
            return {
                "status": "processing",
                "job_id": job_id,
                "mh_status": mh_status,
                "message": f"Video is {mh_status}... Keep polling.",
            }

    except Exception as e:
        logger.error(f"Status poll failed for {job_id}: {str(e)[:200]}")
        return {
            "status": job.get("status", "processing"),
            "job_id": job_id,
            "message": "Status check failed — will retry on next poll.",
        }


# =============================================================================
# MODAL CLOUD GPU — PREMIUM FLUX.1-DEV IMAGE GENERATION
# =============================================================================
@app.post("/api/modal-generate")
def api_modal_generate(request: Request, body: dict):
    """Generate premium image via Modal cloud GPU (FLUX.1-dev on A10G)."""
    _enforce_credits(request, "image")
    prompt = body.get("prompt", "")
    if not prompt:
        raise HTTPException(400, "prompt is required")

    if not MODAL_AVAILABLE:
        raise HTTPException(503, "Modal cloud GPU not configured. Add MODAL_TOKEN_ID and MODAL_TOKEN_SECRET to .env")

    try:
        import base64
        img_bytes = generate_image_modal(prompt)
        b64 = base64.b64encode(img_bytes).decode()
        return {"image": b64, "provider": "modal-flux-dev", "message": "Premium FLUX.1-dev image via Modal A10G GPU"}
    except Exception as e:
        logger.error(f"Modal generation failed: {str(e)[:200]}")
        raise HTTPException(502, f"Modal generation failed: {str(e)[:200]}")


# =============================================================================
# IMAGE GENERATION — Gemini → Modal → Pollinations (free fallback)
# =============================================================================
@app.post("/api/generate-hf-image")
def generate_hf_image(request: Request, body: dict):
    """Generate image: Gemini (best) → Modal FLUX → Pollinations (free)."""
    _enforce_credits(request, "image")
    prompt = body.get("prompt", "")
    if not prompt:
        raise HTTPException(400, "prompt is required")

    import base64

    # Priority 1: Google Gemini — skip if quota exhausted (fast fail)
    if GEMINI_API_KEY:
        try:
            logger.info(f"Gemini image gen: {prompt[:80]}...")
            img_bytes = generate_image_gemini(prompt)
            b64 = base64.b64encode(img_bytes).decode()
            logger.info(f"Gemini image: {len(img_bytes)} bytes")
            return {"image": b64, "provider": "gemini", "message": "Premium image generated via Google Gemini"}
        except Exception as e:
            err_msg = str(e)[:100]
            if '429' in err_msg or 'quota' in err_msg.lower():
                logger.warning(f"Gemini quota exhausted — skipping to Pollinations")
                # Don't try Gemini again for a while
            else:
                logger.warning(f"Gemini failed: {err_msg}")

    # Priority 2: Modal Cloud GPU (FLUX.1-dev on A10G)
    if MODAL_AVAILABLE:
        try:
            logger.info(f"Modal FLUX.1-dev: {prompt[:80]}...")
            img_bytes = generate_image_modal(prompt)
            b64 = base64.b64encode(img_bytes).decode()
            return {"image": b64, "provider": "modal-flux-dev", "message": "Premium image via Modal A10G GPU"}
        except Exception as e:
            logger.warning(f"Modal failed, falling back: {str(e)[:100]}")

    # Priority 3: Pollinations.ai FLUX (free, no key)
    import urllib.parse
    encoded = urllib.parse.quote(prompt)
    seed = int(time.time() * 1000) % 100000
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=1920&height=1080&seed={seed}&model=flux&enhance=true"
    )

    logger.info(f"Pollinations FLUX direct: {prompt[:80]}...")

    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                img_bytes = resp.read()

            if len(img_bytes) < 1000:
                logger.warning(f"Pollinations tiny image ({len(img_bytes)} bytes)")
                time.sleep(3)
                continue

            # Post-process for quality
            try:
                from PIL import ImageFilter, ImageEnhance
                pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                enhancer = ImageEnhance.Contrast(pil_img)
                pil_img = enhancer.enhance(1.10)
                enhancer = ImageEnhance.Color(pil_img)
                pil_img = enhancer.enhance(1.05)
                pil_img = pil_img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=2))
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                img_bytes = buf.getvalue()
            except Exception as pe:
                logger.warning(f"Post-process skipped: {pe}")

            b64 = base64.b64encode(img_bytes).decode()
            logger.info(f"Pollinations FLUX image: {len(img_bytes)} bytes")
            return {"image": b64, "provider": "pollinations", "message": "FLUX image generated via Pollinations"}

        except Exception as e:
            logger.error(f"Pollinations failed (attempt {attempt+1}/3): {str(e)[:100]}")
            time.sleep(5)

    raise HTTPException(502, "All image providers failed")


# =============================================================================
# IMAGE + KEN BURNS VIDEO GENERATION (existing HF pipeline)
# =============================================================================
@app.post("/api/generate")
def generate(request: Request, req: GenerateRequest):
    """Generate an AI image and optionally convert to MP4 video."""
    action = "video" if req.kb_effect else "image"
    _enforce_credits(request, action)
    err = preflight(req)
    if err:
        raise HTTPException(status_code=400, detail=err)

    # Cache check (image only)
    key = cache_key(req.model_dump(exclude={"kb_effect", "kb_duration"}))
    cp = cached_path(key, "png")

    if cp.exists():
        img_bytes = cp.read_bytes()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")

        video_path = None
        if MOVIEPY_AVAILABLE:
            video_file = OUTPUT_DIR / f"{key}.mp4"
            if not video_file.exists():
                try:
                    create_ken_burns_video(img_bytes, str(video_file),
                                           effect=req.kb_effect, duration=req.kb_duration)
                except Exception as e:
                    logger.error(f"Video creation from cache failed: {e}")
            if video_file.exists():
                video_path = f"/api/file/{video_file.name}"

        record_call(req.model, "ok-cached")
        return GenerateResponse(
            status="ok", cached=True, file=f"/api/file/{cp.name}",
            image=img_b64, video=video_path,
            message="Returned from cache — no API call used.",
            usage=usage_summary(),
        )

    # Generate image
    try:
        img_bytes = generate_image(req.prompt, req.negative_prompt or "")
    except HTTPException as e:
        record_call(req.model, "error")
        raise e

    cp.write_bytes(img_bytes)
    out = OUTPUT_DIR / f"{key}.png"
    out.write_bytes(img_bytes)
    record_call(req.model, "ok")

    img_b64 = base64.b64encode(img_bytes).decode("utf-8")

    # Create Ken Burns video
    video_path = None
    if MOVIEPY_AVAILABLE:
        video_file = OUTPUT_DIR / f"{key}.mp4"
        try:
            create_ken_burns_video(img_bytes, str(video_file),
                                   effect=req.kb_effect, duration=req.kb_duration)
            video_path = f"/api/file/{video_file.name}"
        except Exception as e:
            logger.error(f"Video creation failed: {e}")
            return GenerateResponse(
                status="partial", cached=False, file=f"/api/file/{out.name}",
                image=img_b64, video=None,
                message=f"Image generated but video failed: {str(e)[:100]}",
                usage=usage_summary(),
            )

    return GenerateResponse(
        status="ok", cached=False, file=f"/api/file/{out.name}",
        image=img_b64, video=video_path,
        message="Generated! Real MP4 video with Ken Burns effect.",
        usage=usage_summary(),
    )


# -----------------------------------------------------------------------------
# Upload endpoints
# -----------------------------------------------------------------------------
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload an image or video file."""
    allowed_types = {
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/webm", "video/quicktime",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 50MB)")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(contents)

    file_type = "video" if file.content_type.startswith("video") else "image"

    return {
        "status": "ok", "filename": filename, "url": f"/uploads/{filename}",
        "type": file_type, "size": len(contents), "content_type": file.content_type,
    }


@app.post("/api/import-url")
async def import_url(body: dict):
    """Import media from a URL."""
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(400, "URL is required")

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            contents = response.read()
            content_type = response.headers.get("Content-Type", "image/jpeg")
    except Exception as e:
        raise HTTPException(400, f"Failed to download: {str(e)[:200]}")

    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 50MB)")

    ext_map = {
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
        "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm",
    }
    ext = ext_map.get(content_type.split(";")[0].strip(), "jpg")
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(contents)

    file_type = "video" if content_type.startswith("video") else "image"

    return {
        "status": "ok", "filename": filename, "url": f"/uploads/{filename}",
        "type": file_type, "size": len(contents), "content_type": content_type,
    }


@app.get("/api/uploads")
def list_uploads():
    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file():
            file_type = "video" if f.suffix in (".mp4", ".webm", ".mov") else "image"
            files.append({
                "filename": f.name, "url": f"/uploads/{f.name}",
                "type": file_type, "size": f.stat().st_size,
            })
    files.sort(key=lambda x: x["size"], reverse=True)
    return {"files": files, "count": len(files)}


@app.delete("/api/uploads/{filename}")
def delete_upload(filename: str):
    filepath = UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "File not found")
    filepath.unlink()
    return {"status": "deleted", "filename": filename}


# -----------------------------------------------------------------------------
# Image editing endpoints
# -----------------------------------------------------------------------------
@app.post("/api/edit-image")
async def api_edit_image(body: EditImageRequest):
    try:
        img_bytes = base64.b64decode(body.image_b64)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")

    try:
        result = edit_image(img_bytes, body.action, body.value, body.crop_box)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Edit failed: {str(e)[:200]}")

    result_b64 = base64.b64encode(result).decode("utf-8")
    key = hashlib.sha256(result).hexdigest()[:16]
    out = OUTPUT_DIR / f"edited_{key}.png"
    out.write_bytes(result)

    return {"status": "ok", "image": result_b64, "file": f"/api/file/{out.name}", "action": body.action}


@app.post("/api/edit-image-upload")
async def edit_image_upload(
    file: UploadFile = File(...),
    action: str = Form("brightness"),
    value: float = Form(1.5),
):
    contents = await file.read()
    try:
        result = edit_image(contents, action, value)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Edit failed: {str(e)[:200]}")

    result_b64 = base64.b64encode(result).decode("utf-8")
    key = hashlib.sha256(result).hexdigest()[:16]
    out = OUTPUT_DIR / f"edited_{key}.png"
    out.write_bytes(result)

    return {"status": "ok", "image": result_b64, "file": f"/api/file/{out.name}"}


# -----------------------------------------------------------------------------
# Video editing endpoints
# -----------------------------------------------------------------------------
def resolve_file_path(file_path: str) -> Path:
    clean = file_path.lstrip("/")
    if clean.startswith("api/file/"):
        filename = clean[len("api/file/"):]
        return OUTPUT_DIR / filename
    if clean.startswith("uploads/"):
        filename = clean[len("uploads/"):]
        return UPLOAD_DIR / filename
    return ROOT / clean


@app.post("/api/trim-video")
async def trim_video(body: TrimVideoRequest):
    if not MOVIEPY_AVAILABLE:
        raise HTTPException(500, "moviepy not installed")

    from moviepy import VideoFileClip

    input_path = resolve_file_path(body.file_path)
    if not input_path.exists():
        raise HTTPException(404, f"Video not found: {body.file_path} -> {input_path}")

    clip = VideoFileClip(str(input_path))
    end = body.end_time if body.end_time > 0 else clip.duration
    trimmed = clip.subclipped(body.start_time, end)

    output_name = f"trimmed_{uuid.uuid4().hex[:8]}.mp4"
    output_path = OUTPUT_DIR / output_name
    trimmed.write_videofile(str(output_path), codec="libx264", audio=False, logger=None)

    clip.close()
    trimmed.close()

    return {"status": "ok", "file": f"/api/file/{output_name}", "duration": end - body.start_time}


@app.post("/api/transition")
async def add_transition(body: TransitionRequest):
    if not MOVIEPY_AVAILABLE:
        raise HTTPException(500, "moviepy not installed")

    from moviepy import VideoFileClip, vfx

    clips = []
    for fp in body.file_paths:
        full = resolve_file_path(fp)
        if full.exists():
            clips.append(VideoFileClip(str(full)))

    if len(clips) < 2:
        raise HTTPException(400, "Need at least 2 video clips")

    for i, clip in enumerate(clips):
        clips[i] = clip.with_effects([
            vfx.FadeIn(body.transition_duration),
            vfx.FadeOut(body.transition_duration),
        ])

    final = concatenate_videoclips(clips, method="compose")

    output_name = f"transition_{uuid.uuid4().hex[:8]}.mp4"
    output_path = OUTPUT_DIR / output_name
    final.write_videofile(str(output_path), codec="libx264", audio=False, logger=None)

    for clip in clips:
        clip.close()
    final.close()

    return {"status": "ok", "file": f"/api/file/{output_name}"}


# -----------------------------------------------------------------------------
# Image Animation — animate any uploaded image into video
# -----------------------------------------------------------------------------
@app.post("/api/animate-image")
async def animate_image(
    file: UploadFile = File(...),
    effect: str = Form("zoom-in"),
    duration: float = Form(5.0),
    fps: int = Form(24),
):
    """Take any uploaded image and animate it into an MP4 video with Ken Burns effects."""
    if not MOVIEPY_AVAILABLE:
        raise HTTPException(500, "moviepy not installed — cannot create video")

    contents = await file.read()
    if len(contents) < 1000:
        raise HTTPException(400, "Uploaded file is too small or not a valid image")

    # Validate it's an image
    try:
        test_img = Image.open(io.BytesIO(contents))
        test_img.verify()
    except Exception:
        raise HTTPException(400, "Uploaded file is not a valid image")

    # Re-read after verify (verify closes the file)
    contents = await file.read() if len(contents) == 0 else contents
    # Actually, we already have contents. Verify just validates, doesn't consume.
    # But PIL verify() can close the fp. Let's just re-open from bytes.

    logger.info(f"Animating image: {file.filename} ({len(contents)} bytes), effect={effect}, duration={duration}s")

    try:
        video_name = f"anim_{uuid.uuid4().hex[:12]}.mp4"
        video_path = OUTPUT_DIR / video_name
        create_ken_burns_video(
            contents,
            str(video_path),
            effect=effect,
            duration=duration,
            fps=fps,
        )
        record_call("animate-image", "ok")
        return {
            "status": "ok",
            "video": f"/api/file/{video_name}",
            "video_url": f"/api/file/{video_name}",
            "effect": effect,
            "duration": duration,
            "message": f"Image animated with {effect} effect ({duration}s)",
        }
    except HTTPException:
        raise
    except Exception as e:
        record_call("animate-image", "error")
        logger.error(f"Image animation failed: {str(e)}")
        raise HTTPException(500, f"Animation failed: {str(e)[:200]}")


@app.post("/api/animate-upload")
async def animate_upload(
    image_b64: str = Form(...),
    effect: str = Form("zoom-in"),
    duration: float = Form(5.0),
):
    """Animate a base64-encoded image into video."""
    if not MOVIEPY_AVAILABLE:
        raise HTTPException(500, "moviepy not installed")

    try:
        img_bytes = base64.b64decode(image_b64)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")

    try:
        video_name = f"anim_{uuid.uuid4().hex[:12]}.mp4"
        video_path = OUTPUT_DIR / video_name
        create_ken_burns_video(
            img_bytes,
            str(video_path),
            effect=effect,
            duration=duration,
        )
        record_call("animate-image-b64", "ok")
        return {
            "status": "ok",
            "video": f"/api/file/{video_name}",
            "video_url": f"/api/file/{video_name}",
            "effect": effect,
            "duration": duration,
            "message": f"Image animated with {effect} effect ({duration}s)",
        }
    except Exception as e:
        record_call("animate-image-b64", "error")
        raise HTTPException(500, f"Animation failed: {str(e)[:200]}")


# -----------------------------------------------------------------------------
# Ngrok Video Generation — proxy to external tunnel
# -----------------------------------------------------------------------------
class NgrokVideoRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    duration: int = Field(default=5, ge=1, le=60)
    effect: str = Field(default="zoom-in")
    style: str = Field(default="cinematic")
    width: int = Field(default=1920)
    height: int = Field(default=1080)
    enhance: bool = Field(default=True)
    nologo: bool = Field(default=False)


@app.post("/generate-video")
async def ngrok_generate_video(body: NgrokVideoRequest):
    """
    Proxy endpoint that generates video locally using HF image + Ken Burns.
    This is the endpoint your ngrok tunnel should forward to.
    """
    try:
        # Generate AI image with style and quality settings
        img_bytes = generate_image(
            body.prompt,
            style=body.style,
            width=body.width,
            height=body.height,
            enhance=body.enhance,
            nologo=body.nologo,
        )

        # Save image
        key = cache_key({"prompt": body.prompt, "source": "ngrok"})
        img_path = OUTPUT_DIR / f"{key}.png"
        img_path.write_bytes(img_bytes)

        # Create Ken Burns video
        video_path = OUTPUT_DIR / f"{key}.mp4"
        if MOVIEPY_AVAILABLE:
            create_ken_burns_video(
                img_bytes, str(video_path),
                effect=body.effect, duration=float(body.duration),
            )
            video_url = f"/api/file/{video_path.name}"
        else:
            video_url = None

        record_call("ngrok-video", "ok")
        return {
            "status": "ok",
            "image": f"/api/file/{img_path.name}",
            "video": video_url,
            "message": f"Video generated for: {body.prompt[:80]}",
        }
    except HTTPException as e:
        record_call("ngrok-video", "error")
        raise
    except Exception as e:
        record_call("ngrok-video", "error")
        logger.error(f"Ngrok video generation failed: {e}")
        raise HTTPException(500, f"Video generation failed: {str(e)[:200]}")


@app.post("/api/generate-ngrok-video")
async def generate_ngrok_video(body: NgrokVideoRequest):
    """
    Try to generate video via the external ngrok tunnel URL.
    Falls back to local generation if the tunnel is offline.
    """
    # Try the external ngrok endpoint first
    try:
        resp = http_requests.post(
            NGROK_VIDEO_URL,
            json={"prompt": body.prompt},  # Kaggle endpoint only accepts prompt
            timeout=120,
            headers={"ngrok-skip-browser-warning": "true"},
        )
        if resp.status_code == 200:
            data = resp.json()
            # Check for CUDA/model errors from the remote
            if data.get("detail"):
                logger.warning(f"Ngrok remote returned error: {data['detail'][:200]}")
                # Don't return error — fall through to local generation
            elif data.get("status") == "ok":
                # Success — save the video/frames from the remote
                record_call("ngrok-video-remote", "ok")
                # If remote returns gif_base64, save it
                if data.get("gif_base64"):
                    import base64 as b64
                    gif_bytes = b64.b64decode(data["gif_base64"])
                    video_name = f"ngrok_{secrets.token_hex(8)}.gif"
                    video_path = OUTPUT_DIR / video_name
                    video_path.write_bytes(gif_bytes)
                    return {
                        "status": "completed",
                        "video_url": f"/api/file/{video_name}",
                        "source": "ngrok-remote",
                        "message": data.get("message", "Generated via Kaggle"),
                    }
                return data
    except Exception as e:
        logger.warning(f"Ngrok tunnel unreachable: {str(e)[:100]}. Falling back to local generation.")

    # Fall back to local generation
    return await ngrok_generate_video(body)


@app.get("/api/ngrok-status")
async def ngrok_status():
    """Check if the ngrok tunnel is online."""
    try:
        resp = http_requests.get(
            NGROK_VIDEO_URL.rsplit("/", 1)[0],
            timeout=5,
            headers={"ngrok-skip-browser-warning": "true"},
        )
        online = resp.status_code != 502 and "offline" not in resp.text.lower()
    except Exception:
        online = False

    return {
        "ngrok_url": NGROK_VIDEO_URL,
        "online": online,
        "message": "Ngrok tunnel is online" if online else "Ngrok tunnel is offline — using local generation",
    }


# -----------------------------------------------------------------------------
# PixVerse AI Video Generation (real AI video!)
# -----------------------------------------------------------------------------
class PixVerseRequest(BaseModel):
    prompt: str
    duration: int = 5
    aspect_ratio: str = "16:9"
    quality: str = "540p"


class KlingRequest(BaseModel):
    """Request for Kling AI video generation (image-to-video)."""
    image_url: str = ""
    prompt: str = "Cinematic camera panning, realistic movement, 4k resolution"
    duration: int = 5
    model: str = "kling-v1-5"


class KlingImageRequest(BaseModel):
    """Request for Kling AI image generation (text-to-image)."""
    prompt: str
    model: str = "kling-v1"


class Json2VideoRequest(BaseModel):
    prompt: str
    duration: int = 5
    width: int = 1920
    height: int = 1080
    fps: int = 25
    quality: str = "high"


KLING_API_KEY = os.getenv("KLING_API_KEY", "")
KLING_BASE_URL = "https://api-singapore.klingai.com"


def _kling_headers():
    return {
        "Authorization": f"Bearer {KLING_API_KEY}",
        "Content-Type": "application/json",
    }


@app.post("/api/generate-kling-image")
async def generate_kling_image(request: Request, body: KlingImageRequest):
    """Generate an image using Kling AI image generation."""
    _enforce_credits(request, "kling-image")
    if not KLING_API_KEY:
        raise HTTPException(500, "KLING_API_KEY not configured")
    
    payload = {
        "model": body.model or "kling-v1",
        "prompt": body.prompt,
        "n": 1,
        "image_fidelity": 0.5,
    }
    
    try:
        response = await asyncio.to_thread(
            http_requests.post,
            f"{KLING_BASE_URL}/v1/images/generations",
            json=payload,
            headers=_kling_headers(),
            timeout=15,
        )
        data = response.json()
        logger.info(f"Kling image response: {str(data)[:200]}")
        
        if response.status_code == 200 and data.get("data"):
            img_url = data["data"][0].get("url") or data["data"][0].get("b64_json")
            if img_url:
                record_call("kling-image", "ok")
                return {"status": "ok", "image_url": img_url, "provider": "kling-ai"}
        
        raise HTTPException(502, f"Kling image failed: {data}")
    except HTTPException:
        raise
    except Exception as e:
        record_call("kling-image", "error")
        raise HTTPException(502, f"Kling image error: {str(e)[:200]}")


@app.post("/api/generate-kling")
async def generate_kling_video(request: Request, body: KlingRequest):
    """Generate REAL AI video using Kling AI (image-to-video).
    Quick check: if Kling is down, return immediately so frontend falls back to Ken Burns.
    """
    _enforce_credits(request, "kling-video")
    if not KLING_API_KEY:
        raise HTTPException(500, "KLING_API_KEY not configured")
    
    payload = {
        "model": body.model or "kling-v1-5",
        "image_url": body.image_url,
        "prompt": body.prompt or "cinematic camera movement, smooth animation",
        "duration": body.duration,
    }
    
    try:
        # Submit video generation task (10s timeout — don't block the frontend)
        response = await asyncio.to_thread(
            http_requests.post,
            f"{KLING_BASE_URL}/v1/videos/image2video",
            json=payload,
            headers=_kling_headers(),
            timeout=15,
        )
        data = response.json()
        logger.info(f"Kling submit response: {str(data)[:300]}")
        
        # Kling wraps task_id in data.task_id
        task_id = data.get("data", {}).get("task_id") or data.get("task_id")
        if response.status_code != 200 or not task_id:
            raise HTTPException(502, f"Kling submit failed: {str(data)[:300]}")
        
        logger.info(f"Kling task submitted: {task_id}")
        
        # Poll until complete (max 2 minutes)
        for _ in range(8):
            await asyncio.sleep(15)
            
            status_resp = await asyncio.to_thread(
                http_requests.get,
                f"{KLING_BASE_URL}/v1/videos/image2video/{task_id}",
                headers=_kling_headers(),
                timeout=15,
            )
            status_data = status_resp.json()
            # Kling wraps in data object
            task_info = status_data.get("data", status_data)
            status = task_info.get("status")
            
            if status == "succeed":
                videos = task_info.get("task_result", {}).get("videos", [])
                video_url = videos[0].get("url") if videos else None
                if video_url:
                    record_call("kling", "ok")
                    return {
                        "status": "ok",
                        "video_url": video_url,
                        "task_id": task_id,
                        "provider": "kling-ai",
                    }
            elif status == "failed":
                record_call("kling", "error")
                raise HTTPException(502, f"Kling generation failed: {task_info}")
        
        record_call("kling", "timeout")
        raise HTTPException(504, "Kling generation timed out (2 min limit)")
        
    except HTTPException:
        raise
    except Exception as e:
        record_call("kling", "error")
        raise HTTPException(500, f"Kling API error: {str(e)[:200]}")


@app.post("/api/generate-json2video")
async def generate_json2video(body: Json2VideoRequest):
    """Generate a real AI video using JSON2Video API.
    
    Flow:1. Generate cinematic image from Pollinations
    2. Send image + text overlay to JSON2Video for rendering3. Poll until done
    4. Return video URL
    """
    if not JSON2VIDEO_API_KEY:
        return {"error": True, "message": "JSON2Video API key not configured"}

    try:
        # Step 1: Generate a cinematic image from Pollinations
        logger.info(f"JSON2Video: generating image for '{body.prompt[:60]}...'")
        img_bytes = generate_image_from_pollinations(body.prompt)

        # Save image to output dir
        img_name = f"j2v_{secrets.token_hex(8)}.png"
        img_path = OUTPUT_DIR / img_name
        img_path.write_bytes(img_bytes)
        logger.info(f"JSON2Video: saved AI image to {img_name}")

        # Step 2: Submit to JSON2Video API — cinematic text card
        movie_json = {
            "resolution": "full-hd",
            "width": body.width,
            "height": body.height,
            "fps": body.fps,
            "quality": body.quality,
            "scenes": [
                {
                    "duration": body.duration,
                    "elements": [
                        {
                            "type": "component",
                            "component": "basic/000",
                            "duration": body.duration,
                            "settings": {
                                "card": {
                                    "vertical-align": "center",
                                    "horizontal-align": "center",
                                    "text-align": "center",
                                    "width": "80%",
                                    "padding": "40px",
                                    "background": "rgba(0,0,0,0.7)",
                                    "border-radius": "16px"
                                },
                                "headline": {
                                    "text": body.prompt,
                                    "color": "white",
                                    "font-size": "4vw",
                                    "font-family": "Inter",
                                    "font-weight": "700"
                                },
                                "body": {
                                    "text": "Generated by aeo.creations",
                                    "color": "rgba(255,255,255,0.6)",
                                    "font-size": "2vw"
                                }
                            }
                        }
                    ]
                }
            ]
        }

        resp = http_requests.post(
            "https://api.json2video.com/v2/movies",
            json=movie_json,
            headers={
                "x-api-key": JSON2VIDEO_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=30,
        )

        start_data = resp.json()
        logger.info(f"JSON2Video submit response: {start_data}")

        if not start_data.get("success"):
            return {
                "error": True,
                "message": start_data.get("message", "JSON2Video rejected the request"),
            }

        project_id = start_data["project"]
        logger.info(f"JSON2Video project submitted: {project_id}")

        record_call("json2video", "ok")
        # Return immediately — frontend polls /api/json2video-poll/{project_id}
        return {
            "status": "submitted",
            "project_id": project_id,
            "image_url": f"/api/file/{img_name}",
            "message": f"JSON2Video render started (project: {project_id})",
        }

    except Exception as e:
        logger.error(f"JSON2Video error: {str(e)}")
        record_call("json2video", "error")
        return {"error": True, "message": str(e)}


@app.get("/api/json2video-poll/{project_id}")
async def json2video_poll(project_id: str):
    """Poll JSON2Video render status and download video when done."""
    if not JSON2VIDEO_API_KEY:
        return {"error": True, "message": "JSON2Video not configured"}

    try:
        resp = http_requests.get(
            f"https://api.json2video.com/v2/movies?project={project_id}",
            headers={"x-api-key": JSON2VIDEO_API_KEY},
            timeout=15,
        )

        data = resp.json()
        movie_info = data.get("movie", {})
        status = movie_info.get("status", "unknown")

        if status == "done":
            video_url = movie_info.get("url")
            if not video_url:
                return {"error": True, "message": "Render done but no URL"}

            vid_resp = http_requests.get(video_url, timeout=120)
            vid_name = f"j2v_{secrets.token_hex(8)}.mp4"
            vid_path = OUTPUT_DIR / vid_name
            vid_path.write_bytes(vid_resp.content)

            return {
                "status": "completed",
                "video_url": f"/api/file/{vid_name}",
                "source": "json2video",
                "message": f"Video ready ({len(vid_resp.content) // 1024}KB)",
            }
        elif status == "error":
            return {"error": True, "message": movie_info.get("error", "Render failed")}
        elif status == "timeout":
            return {"error": True, "message": "Render timed out"}
        else:
            return {"status": "processing", "j2v_status": status}

    except Exception as e:
        return {"error": True, "message": str(e)}


@app.get("/api/json2video-status")
async def json2video_status():
    """Check if JSON2Video API key is configured."""
    return {
        "configured": bool(JSON2VIDEO_API_KEY),
        "key_prefix": JSON2VIDEO_API_KEY[:8] + "..." if JSON2VIDEO_API_KEY else "none",
    }


# -----------------------------------------------------------------------------
# Rewind AI — Real AI Video Generation
# -----------------------------------------------------------------------------
class RewindVideoRequest(BaseModel):
    prompt: str
    duration: str = "5s"
    aspect_ratio: str = "16:9"
    model: str = "bytedance/seedance-1-5-pro"


REWIND_MODELS = {
    "bytedance/seedance-1-5-pro": "Seedance 1.5 Pro — Best quality",
    "bytedance/seedance-1-0": "Seedance 1.0 — Fast & cinematic",
    "kuaishou/kling-3-0": "Kling 3.0 — Best motion",
    "google/veo-3": "Veo 3 — Realistic physics",
}


@app.post("/api/generate-rewind")
async def generate_rewind_video(body: RewindVideoRequest):
    """Generate a real AI video using Rewind AI API.
    
    Flow:1. Submit video generation job to Rewind AI
    2. Return job_id for polling
    3. Frontend polls /api/rewind-poll/{job_id}
    """
    if not REWIND_API_KEY:
        return {"error": True, "message": "Rewind API key not configured"}

    try:
        logger.info(f"Rewind: submitting video job — prompt='{body.prompt[:60]}', model={body.model}")

        resp = http_requests.post(
            "https://api.rewind.ai/v1/videos/generate-async",
            json={
                "prompt": body.prompt,
                "duration": body.duration,
                "aspectRatio": body.aspect_ratio,
                "model": body.model,
            },
            headers={
                "Authorization": f"Bearer {REWIND_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )

        start_data = resp.json()
        logger.info(f"Rewind response: {start_data}")

        if resp.status_code != 200 or not start_data.get("id"):
            error_msg = start_data.get("error", start_data.get("message", "Unknown error"))
            return {"error": True, "message": f"Rewind rejected: {error_msg}"}

        job_id = start_data["id"]
        logger.info(f"Rewind job submitted: {job_id}")

        record_call("rewind", "ok")
        return {
            "status": "submitted",
            "job_id": job_id,
            "model": body.model,
            "message": f"Rewind video render started (job: {job_id})",
        }

    except Exception as e:
        logger.error(f"Rewind error: {str(e)}")
        record_call("rewind", "error")
        return {"error": True, "message": str(e)}


@app.get("/api/rewind-poll/{job_id}")
async def rewind_poll(job_id: str):
    """Poll Rewind AI job status and download video when done."""
    if not REWIND_API_KEY:
        return {"error": True, "message": "Rewind not configured"}

    try:
        resp = http_requests.get(
            f"https://api.rewind.ai/v1/jobs/{job_id}",
            headers={"Authorization": f"Bearer {REWIND_API_KEY}"},
            timeout=15,
        )

        data = resp.json()
        status = data.get("status", "unknown")

        if status == "completed" or status == "succeeded":
            video_url = data.get("output", {}).get("url") or data.get("url")
            if not video_url:
                return {"error": True, "message": "Render done but no URL"}

            # Download the rendered video
            vid_resp = http_requests.get(video_url, timeout=120)
            vid_name = f"rewind_{secrets.token_hex(8)}.mp4"
            vid_path = OUTPUT_DIR / vid_name
            vid_path.write_bytes(vid_resp.content)

            return {
                "status": "completed",
                "video_url": f"/api/file/{vid_name}",
                "source": "rewind-ai",
                "message": f"Video ready ({len(vid_resp.content) // 1024}KB)",
            }
        elif status == "failed" or status == "error":
            error_msg = data.get("error", data.get("message", "Render failed"))
            return {"error": True, "message": f"Rewind render failed: {error_msg}"}
        else:
            return {"status": "processing", "rewind_status": status}

    except Exception as e:
        return {"error": True, "message": str(e)}


@app.get("/api/rewind-status")
async def rewind_status():
    """Check if Rewind API key is configured."""
    return {
        "configured": bool(REWIND_API_KEY),
        "key_prefix": REWIND_API_KEY[:14] + "..." if REWIND_API_KEY else "none",
        "models": REWIND_MODELS,
    }


# -----------------------------------------------------------------------------
# OpenRouter — Real AI Video Generation (Google Veo, MiniMax, Wan, etc.)
# -----------------------------------------------------------------------------
class OpenRouterVideoRequest(BaseModel):
    prompt: str
    model: str = "google/veo-3.1"
    duration: int = 5
    resolution: str = "1080p"
    aspect_ratio: str = "16:9"
    generate_audio: bool = True


OPENROUTER_MODELS = {
    "google/veo-3.1": "Google Veo 3.1 — Best quality (1080p)",
    "minimax/hailuo-3": "MiniMax Hailuo 3 — 2K with audio",
    "alibaba/wan-3.0": "Alibaba Wan 3.0 — Up to 30s, 1080p",
    "alibaba/wan-3.0-prime": "Alibaba Wan 3.0 Prime — Best Wan quality",
    "bytedance/seedance-2.5": "Seedance 2.5 — Up to 30s, cinematic",
    "bytedance/seedance-2.0-mini": "Seedance 2.0 Mini — Fast 480p/720p",
    "black-forest-labs/flux-3-video": "FLUX 3 Video — 1080p, 5-20s",
    "runway/gen-4.5": "Runway Gen 4.5 — 720p, fast",
}


@app.post("/api/generate-openrouter")
async def generate_openrouter_video(body: OpenRouterVideoRequest):
    """Generate a real AI video using OpenRouter API.
    
    Flow:
    1. Submit video generation job to OpenRouter
    2. Return job_id for polling
    3. Frontend polls /api/openrouter-poll/{job_id}
    """
    if not OPENROUTER_API_KEY:
        return {"error": True, "message": "OpenRouter API key not configured"}

    try:
        logger.info(f"OpenRouter: submitting video job — prompt='{body.prompt[:60]}', model={body.model}")

        resp = http_requests.post(
            "https://openrouter.ai/api/v1/videos",
            json={
                "model": body.model,
                "prompt": body.prompt,
                "duration": body.duration,
                "resolution": body.resolution,
                "aspect_ratio": body.aspect_ratio,
                "generate_audio": body.generate_audio,
            },
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://aeo.creations",
                "X-Title": "aeo.creations",
            },
            timeout=30,
        )

        start_data = resp.json()
        logger.info(f"OpenRouter response: {start_data}")

        if resp.status_code not in (200, 201, 202) or not start_data.get("id"):
            error_msg = start_data.get("error", start_data.get("message", "Unknown error"))
            return {"error": True, "message": f"OpenRouter rejected: {error_msg}"}

        job_id = start_data["id"]
        polling_url = start_data.get("polling_url", f"https://openrouter.ai/api/v1/videos/{job_id}")
        logger.info(f"OpenRouter job submitted: {job_id}")

        record_call("openrouter", "ok")
        return {
            "status": "submitted",
            "job_id": job_id,
            "polling_url": polling_url,
            "model": body.model,
            "message": f"OpenRouter video render started (job: {job_id})",
        }

    except Exception as e:
        logger.error(f"OpenRouter error: {str(e)}")
        record_call("openrouter", "error")
        return {"error": True, "message": str(e)}


@app.get("/api/openrouter-poll/{job_id}")
async def openrouter_poll(job_id: str):
    """Poll OpenRouter job status and download video when done."""
    if not OPENROUTER_API_KEY:
        return {"error": True, "message": "OpenRouter not configured"}

    try:
        resp = http_requests.get(
            f"https://openrouter.ai/api/v1/videos/{job_id}",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "https://aeo.creations",
            },
            timeout=15,
        )

        data = resp.json()
        status = data.get("status", "unknown")

        if status == "completed":
            # Get the video content URL
            content_url = data.get("unsigned_urls", [None])[0]
            if not content_url:
                # Try the content endpoint directly
                content_url = f"https://openrouter.ai/api/v1/videos/{job_id}/content?index=0"

            # Download the rendered video
            vid_resp = http_requests.get(
                content_url,
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
                timeout=120,
            )
            vid_name = f"openrouter_{secrets.token_hex(8)}.mp4"
            vid_path = OUTPUT_DIR / vid_name
            vid_path.write_bytes(vid_resp.content)

            cost = data.get("usage", {}).get("cost", 0)
            return {
                "status": "completed",
                "video_url": f"/api/file/{vid_name}",
                "source": "openrouter",
                "cost": cost,
                "message": f"Video ready ({len(vid_resp.content) // 1024}KB, cost: ${cost:.4f})",
            }
        elif status == "failed":
            error_msg = data.get("error", "Render failed")
            return {"error": True, "message": f"OpenRouter render failed: {error_msg}"}
        else:
            return {"status": "processing", "or_status": status}

    except Exception as e:
        return {"error": True, "message": str(e)}


@app.get("/api/openrouter-status")
async def openrouter_status():
    """Check if OpenRouter API key is configured."""
    return {
        "configured": bool(OPENROUTER_API_KEY),
        "key_prefix": OPENROUTER_API_KEY[:14] + "..." if OPENROUTER_API_KEY else "none",
        "models": OPENROUTER_MODELS,
    }


@app.post("/api/generate-pixverse")
async def generate_pixverse_video(body: PixVerseRequest):
    """Generate REAL AI video using PixVerse API."""
    if not PIXVERSE_API_KEY:
        return {"error": True, "message": "PixVerse API key not configured"}

    try:
        import uuid as _uuid

        # Step 1: Submit generation job
        trace_id = str(_uuid.uuid4())
        resp = http_requests.post(
            "https://app-api.pixverse.ai/openapi/v2/video/text/generate",
            json={
                "prompt": body.prompt,
                "model": "v6",
                "aspect_ratio": body.aspect_ratio,
                "duration": body.duration,
                "quality": body.quality,
                "motion_mode": "normal",
                "water_mark": False,
            },
            headers={
                "API-KEY": PIXVERSE_API_KEY,
                "Ai-trace-id": trace_id,
                "Content-Type": "application/json",
            },
            timeout=30,
        )

        start_data = resp.json()
        logger.info(f"PixVerse response: {start_data}")

        if start_data.get("ErrCode") != 0:
            return {
                "error": True,
                "message": start_data.get("ErrMsg", "PixVerse rejected the request"),
            }

        video_id = start_data["Resp"]["video_id"]
        logger.info(f"PixVerse job submitted: video_id={video_id}")

        # Step 2: Poll for completion (max 5 minutes)
        max_attempts = 60
        for attempt in range(max_attempts):
            await asyncio.sleep(5)

            check_resp = http_requests.get(
                f"https://app-api.pixverse.ai/openapi/v2/video/result/{video_id}",
                headers={
                    "API-KEY": PIXVERSE_API_KEY,
                    "Ai-trace-id": str(_uuid.uuid4()),
                },
                timeout=15,
            )

            check_data = check_resp.json()
            status = check_data.get("Resp", {}).get("status")

            if status == 1:  # Success
                video_url = check_data["Resp"]["url"]
                logger.info(f"PixVerse video ready: {video_url}")

                # Download the video
                vid_resp = http_requests.get(video_url, timeout=60)
                video_name = f"pixverse_{secrets.token_hex(8)}.mp4"
                video_path = OUTPUT_DIR / video_name
                video_path.write_bytes(vid_resp.content)

                record_call("pixverse", "ok")
                return {
                    "status": "completed",
                    "video_url": f"/api/file/{video_name}",
                    "source": "pixverse-ai",
                    "video_id": video_id,
                    "message": f"Real AI video generated via PixVerse ({len(vid_resp.content) // 1024}KB)",
                }

            elif status == 2:  # Failed
                record_call("pixverse", "error")
                return {
                    "error": True,
                    "message": "PixVerse video generation failed",
                }

            # Still processing (status 0)
            logger.info(f"PixVerse processing... attempt {attempt + 1}/{max_attempts}")

        # Timed out
        record_call("pixverse", "timeout")
        return {
            "error": True,
            "message": "PixVerse video generation timed out after 5 minutes",
        }

    except Exception as e:
        logger.error(f"PixVerse error: {str(e)}")
        record_call("pixverse", "error")
        return {"error": True, "message": str(e)}


@app.get("/api/pixverse-status")
async def pixverse_status():
    """Check if PixVerse API key is configured."""
    return {
        "configured": bool(PIXVERSE_API_KEY),
        "key_prefix": PIXVERSE_API_KEY[:8] + "..." if PIXVERSE_API_KEY else "none",
    }


# -----------------------------------------------------------------------------
# File serving
# -----------------------------------------------------------------------------
@app.get("/api/file/{name}")
def get_file(name: str):
    p = OUTPUT_DIR / name
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "Not found")
    media_map = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".mp4": "video/mp4", ".webm": "video/webm",
    }
    media = media_map.get(p.suffix.lower(), "application/octet-stream")
    return FileResponse(p, media_type=media, filename=name)


@app.delete("/api/cache")
def clear_cache():
    count = 0
    for f in CACHE_DIR.glob("*"):
        f.unlink()
        count += 1
    for f in OUTPUT_DIR.glob("*"):
        f.unlink()
        count += 1
    return {"cleared": count}


# =============================================================================
# CREATE VIDEO WORKFLOW — Production-quality short-form content studio
# =============================================================================

# Store workflow state in memory (job_id -> data)
create_video_jobs = {}


class CreateVideoHookRequest(BaseModel):
    """Step 6: Generate AI hook from topic/platform/content_type."""
    topic: str = Field(..., min_length=3, max_length=500)
    platform: str = Field(default="youtube-shorts")
    content_type: str = Field(default="educational")
    visual_style: str = Field(default="cinematic")


class CreateVideoScriptRequest(BaseModel):
    """Step 7: Generate structured script from hook + settings."""
    topic: str
    platform: str
    duration: int
    content_type: str
    visual_style: str
    hook: str


class CreateVideoScenesRequest(BaseModel):
    """Step 8-9: Generate scene list with visual prompts."""
    topic: str
    platform: str
    duration: int
    content_type: str
    visual_style: str
    hook: str
    script: str


class CreateVideoSceneImageRequest(BaseModel):
    """Step 10: Generate image for a single scene."""
    scene_index: int
    visual_prompt: str
    style: str = "cinematic"
    width: int = 1024
    height: int = 576


class CreateVideoAssembleRequest(BaseModel):
    """Step 11: Assemble all scene images into final video."""
    job_id: str
    scene_images: List[str]  # base64 encoded images
    scene_durations: List[float]
    scene_voiceovers: List[str]
    scene_captions: List[str]
    platform: str = "youtube-shorts"
    title: str = "Generated Video"


PLATFORM_SPECS = {
    "tiktok": {"width": 1080, "height": 1920, "ratio": "9:16", "max_duration": 180},
    "youtube-shorts": {"width": 1080, "height": 1920, "ratio": "9:16", "max_duration": 60},
    "instagram-reels": {"width": 1080, "height": 1920, "ratio": "9:16", "max_duration": 90},
    "youtube": {"width": 1920, "height": 1080, "ratio": "16:9", "max_duration": 600},
    "facebook": {"width": 1280, "height": 720, "ratio": "16:9", "max_duration": 240},
}

CONTENT_TYPE_PROMPTS = {
    "educational": "Use clear, step-by-step visuals. Include diagrams, infographics, and explanatory shots. Narration should be informative and easy to follow.",
    "storytelling": "Create dramatic, emotional scenes. Use cinematic lighting, character close-ups, and atmospheric shots. Build tension and narrative arc.",
    "advertisement": "Make it bold, attention-grabbing, and product-focused. Use vibrant colors, close-up product shots, and energetic transitions. Include a clear call-to-action.",
    "product-promo": "Showcase the product from multiple angles. Use clean backgrounds, highlight features, and create desire through premium aesthetics.",
    "faceless-video": "Use abstract visuals, b-roll footage style imagery, text overlays, and atmospheric scenes. No people needed — focus on mood and message.",
    "documentary": "Use real-world style footage, interviews, landscape shots, and historical imagery. Informative, authentic, and compelling.",
    "motivational": "Use inspiring landscapes, sunrise/sunset imagery, people achieving goals, and uplifting visuals. Build emotional momentum.",
}


@app.post("/api/create-video/generate-hook")
async def create_video_generate_hook(request: Request, body: CreateVideoHookRequest):
    """Step 6: Generate an engaging hook for the video."""
    _enforce_credits(request, "script")
    if not groq_client:
        raise HTTPException(400, "Groq API not configured")

    prompt = f"""
You are a viral content creator. Generate a compelling hook for a {body.content_type} video.

Topic: {body.topic}
Platform: {body.platform}
Visual Style: {body.visual_style}

The hook should:
- Grab attention in the first 1-3 seconds
- Be optimized for {body.platform} audience
- Create curiosity or emotional response
- Be 1-2 sentences maximum
- Work as both text overlay and voiceover opener

Return ONLY the hook text, no quotes, no explanation.
"""

    try:
        response = groq_client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": "You are a viral content creator. Return only the hook text."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.9,
            max_tokens=200,
        )
        hook = response.choices[0].message.content.strip()
        # Clean up any quotes or extra formatting
        hook = hook.strip('"').strip("'").strip('"')
        record_call("create-video-hook", "ok")
        return {"status": "ok", "hook": hook, "message": "Hook generated successfully"}
    except Exception as e:
        record_call("create-video-hook", "error")
        raise HTTPException(500, f"Hook generation failed: {str(e)[:200]}")


@app.post("/api/create-video/generate-script")
async def create_video_generate_script(request: Request, body: CreateVideoScriptRequest):
    """Step 7: Generate structured script with scenes and voiceover."""
    _enforce_credits(request, "script")
    if not groq_client:
        raise HTTPException(400, "Groq API not configured")

    content_guide = CONTENT_TYPE_PROMPTS.get(body.content_type, "Create engaging visuals.")
    plat_spec = PLATFORM_SPECS.get(body.platform, PLATFORM_SPECS["youtube-shorts"])

    prompt = f"""
You are a professional video scriptwriter for {body.platform} content.

Generate a complete video script for:
- Topic: {body.topic}
- Platform: {body.platform} ({plat_spec['ratio']}, max {body.duration}s)
- Content Type: {body.content_type}
- Visual Style: {body.visual_style}
- Hook: {body.hook}

Content Guidelines: {content_guide}

Return a JSON object with this EXACT structure (no markdown, just raw JSON):
{{
  "title": "Compelling video title",
  "scenes": [
    {{
      "scene_number": 1,
      "duration": 5,
      "visual_prompt": "Detailed AI image generation prompt for this scene - cinematic, {body.visual_style}, highly detailed, 4K quality",
      "voiceover": "What the narrator says in this scene",
      "caption": "Short on-screen text overlay"
    }}
  ]
}}

Rules:
- Each scene: 3-10 seconds
- Total duration ≈ {body.duration} seconds
- Visual prompts must be detailed enough for AI image generation
- Voiceover must be natural and engaging
- Captions are short, punchy, max 8 words
- Return ONLY the JSON
"""

    try:
        response = groq_client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": "You are a professional video scriptwriter. Always return valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2500,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        script_data = json.loads(content)
        title = script_data.get("title", body.topic)
        scenes = script_data.get("scenes", [])

        if not scenes:
            raise HTTPException(500, "AI returned empty scenes")

        full_script = f"# {title}\n\n"
        full_script += f"**Hook:** {body.hook}\n\n"
        for s in scenes:
            full_script += f"## Scene {s.get('scene_number', '?')} ({s.get('duration', '?')}s)\n"
            full_script += f"**Visual:** {s.get('visual_prompt', '')}\n"
            full_script += f"**Voiceover:** {s.get('voiceover', '')}\n"
            full_script += f"**Caption:** {s.get('caption', '')}\n\n"

        record_call("create-video-script", "ok")
        return {
            "status": "ok",
            "title": title,
            "scenes": scenes,
            "full_script": full_script,
            "message": f"Script generated: {len(scenes)} scenes, ~{sum(s.get('duration', 5) for s in scenes)}s total",
        }
    except json.JSONDecodeError as e:
        record_call("create-video-script", "error")
        raise HTTPException(500, f"AI returned invalid JSON: {str(e)[:100]}")
    except Exception as e:
        record_call("create-video-script", "error")
        raise HTTPException(500, f"Script generation failed: {str(e)[:200]}")


@app.post("/api/create-video/generate-scene-image")
async def create_video_generate_scene_image(request: Request, body: CreateVideoSceneImageRequest):
    """Step 10: Generate image for a single scene using Pollinations.ai."""
    _enforce_credits(request, "image")
    import urllib.parse
    prompt = body.visual_prompt
    if body.style and body.style not in prompt.lower():
        prompt = f"{prompt}, {body.style} style, cinematic lighting, highly detailed"

    seed = int(time.time() * 1000) % 100000 + body.scene_index
    encoded = urllib.parse.quote(prompt)

    # Use Pollinations.ai — free, no key needed, good quality
    url = f"https://image.pollinations.ai/prompt/{encoded}?width={body.width}&height={body.height}&seed={seed}&nologo=true&enhance=true"

    try:
        resp = http_requests.get(url, timeout=90, stream=True)
        if resp.status_code != 200:
            raise HTTPException(500, f"Image generation failed: HTTP {resp.status_code}")

        img_data = resp.content
        if len(img_data) < 1000:
            raise HTTPException(500, "Image too small — generation failed")

        b64 = base64.b64encode(img_data).decode()

        # Save to output dir
        fname = f"scene_{body.scene_index}_{int(time.time())}.png"
        out_path = OUTPUT_DIR / fname
        out_path.write_bytes(img_data)

        record_call("create-video-scene-image", "ok")
        return {
            "status": "ok",
            "image_b64": b64,
            "filename": fname,
            "url": f"/api/file/{fname}",
            "message": f"Scene {body.scene_index} image generated",
        }
    except http_requests.exceptions.Timeout:
        record_call("create-video-scene-image", "error")
        raise HTTPException(504, "Image generation timed out")
    except HTTPException:
        raise
    except Exception as e:
        record_call("create-video-scene-image", "error")
        raise HTTPException(500, f"Image generation failed: {str(e)[:200]}")


@app.post("/api/create-video/assemble")
async def create_video_assemble(request: Request, body: CreateVideoAssembleRequest):
    """Step 11: Assemble scene images + voiceovers into a final MP4 video."""
    _enforce_credits(request, "assemble")
    if not MOVIEPY_AVAILABLE:
        raise HTTPException(500, "moviepy not available — cannot assemble video")

    from moviepy import vfx as _vfx

    plat_spec = PLATFORM_SPECS.get(body.platform, PLATFORM_SPECS["youtube-shorts"])
    width = plat_spec["width"]
    height = plat_spec["height"]

    try:
        clips = []
        for i, (img_b64, dur, voiceover, caption) in enumerate(
            zip(body.scene_images, body.scene_durations, body.scene_voiceovers, body.scene_captions)
        ):
            # Decode image
            img_bytes = base64.b64decode(img_b64)
            img = Image.open(io.BytesIO(img_bytes))

            # Resize to target dimensions
            img = img.resize((width, height), Image.LANCZOS)

            # Save temp image
            tmp_img = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            img.save(tmp_img.name, "PNG")

            # Create video clip from image
            clip = ImageClip(tmp_img.name, duration=dur)
            clip = clip.with_effects([_vfx.CrossFadeIn(0.5)])
            clips.append(clip)

        # Concatenate all clips with crossfade
        if len(clips) > 1:
            final = concatenate_videoclips(clips, method="compose", padding=-0.5)
        else:
            final = clips[0]

        # Output file
        job_filename = f"final_{body.job_id}.mp4"
        output_path = OUTPUT_DIR / job_filename

        final.write_videofile(
            str(output_path),
            fps=24,
            codec="libx264",
            audio=False,
            preset="fast",
            threads=4,
            logger=None,
        )

        # Cleanup temp files
        for clip in clips:
            try:
                os.unlink(clip.filename)
            except Exception:
                pass

        record_call("create-video-assemble", "ok")
        return {
            "status": "ok",
            "video_url": f"/api/file/{job_filename}",
            "filename": job_filename,
            "duration": sum(body.scene_durations),
            "message": f"Video assembled: {len(clips)} scenes, {sum(body.scene_durations):.1f}s",
        }
    except Exception as e:
        record_call("create-video-assemble", "error")
        raise HTTPException(500, f"Video assembly failed: {str(e)[:200]}")


@app.get("/api/create-video/platforms")
async def create_video_platforms():
    """Return available platforms and their specs."""
    visual_styles = [
        {"id": "cinematic", "label": "Cinematic", "hint": "Film-quality lighting"},
        {"id": "photorealistic", "label": "Photorealistic", "hint": "Ultra-real photos"},
        {"id": "anime", "label": "Anime", "hint": "Japanese animation"},
        {"id": "3d render", "label": "3D Render", "hint": "CGI quality"},
        {"id": "digital art", "label": "Digital Art", "hint": "Illustration style"},
        {"id": "oil painting", "label": "Oil Painting", "hint": "Classical artwork"},
        {"id": "watercolor", "label": "Watercolor", "hint": "Soft painted look"},
        {"id": "pixel art", "label": "Pixel Art", "hint": "Retro game style"},
    ]
    return {
        "platforms": [
            {"id": k, "label": k.replace("-", " ").title(), **v}
            for k, v in PLATFORM_SPECS.items()
        ],
        "content_types": [
            {"id": k, "label": k.replace("-", " ").title()}
            for k in CONTENT_TYPE_PROMPTS.keys()
        ],
        "visual_styles": visual_styles,
    }


# =============================================================================
# VOICEOVER & CAPTION PIPELINE — Edge-TTS + FFmpeg subtitle burning
# =============================================================================

import asyncio as _asyncio
import subprocess as _subprocess
import re as _re

# Try importing edge-tts
try:
    import edge_tts
    TTS_AVAILABLE = True
    logger.info("edge-tts available — voiceover generation enabled")
except ImportError:
    TTS_AVAILABLE = False
    logger.warning("edge-tts not installed — voiceover generation unavailable")

# Popular Edge TTS voices (free, high quality)
TTS_VOICES = [
    {"id": "en-US-AriaNeural", "name": "Aria", "gender": "Female", "style": "Warm, natural"},
    {"id": "en-US-GuyNeural", "name": "Guy", "gender": "Male", "style": "Friendly, conversational"},
    {"id": "en-US-JennyNeural", "name": "Jenny", "gender": "Female", "style": "Professional, clear"},
    {"id": "en-US-AvaNeural", "name": "Ava", "gender": "Female", "style": "Soft, gentle"},
    {"id": "en-US-AndrewNeural", "name": "Andrew", "gender": "Male", "style": "Deep, authoritative"},
    {"id": "en-US-BrianNeural", "name": "Brian", "gender": "Male", "style": "Calm, measured"},
    {"id": "en-US-EmmaNeural", "name": "Emma", "gender": "Female", "style": "Energetic, upbeat"},
    {"id": "en-US-DavisNeural", "name": "Davis", "gender": "Male", "style": "Confident, bold"},
    {"id": "en-US-MichelleNeural", "name": "Michelle", "gender": "Female", "style": "Caring, warm"},
    {"id": "en-US-RyanNeural", "name": "Ryan", "gender": "Male", "style": "Neutral, versatile"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (UK)", "gender": "Female", "style": "British, refined"},
    {"id": "en-GB-RyanNeural", "name": "Ryan (UK)", "gender": "Male", "style": "British, authoritative"},
    {"id": "en-AU-NatashaNeural", "name": "Natasha (AU)", "gender": "Female", "style": "Australian, friendly"},
    {"id": "en-AU-WilliamNeural", "name": "William (AU)", "gender": "Male", "style": "Australian, deep"},
]

# FFmpeg path (from imageio_ffmpeg)
FFMPEG_BIN = FFMPEG_PATH


async def _edge_tts_generate(text: str, voice: str, output_path: str) -> None:
    """Generate speech audio using edge-tts (free Microsoft Edge voices)."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)


def generate_voiceover_sync(text: str, voice: str, output_path: str) -> None:
    """Synchronous wrapper for edge-tts generation."""
    loop = _asyncio.new_event_loop()
    try:
        loop.run_until_complete(_edge_tts_generate(text, voice, output_path))
    finally:
        loop.close()


def get_audio_duration(audio_path: str) -> float:
    """Get duration of an audio file in seconds using ffprobe."""
    try:
        probe_cmd = [
            FFMPEG_BIN, "-i", audio_path,
            "-f", "null", "-"
        ]
        result = _subprocess.run(
            probe_cmd, capture_output=True, text=True, timeout=10
        )
        # Parse duration from stderr
        for line in result.stderr.split("\n"):
            if "Duration:" in line:
                match = _re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", line)
                if match:
                    h, m, s = float(match.group(1)), float(match.group(2)), float(match.group(3))
                    return h * 3600 + m * 60 + s
    except Exception:
        pass
    return 5.0  # fallback


def split_text_for_captions(text: str, max_words: int = 8) -> List[str]:
    """Split text into caption chunks, each with max_words words."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), max_words):
        chunk = " ".join(words[i:i + max_words])
        if chunk.strip():
            chunks.append(chunk.strip())
    return chunks if chunks else [text]


def generate_timed_captions(
    voiceovers: List[str],
    durations: List[float],
    max_words_per_chunk: int = 8,
) -> List[dict]:
    """
    Generate timed caption entries from voiceover texts and scene durations.
    Each caption has: start_time, end_time, text, scene_index.
    """
    all_captions = []
    current_time = 0.0

    for scene_idx, (voiceover, dur) in enumerate(zip(voiceovers, durations)):
        if not voiceover.strip():
            current_time += dur
            continue

        chunks = split_text_for_captions(voiceover, max_words_per_chunk)
        time_per_chunk = dur / max(len(chunks), 1)

        for chunk_idx, chunk in enumerate(chunks):
            start = current_time + (chunk_idx * time_per_chunk)
            end = start + time_per_chunk
            all_captions.append({
                "start_time": round(start, 3),
                "end_time": round(min(end, current_time + dur), 3),
                "text": chunk,
                "scene_index": scene_idx,
            })

        current_time += dur

    return all_captions


def captions_to_srt(captions: List[dict]) -> str:
    """Convert caption list to SRT format string."""
    srt_lines = []
    for i, cap in enumerate(captions, 1):
        start = _seconds_to_srt_time(cap["start_time"])
        end = _seconds_to_srt_time(cap["end_time"])
        srt_lines.append(f"{i}")
        srt_lines.append(f"{start} --> {end}")
        srt_lines.append(cap["text"])
        srt_lines.append("")
    return "\n".join(srt_lines)


def captions_to_ass(captions: List[dict], style: str = "clean") -> str:
    """Convert caption list to ASS (Advanced SubStation Alpha) format with styled subtitles."""
    # Caption style presets
    styles = {
        "clean": {
            "fontname": "Arial",
            "fontsize": 42,
            "primary_color": "&H00FFFFFF",
            "outline_color": "&H00000000",
            "back_color": "&H80000000",
            "bold": 0,
            "outline": 2,
            "shadow": 1,
            "alignment": 2,
            "margin_v": 50,
        },
        "bold": {
            "fontname": "Impact",
            "fontsize": 52,
            "primary_color": "&H00FFFFFF",
            "outline_color": "&H00000000",
            "back_color": "&H00000000",
            "bold": -1,
            "outline": 4,
            "shadow": 2,
            "alignment": 2,
            "margin_v": 50,
        },
        "highlight": {
            "fontname": "Arial",
            "fontsize": 44,
            "primary_color": "&H0000FFFF",
            "outline_color": "&H00000000",
            "back_color": "&H80000000",
            "bold": -1,
            "outline": 3,
            "shadow": 1,
            "alignment": 2,
            "margin_v": 50,
        },
        "minimal": {
            "fontname": "Arial",
            "fontsize": 36,
            "primary_color": "&H00E0E0E0",
            "outline_color": "&H00000000",
            "back_color": "&H00000000",
            "bold": 0,
            "outline": 1,
            "shadow": 0,
            "alignment": 2,
            "margin_v": 60,
        },
    }
    s = styles.get(style, styles["clean"])

    header = f"""[Script Info]
Title: aeo.creations Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{s['fontname']},{s['fontsize']},{s['primary_color']},&H000000FF,{s['outline_color']},{s['back_color']},{s['bold']},0,0,0,100,100,0,0,1,{s['outline']},{s['shadow']},{s['alignment']},20,20,{s['margin_v']},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    lines = [header]
    for cap in captions:
        start = _seconds_to_ass_time(cap["start_time"])
        end = _seconds_to_ass_time(cap["end_time"])
        # Escape special characters for ASS
        text = cap["text"].replace("\\", "\\\\").replace("{", "\\{" ).replace("}", "\\}")
        lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

    return "\n".join(lines)


def _seconds_to_srt_time(seconds: float) -> str:
    """Convert seconds to SRT time format HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _seconds_to_ass_time(seconds: float) -> str:
    """Convert seconds to ASS time format H:MM:SS.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def burn_captions_ffmpeg(
    video_path: str,
    subtitle_text: str,
    output_path: str,
    is_ass: bool = True,
) -> None:
    """Burn captions into video using FFmpeg subtitles filter."""
    # Write subtitle file
    sub_ext = ".ass" if is_ass else ".srt"
    sub_file = tempfile.NamedTemporaryFile(suffix=sub_ext, delete=False, mode="w", encoding="utf-8")
    sub_file.write(subtitle_text)
    sub_file.close()

    # FFmpeg subtitle filter needs forward slashes on Windows
    sub_path_escaped = sub_file.name.replace("\\", "/").replace(":", "\\:")

    if is_ass:
        filter_str = f"subtitles='{sub_path_escaped}'"
    else:
        filter_str = f"subtitles='{sub_path_escaped}':force_style='FontSize=24,FontName=Arial'"

    cmd = [
        FFMPEG_BIN, "-y",
        "-i", video_path,
        "-vf", filter_str,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        output_path,
    ]

    try:
        result = _subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            logger.error(f"FFmpeg caption burn error: {result.stderr[:500]}")
            raise RuntimeError(f"FFmpeg failed: {result.stderr[:200]}")
    finally:
        try:
            os.unlink(sub_file.name)
        except Exception:
            pass


# ── Request models ────────────────────────────────────────────────────────────

class VoiceoverRequest(BaseModel):
    """Generate TTS voiceover for a list of voiceover texts."""
    voiceovers: List[str]
    voice: str = Field(default="en-US-AriaNeural")


class CaptionStyleRequest(BaseModel):
    """Generate timed captions from voiceovers and durations."""
    voiceovers: List[str]
    durations: List[float]
    style: str = Field(default="clean")
    max_words_per_chunk: int = Field(default=8, ge=3, le=15)


class CaptionEditRequest(BaseModel):
    """Burn edited captions into video."""
    captions: List[dict]  # [{start_time, end_time, text}]
    video_url: str
    style: str = Field(default="clean")
    job_id: str = Field(default="")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/voices")
async def list_voices():
    """List available TTS voices."""
    return {
        "available": TTS_AVAILABLE,
        "voices": TTS_VOICES,
        "message": "Edge TTS voices are free and require no API key" if TTS_AVAILABLE else "Install edge-tts: pip install edge-tts",
    }


@app.post("/api/generate-voiceover")
async def generate_voiceover(request: Request, body: VoiceoverRequest):
    """Generate TTS voiceover audio for each scene's voiceover text."""
    _enforce_credits(request, "voiceover")
    if not TTS_AVAILABLE:
        raise HTTPException(400, "TTS not available. Install: pip install edge-tts")

    voice = body.voice
    # Validate voice exists
    valid_ids = {v["id"] for v in TTS_VOICES}
    if voice not in valid_ids:
        voice = "en-US-AriaNeural"  # fallback

    audio_files = []
    durations = []

    try:
        for i, text in enumerate(body.voiceovers):
            if not text.strip():
                audio_files.append("")
                durations.append(5.0)
                continue

            # Generate audio
            audio_path = OUTPUT_DIR / f"voiceover_{i}_{int(time.time())}.mp3"
            generate_voiceover_sync(text, voice, str(audio_path))

            # Get duration
            dur = get_audio_duration(str(audio_path))

            audio_files.append(f"/api/file/{audio_path.name}")
            durations.append(round(dur, 2))

        record_call("generate-voiceover", "ok")
        return {
            "status": "ok",
            "audio_files": audio_files,
            "durations": durations,
            "total_duration": round(sum(durations), 2),
            "voice": voice,
            "message": f"Generated {len(body.voiceovers)} voiceover clips ({sum(durations):.1f}s total)",
        }
    except Exception as e:
        record_call("generate-voiceover", "error")
        raise HTTPException(500, f"Voiceover generation failed: {str(e)[:200]}")


@app.post("/api/generate-captions")
async def generate_captions(body: CaptionStyleRequest):
    """Generate timed captions from voiceover texts and scene durations."""
    try:
        captions = generate_timed_captions(
            body.voiceovers,
            body.durations,
            body.max_words_per_chunk,
        )

        srt_content = captions_to_srt(captions)
        ass_content = captions_to_ass(captions, body.style)

        record_call("generate-captions", "ok")
        return {
            "status": "ok",
            "captions": captions,
            "srt": srt_content,
            "ass": ass_content,
            "count": len(captions),
            "style": body.style,
            "message": f"Generated {len(captions)} caption entries in {body.style} style",
        }
    except Exception as e:
        record_call("generate-captions", "error")
        raise HTTPException(500, f"Caption generation failed: {str(e)[:200]}")


@app.post("/api/burn-captions")
async def burn_captions_endpoint(body: CaptionEditRequest):
    """Burn edited captions into a video file."""
    try:
        # Resolve video path from URL
        video_filename = body.video_url.split("/api/file/")[-1]
        video_path = OUTPUT_DIR / video_filename
        if not video_path.exists():
            raise HTTPException(404, f"Video file not found: {video_filename}")

        # Convert captions to ASS
        ass_content = captions_to_ass(body.captions, body.style)

        # Output file
        job_id = body.job_id or uuid.uuid4().hex[:12]
        out_filename = f"captioned_{job_id}.mp4"
        out_path = OUTPUT_DIR / out_filename

        # Burn captions with FFmpeg
        burn_captions_ffmpeg(str(video_path), ass_content, str(out_path), is_ass=True)

        record_call("burn-captions", "ok")
        return {
            "status": "ok",
            "video_url": f"/api/file/{out_filename}",
            "filename": out_filename,
            "message": f"Captions burned in {body.style} style",
        }
    except HTTPException:
        raise
    except Exception as e:
        record_call("burn-captions", "error")
        raise HTTPException(500, f"Caption burning failed: {str(e)[:200]}")


@app.get("/api/caption-styles")
async def caption_styles():
    """Return available caption styles."""
    return {
        "styles": [
            {"id": "clean", "label": "Clean", "desc": "White text, black outline, classic look", "icon": "Aa"},
            {"id": "bold", "label": "Bold", "desc": "Large Impact font, heavy outline", "icon": "AB"},
            {"id": "highlight", "label": "Highlight", "desc": "Yellow text, bold, eye-catching", "icon": "⚡"},
            {"id": "minimal", "label": "Minimal", "desc": "Subtle gray, thin outline, understated", "icon": "–"},
        ],
    }


# =============================================================================
# AUTH, PLANS, PROJECTS & USAGE — Monetization architecture
# =============================================================================

import store
import hmac
import hashlib as _hashlib

# Simple token-based auth (JWT-like, HMAC-signed)
AUTH_SECRET = os.getenv("AUTH_SECRET", secrets.token_hex(32))


def _sign_token(payload: dict) -> str:
    """Create a signed token (HMAC-SHA256)."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256"}).encode()).decode().rstrip("=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(AUTH_SECRET.encode(), f"{header}.{body}".encode(), _hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{header}.{body}.{signature}"


def _verify_token(token: str) -> Optional[dict]:
    """Verify and decode a signed token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, body, sig = parts
        expected_sig = hmac.new(AUTH_SECRET.encode(), f"{header}.{body}".encode(), _hashlib.sha256).digest()
        actual_sig = base64.urlsafe_b64decode(sig + "==")
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=="))
        # Check expiry
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def _get_current_user(request) -> Optional[dict]:
    """Extract current user from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    payload = _verify_token(token)
    if not payload:
        return None
    return store.get_user(payload.get("user_id"))


def _require_user(request) -> dict:
    """Require authenticated user or raise 401."""
    user = _get_current_user(request)
    if not user:
        raise HTTPException(401, "Authentication required")
    return user


# ── Server-side credit enforcement ───────────────────────────────────────────
# Every generation endpoint MUST call _enforce_credits() before doing expensive
# work.  This prevents unauthenticated / under-credited calls from bypassing
# the frontend check.

# action_type → (credits_cost, display_name)
CREDIT_COSTS = {
    "image": (1, "image generation"),
    "video": (4, "video generation"),
    "script": (1, "script generation"),
    "voiceover": (2, "voiceover generation"),
    "assemble": (4, "video assembly"),
    "kling-image": (2, "Kling image"),
    "kling-video": (6, "Kling video"),
    "magic-hour": (8, "Magic Hour video"),
    "json2video": (6, "JSON2Video"),
    "rewind": (8, "Rewind AI video"),
    "openrouter": (10, "OpenRouter video"),
    "pixverse": (8, "PixVerse video"),
    "ngrok-video": (6, "Ngrok video"),
}


def _enforce_credits(request, action_type: str) -> Optional[dict]:
    """Check credits and deduct them when user is authenticated.

    Returns the user dict if authenticated, None if anonymous.
    Raises HTTPException(402) if authenticated but insufficient credits.
    Anonymous users are allowed through (demo/free access) but are not tracked.
    """
    user = _get_current_user(request)
    if not user:
        return None  # Anonymous — allow without credit check

    credits_cost, label = CREDIT_COSTS.get(action_type, (1, action_type))
    check = store.check_generation_limit(user["id"], action_type, credits_cost)
    if not check.get("allowed"):
        raise HTTPException(
            402,
            check.get("reason", "Insufficient credits"),
        )

    # Deduct credits
    store.record_usage(user["id"], action_type, "api", "pending", credits_cost)
    # Refresh user object so downstream code sees updated balance
    user = store.get_user(user["id"]) or user
    return user


# ── Auth endpoints ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6)
    display_name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str


def _make_token(user: dict) -> str:
    return _sign_token({
        "user_id": user["id"],
        "email": user["email"],
        "plan": user.get("plan", "free"),
        "exp": int(time.time()) + 86400 * 7,  # 7 days
    })


@app.post("/api/auth/register")
async def auth_register(body: RegisterRequest):
    try:
        user = store.create_user(body.email, body.password, body.display_name)
        token = _make_token(user)
        return {"status": "ok", "user": user, "token": token}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Registration failed: {str(e)[:100]}")


@app.post("/api/auth/login")
async def auth_login(body: LoginRequest):
    user = store.authenticate_user(body.email, body.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")
    token = _make_token(user)
    return {"status": "ok", "user": user, "token": token}


@app.get("/api/auth/me")
async def auth_me(request: Request):
    user = _get_current_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return {"status": "ok", "user": user}


@app.post("/api/auth/logout")
async def auth_logout():
    return {"status": "ok", "message": "Logged out"}


@app.put("/api/auth/profile")
async def auth_update_profile(request: Request, display_name: str = ""):
    user = _require_user(request)
    updates = {}
    if display_name:
        updates["display_name"] = display_name
    updated = store.update_user(user["id"], updates)
    return {"status": "ok", "user": updated}


# ── Plans endpoints ───────────────────────────────────────────────────────────

@app.get("/api/plans")
async def list_plans():
    plans = store.get_plans()
    return {"status": "ok", "plans": plans}


@app.post("/api/plans/upgrade")
async def plan_upgrade(request: Request, plan_id: str = ""):
    """Mock upgrade — sets the plan without charging."""
    user = _require_user(request)
    if plan_id not in store.plan_ids():
        raise HTTPException(400, f"Invalid plan: {plan_id}")
    updated = store.set_user_plan(user["id"], plan_id)
    return {"status": "ok", "user": updated, "message": f"Upgraded to {plan_id} (mock — no charge)"}


@app.post("/api/plans/mock-checkout")
async def plan_mock_checkout(request: Request, plan_id: str = ""):
    """Simulate a successful checkout flow."""
    user = _require_user(request)
    if plan_id not in store.plan_ids():
        raise HTTPException(400, f"Invalid plan: {plan_id}")
    updated = store.set_user_plan(user["id"], plan_id)
    store.update_user(user["id"], {"mock_checkout_completed": True})
    return {
        "status": "ok",
        "user": updated,
        "message": f"Mock checkout complete — you're now on {plan_id}!",
        "checkout_id": secrets.token_hex(8),
    }


# ── Projects endpoints ────────────────────────────────────────────────────────

@app.get("/api/projects")
async def list_projects(request: Request):
    user = _require_user(request)
    projects = store.get_user_projects(user["id"])
    return {"status": "ok", "projects": projects}


@app.post("/api/projects")
async def create_project(request: Request, title: str = "Untitled", topic: str = "", platform: str = ""):
    user = _require_user(request)
    # Check project limit
    plan = store.get_plan(user.get("plan", "free"))
    limit = plan.get("limits", {}).get("projects", 3) if plan else 3
    existing = store.get_user_projects(user["id"])
    if limit > 0 and len(existing) >= limit:
        raise HTTPException(400, f"Project limit reached ({limit}). Upgrade your plan.")
    project = store.create_project(user["id"], title, topic, platform)
    return {"status": "ok", "project": project}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    user = _require_user(request)
    project = store.get_project(project_id)
    if not project or project.get("owner_id") != user["id"]:
        raise HTTPException(404, "Project not found")
    return {"status": "ok", "project": project}


@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, request: Request, title: str = None, status: str = None):
    user = _require_user(request)
    project = store.get_project(project_id)
    if not project or project.get("owner_id") != user["id"]:
        raise HTTPException(404, "Project not found")
    updates = {}
    if title is not None:
        updates["title"] = title
    if status is not None:
        updates["status"] = status
    updated = store.update_project(project_id, updates)
    return {"status": "ok", "project": updated}


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    user = _require_user(request)
    project = store.get_project(project_id)
    if not project or project.get("owner_id") != user["id"]:
        raise HTTPException(404, "Project not found")
    store.delete_project(project_id)
    return {"status": "ok", "message": "Project deleted"}


# ── Usage endpoints ───────────────────────────────────────────────────────────

@app.get("/api/usage")
async def get_usage(request: Request, months: int = 1):
    user = _require_user(request)
    usage = store.get_user_usage(user["id"], months_back=months)
    summary = store.get_user_usage_summary(user["id"])
    return {"status": "ok", "usage": usage, "summary": summary}


@app.get("/api/usage/check")
async def check_usage_limit(request: Request, action: str = "image", amount: int = 1):
    """Check if user can perform an action."""
    user = _require_user(request)
    check = store.check_generation_limit(user["id"], action, amount)
    plan = store.get_plan(user.get("plan", "free"))
    return {
        "status": "ok",
        **check,
        "plan": user.get("plan", "free"),
        "plan_info": plan,
    }


# ── Admin endpoints ───────────────────────────────────────────────────────────

@app.get("/api/admin/users")
async def admin_list_users(request: Request):
    user = _require_user(request)
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin access required")
    return {"status": "ok", "users": store.get_all_users_summary()}


@app.put("/api/admin/plans/{plan_id}")
async def admin_update_plan(plan_id: str, request: Request, updates: dict = {}):
    user = _require_user(request)
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin access required")
    result = store.update_plan_limits(plan_id, updates)
    if not result:
        raise HTTPException(404, f"Plan {plan_id} not found")
    return {"status": "ok", "plan": result}


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting AI Video Generator on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")


# =============================================================================
# AVATAR PROXY — Fixes CORS for Pollinations AI avatar generation
# =============================================================================
class AvatarRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    width: int = Field(default=512, ge=128, le=1024)
    height: int = Field(default=512, ge=128, le=1024)


@app.post("/api/avatar/proxy")
async def avatar_proxy(body: AvatarRequest):
    """Proxy Pollinations AI avatar generation to fix CORS issues."""
    import urllib.parse
    encoded = urllib.parse.quote(body.prompt)
    seed = int(time.time() * 1000) % 100000
    url = f"https://image.pollinations.ai/prompt/{encoded}?width={body.width}&height={body.height}&nologo=true&seed={seed}"

    for attempt in range(3):
        try:
            logger.info(f"Avatar proxy (attempt {attempt+1}/3): {body.prompt[:60]}...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as response:
                img_bytes = response.read()
            if len(img_bytes) < 1000:
                time.sleep(2)
                continue
            b64 = base64.b64encode(img_bytes).decode()
            record_call("avatar-pollinations", "ok")
            return {"image": b64, "provider": "pollinations", "message": "Avatar generated"}
        except Exception as e:
            logger.error(f"Avatar proxy failed (attempt {attempt+1}/3): {str(e)[:100]}")
            time.sleep(3)
    raise HTTPException(502, "Avatar generation failed after retries")


# =============================================================================
# TTS VOICEOVER — Free edge-tts with TikTok-style voices
# =============================================================================
TTS_VOICES = [
    # Thick masculine voices (TikTok-style)
    {"id": "en-US-GuyNeural", "label": "Guy — Deep & Authoritative", "gender": "male", "style": "thick"},
    {"id": "en-US-ChristopherNeural", "label": "Christopher — Rich & Deep", "gender": "male", "style": "thick"},
    {"id": "en-US-EricNeural", "label": "Eric — Bold & Commanding", "gender": "male", "style": "thick"},
    {"id": "en-GB-RyanNeural", "label": "Ryan — British Deep", "gender": "male", "style": "thick"},
    {"id": "en-US-DavisNeural", "label": "Davis — Smooth Deep", "gender": "male", "style": "thick"},
    {"id": "en-AU-WilliamNeural", "label": "William — Australian Deep", "gender": "male", "style": "thick"},
    # Masculine voices
    {"id": "en-US-AndrewNeural", "label": "Andrew — Warm Male", "gender": "male", "style": "warm"},
    {"id": "en-US-BrianNeural", "label": "Brian — Friendly Male", "gender": "male", "style": "friendly"},
    {"id": "en-US-JasonNeural", "label": "Jason — Casual Male", "gender": "male", "style": "casual"},
    # Feminine voices
    {"id": "en-US-JennyNeural", "label": "Jenny — Natural Female", "gender": "female", "style": "natural"},
    {"id": "en-US-AriaNeural", "label": "Aria — Expressive Female", "gender": "female", "style": "expressive"},
    {"id": "en-US-SaraNeural", "label": "Sara — Sweet Female", "gender": "female", "style": "sweet"},
    {"id": "en-GB-SoniaNeural", "label": "Sonia — British Female", "gender": "female", "style": "elegant"},
    # Non-binary / Neutral
    {"id": "en-US-AmberNeural", "label": "Amber — Neutral Warm", "gender": "neutral", "style": "warm"},
    {"id": "en-US-AvaNeural", "label": "Ava — Neutral Soft", "gender": "neutral", "style": "soft"},
]


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = Field(default="en-US-GuyNeural")
    rate: str = Field(default="+0%")
    pitch: str = Field(default="+0Hz")


@app.get("/api/tts/voices")
def list_tts_voices():
    """List available TTS voices."""
    return {"voices": TTS_VOICES}


@app.post("/api/tts/voiceover")
async def generate_voiceover(body: TTSRequest):
    """Generate voiceover audio using free edge-tts (no API key)."""
    if not TTS_AVAILABLE:
        raise HTTPException(500, "edge-tts not installed. Run: pip install edge-tts")

    # Validate voice
    valid_ids = [v["id"] for v in TTS_VOICES]
    if body.voice not in valid_ids:
        # Try to find a close match
        body.voice = "en-US-GuyNeural"

    output_name = f"tts_{uuid.uuid4().hex[:8]}.mp3"
    output_path = OUTPUT_DIR / output_name

    try:
        logger.info(f"Generating TTS: voice={body.voice}, text={body.text[:60]}...")
        await _edge_tts_generate(body.text, body.voice, str(output_path))
        file_size = os.path.getsize(str(output_path))
        record_call("tts-edge", "ok")
        return {
            "status": "ok",
            "audio_url": f"/api/file/{output_name}",
            "voice": body.voice,
            "file_size": file_size,
            "message": f"Voiceover generated ({file_size} bytes)",
        }
    except Exception as e:
        record_call("tts-edge", "error")
        raise HTTPException(500, f"TTS generation failed: {str(e)[:200]}")


@app.get("/api/avatar/dicebear")
async def dicebear_avatar(style: str = "avataaars", seed: str = "aeo-user"):
    """Proxy DiceBear avatar generation."""
    valid_styles = [
        "avataaars", "adventurer", "big-ears", "bottts", "fun-emoji",
        "lorelei", "micah", "notionists", "open-peeps", "personas",
        "pixel-art", "rings", "shapes", "thumbs",
    ]
    if style not in valid_styles:
        style = "avataaars"
    url = f"https://api.dicebear.com/9.x/{style}/svg?seed={seed}"
    try:
        resp = http_requests.get(url, timeout=10)
        resp.raise_for_status()
        svg_text = resp.text
        record_call("avatar-dicebear", "ok")
        return {"svg": svg_text, "style": style, "seed": seed}
    except Exception as e:
        record_call("avatar-dicebear", "error")
        raise HTTPException(502, f"DiceBear failed: {str(e)[:100]}")


# =============================================================================
# VIDEO SPLIT — Split a video clip at a specific timestamp
# =============================================================================
class SplitVideoRequest(BaseModel):
    file_path: str
    split_time: float = Field(..., ge=0)
    end_time: Optional[float] = Field(default=None)


@app.post("/api/split-video")
async def split_video(body: SplitVideoRequest):
    """Split a video into two clips at a given timestamp. Returns both clips."""
    import subprocess
    if not os.path.exists(body.file_path):
        raise HTTPException(404, f"File not found: {body.file_path}")

    try:
        base_name = Path(body.file_path).stem
        ext = Path(body.file_path).suffix or ".mp4"
        clip1_name = f"split_{base_name}_part1_{uuid.uuid4().hex[:6]}{ext}"
        clip2_name = f"split_{base_name}_part2_{uuid.uuid4().hex[:6]}{ext}"
        clip1_path = str(OUTPUT_DIR / clip1_name)
        clip2_path = str(OUTPUT_DIR / clip2_name)

        # Split part 1: 0 to split_time
        cmd1 = [
            FFMPEG_PATH, "-y", "-i", body.file_path,
            "-t", str(body.split_time), "-c", "copy", clip1_path
        ]
        subprocess.run(cmd1, capture_output=True, timeout=30)

        # Split part 2: split_time to end (or custom end_time)
        cmd2 = [FFMPEG_PATH, "-y", "-i", body.file_path]
        cmd2 += ["-ss", str(body.split_time)]
        if body.end_time is not None:
            cmd2 += ["-t", str(body.end_time - body.split_time)]
        cmd2 += ["-c", "copy", clip2_path]
        subprocess.run(cmd2, capture_output=True, timeout=30)

        record_call("split-video", "ok")
        return {
            "status": "ok",
            "clip1": f"/api/file/{clip1_name}",
            "clip2": f"/api/file/{clip2_name}",
            "message": f"Split at {body.split_time}s into two clips",
        }
    except Exception as e:
        record_call("split-video", "error")
        raise HTTPException(500, f"Split failed: {str(e)[:200]}")


# =============================================================================
# VIDEO CLIP INFO — Get duration and metadata of a video
# =============================================================================
@app.get("/api/video-info")
async def video_info(path: str):
    """Get video duration and basic metadata."""
    import subprocess
    if not os.path.exists(path):
        raise HTTPException(404, f"File not found: {path}")
    try:
        cmd = [FFMPEG_PATH, "-i", path, "-f", "null", "-"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        # Parse duration from stderr
        duration = 0.0
        for line in result.stderr.split("\n"):
            if "Duration:" in line:
                dur_str = line.split("Duration:")[1].split(",")[0].strip()
                parts = dur_str.split(":")
                if len(parts) == 3:
                    duration = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                break
        return {"duration": duration, "path": path}
    except Exception as e:
        return {"duration": 0, "path": path, "error": str(e)}
