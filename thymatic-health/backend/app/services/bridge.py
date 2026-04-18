"""
Bridge: per-session orchestration of Sentinel + Gemini Live.

Wave 2A: fans mic audio to both Sentinel and Gemini Live; routes Sentinel
policy results back to the client as "policy_result" frames and injects
wellbeing context hints into Gemini as bracketed user-turn messages.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import TYPE_CHECKING

from app.services.gemini_live import run_gemini_session

if TYPE_CHECKING:
    from fastapi import WebSocket
    from app.services.sentinel import SentinelService

logger = logging.getLogger(__name__)


async def run_bridge(
    sentinel_service: "SentinelService",
    websocket: "WebSocket",
) -> None:
    """
    Orchestrate a single session:

    Incoming from WebSocket client
    --------------------------------
    - Binary frame  → raw PCM16 bytes
        → forwarded to Sentinel via sentinel_service.send_audio
        → forwarded to Gemini via pcm_queue
    - Text frame    → JSON {"type": "transcript", "text": "...", "turn_complete": bool?}
        → forwarded to Sentinel via sentinel_service.send_transcript
        → forwarded to Gemini transcript_queue (available for future use)
        → when turn_complete=true, also signals Gemini that the user turn is complete
    - Text frame    → JSON {"type": "turn_complete", "text": "..."}
        → forwards the buffered transcript to Sentinel (when provided)
        → signals Gemini that the user turn is complete

    Outgoing to WebSocket client
    --------------------------------
    - {"type": "policy_result", "result": {...}}   — from Sentinel
    - {"type": "coach_audio",   "data": "<b64>"}   — from Gemini Live (PCM audio)
    - {"type": "coach_caption", "text": "..."}     — from Gemini Live (text)
    - {"type": "error",         "message": "..."}  — on unhandled exception
    """
    pcm_queue: asyncio.Queue[bytes] = asyncio.Queue()
    transcript_queue: asyncio.Queue[str] = asyncio.Queue()
    system_context_queue: asyncio.Queue[str] = asyncio.Queue()
    turn_boundary_queue: asyncio.Queue[bool | None] = asyncio.Queue()

    async def coach_audio_callback(audio_bytes: bytes) -> None:
        await websocket.send_json(
            {
                "type": "coach_audio",
                "data": base64.b64encode(audio_bytes).decode(),
            }
        )

    async def coach_text_callback(text: str) -> None:
        await websocket.send_json({"type": "coach_caption", "text": text})

    async def sentinel_listener() -> None:
        async for result in sentinel_service.iter_results():
            try:
                await websocket.send_json({"type": "policy_result", "result": result})
            except Exception as exc:
                logger.warning("Failed to send policy_result to client: %s", exc)

            inner = result.get("result", {})
            actions = inner.get("recommended_actions", {})
            urgency = actions.get("urgency", "")
            tone_hint = actions.get("for_agent", "")

            if tone_hint or urgency:
                parts: list[str] = []
                if tone_hint:
                    parts.append(tone_hint)
                if urgency:
                    parts.append(f"Urgency: {urgency}.")
                context = "[CONTEXT: Wellbeing signal detected. " + " ".join(parts) + " Adjust tone accordingly.]"
                await system_context_queue.put(context)

    async def ws_reader() -> None:
        try:
            while True:
                msg = await websocket.receive()

                if "bytes" in msg and msg["bytes"] is not None:
                    pcm: bytes = msg["bytes"]
                    await pcm_queue.put(pcm)
                    await sentinel_service.send_audio(pcm)
                    continue

                if "text" not in msg or msg["text"] is None:
                    continue

                try:
                    data = json.loads(msg["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = data.get("type")
                if msg_type == "transcript":
                    text: str = (data.get("text") or "").strip()
                    if text:
                        await transcript_queue.put(text)
                        await sentinel_service.send_transcript(text)
                    if data.get("turn_complete"):
                        await turn_boundary_queue.put(True)
                elif msg_type == "turn_complete":
                    text: str = (data.get("text") or "").strip()
                    if text:
                        await transcript_queue.put(text)
                        await sentinel_service.send_transcript(text)
                    await turn_boundary_queue.put(True)

        except Exception as exc:
            logger.debug("ws_reader exited: %s", exc)

    ws_reader_task = asyncio.create_task(ws_reader())
    sentinel_listener_task = asyncio.create_task(sentinel_listener())
    gemini_task = asyncio.create_task(
        run_gemini_session(
            pcm_queue,
            transcript_queue,
            coach_audio_callback,
            coach_text_callback,
            system_context_queue,
            turn_boundary_queue,
        )
    )

    try:
        done, pending = await asyncio.wait(
            [ws_reader_task, sentinel_listener_task, gemini_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            exc = task.exception()
            if exc:
                raise exc
    except Exception as exc:
        logger.error("Bridge error: %s", exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        for task in [ws_reader_task, sentinel_listener_task, gemini_task]:
            task.cancel()
        await asyncio.gather(ws_reader_task, sentinel_listener_task, gemini_task, return_exceptions=True)
