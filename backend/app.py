"""Production ASGI entrypoint.

Keeps backend.main stable while attaching the free voiceover/avatar routes and
serving generated media from the existing output directory.
"""
from fastapi.staticfiles import StaticFiles

from backend.main import app, OUTPUT_DIR
from backend.avatar_api import router as avatar_router

app.include_router(avatar_router)
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")
