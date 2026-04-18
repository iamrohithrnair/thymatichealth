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
    - Text frame    → JSON {"type": "transcript", "text": "..."}
        → forwarded to Sentinel via sentinel_service.send_transcript
        → forwarded to Gemini transcript_queue (available for future use)

    Outgoing to WebSocket client
    --------------------------------
    - {"type": "policy_result", "result": {...}}   — from Sentinel
    - {"type": "coach_audio",   "data": "<b64>"}   — from Gemini Live (PCM audio)
    - {"type": "coach_caption", "text": "..."}      — from Gemini Live (text)
    - {"type": "error",         "message": "..."}   — on unhandled exception
    """
    pcm_queue: asyncio.Queue[bytes] = asyncio.Queue()
    transcript_queue: asyncio.Queue[str] = asyncio.Queue()
    system_context_queue: asyncio.Queue[str] = asyncio.Queue()

    # ------------------------------------------------------------------
    # Gemini callbacks
    # ------------------------------------------------------------------

    async def coach_audio_callback(audio_bytes: bytes) -> None:
        await websocket.send_json(
            {
                "type": "coach_audio",
                "data": base64.b64encode(audio_bytes).decode(),
            }
        )

    async def coach_text_callback(text: str) -> None:
        await websocket.send_json({"type": "coach_caption", "text": text})

    # ------------------------------------------------------------------
    # Sentinel listener: relay results to client + inject context to Gemini
    # ------------------------------------------------------------------

    async def sentinel_listener() -> None:
        async for result in sentinel_service.iter_results():
            # Forward raw Sentinel result to the frontend.
            try:
                await websocket.send_json({"type": "policy_result", "result": result})
            except Exception as exc:
                logger.warning("Failed to send policy_result to client: %s", exc)

            # Build a concise context hint from the result's recommended actions.
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

    # ------------------------------------------------------------------
    # WebSocket reader: fan incoming frames to Sentinel + Gemini queues
    # ------------------------------------------------------------------

    async def ws_reader() -> None:
        try:
            while True:
                msg = await websocket.receive()

                if "bytes" in msg and msg["bytes"] is not None:
                    pcm: bytes = msg["bytes"]
                    await pcm_queue.put(pcm)
                    await sentinel_service.send_audio(pcm)

                elif "text" in msg and msg["text"] is not None:
                    try:
                        data = json.loads(msg["text"])
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") == "transcript":
                        text: str = data.get("text", "")
                        if text:
                            await transcript_queue.put(text)
                            await sentinel_service.send_transcript(text)

        except Exception as exc:
            # WebSocketDisconnect or any other disconnect signals end of stream.
            logger.debug("ws_reader exited: %s", exc)

    # ------------------------------------------------------------------
    # Run all coroutines concurrently; surface errors back to client.
    # ------------------------------------------------------------------

    try:
        await asyncio.gather(
            ws_reader(),
            sentinel_listener(),
            run_gemini_session(
                pcm_queue,
                transcript_queue,
                coach_audio_callback,
                coach_text_callback,
                system_context_queue,
            ),
        )
    except Exception as exc:
        logger.error("Bridge error: %s", exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
