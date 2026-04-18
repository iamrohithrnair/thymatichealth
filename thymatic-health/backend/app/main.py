from dotenv import load_dotenv
import os
from pathlib import Path

# Load .env from common locations (first wins for each key when override=False).
_here = Path(__file__).resolve()
for env_path in (
    _here.parents[3] / ".env",  # repo / voiceaihack root
    _here.parents[2] / ".env",  # thymatic-health/
    _here.parents[1] / ".env",  # thymatic-health/backend/
):
    load_dotenv(env_path, override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Thymatic Health API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routes import session as session_router  # noqa: E402
app.include_router(session_router.router)

from app.routes import visual as visual_router  # noqa: E402
app.include_router(visual_router.router)

from app.routes import score as score_router, video as video_router  # noqa: E402
app.include_router(score_router.router)
app.include_router(video_router.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
