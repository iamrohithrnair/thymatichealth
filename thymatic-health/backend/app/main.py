from dotenv import load_dotenv
import os
from pathlib import Path

# Load from workspace root .env
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Thymatic Health API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
