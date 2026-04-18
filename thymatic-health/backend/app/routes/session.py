"""
Session routes — Wave 1B.

POST /session/start       — create a new session, return session_id
WS   /session/{id}/audio  — stream PCM + transcripts; receive policy_result events
"""

from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.sentinel import SentinelService
from app.services.bridge import run_bridge

router = APIRouter()

# Module-level session registry.
# sessions[session_id] = {
#     "sentinel": SentinelService | None,
#     "bridge_task": asyncio.Task | None,
# }
sessions: dict[str, dict] = {}

POLICIES = ["wellbeing-default"]


# ---------------------------------------------------------------------------
# POST /session/start
# ---------------------------------------------------------------------------

@router.post("/session/start")
async def start_session(body: dict | None = None) -> dict:
    """
    Create a new session.

    Optionally accepts ``{"user_label": "..."}`` in the JSON body.
    Returns ``{"session_id": str, "policies": list[str]}``.
    """
    user_label: str = (body or {}).get("user_label") or str(uuid.uuid4())
    session_id: str = str(uuid.uuid4())

    sessions[session_id] = {
        "sentinel": SentinelService(user_label=user_label, policies=POLICIES),
        "bridge_task": None,
    }

    return {"session_id": session_id, "policies": POLICIES}


# ---------------------------------------------------------------------------
# WS /session/{session_id}/audio
# ---------------------------------------------------------------------------

@router.websocket("/session/{session_id}/audio")
async def session_audio_ws(websocket: WebSocket, session_id: str) -> None:
    """
    WebSocket endpoint for a session's audio stream.

    Frame types accepted from client:
      - Binary frame  → raw PCM16 bytes → forwarded to Sentinel
      - Text frame    → JSON ``{"type": "transcript", "text": "..."}``
                        → forwarded to Sentinel as user transcript

    Frames sent to client:
      - ``{"type": "status", "status": "connected"}`` on open
      - ``{"type": "policy_result", "result": {...}}`` for each Sentinel result
    """
    await websocket.accept()

    session = sessions.get(session_id)
    if session is None:
        await websocket.send_json({"type": "error", "message": "session not found"})
        await websocket.close(code=4004)
        return

    sentinel: SentinelService = session["sentinel"]

    # Connect to Thymia Lyra server
    await sentinel.connect()
    await websocket.send_json({"type": "status", "status": "connected"})

    # Start bridge task — relays Sentinel results back to the WS client
    bridge_task: asyncio.Task = asyncio.create_task(
        run_bridge(sentinel, websocket)
    )
    session["bridge_task"] = bridge_task

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"] is not None:
                # Binary frame → PCM audio
                await sentinel.send_audio(message["bytes"])

            elif "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                if payload.get("type") == "transcript":
                    text = payload.get("text", "")
                    if text:
                        await sentinel.send_transcript(text)

    except WebSocketDisconnect:
        pass
    finally:
        bridge_task.cancel()
        try:
            await bridge_task
        except asyncio.CancelledError:
            pass
        await sentinel.close()
        session["sentinel"] = None
        session["bridge_task"] = None
