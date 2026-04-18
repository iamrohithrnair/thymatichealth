"""
Gemini Live service — Wave 2A.

Opens a google-genai Live session and:
  1. Forwards mic PCM from pcm_queue to Gemini via send_realtime_input.
  2. Listens for Sentinel policy context on system_context_queue and injects
     it as a user-turn message (send_client_content) since the Live API does
     not support live system-instruction updates mid-session.
  3. Streams Gemini audio (response.data) and caption text (response.text)
     back to the client via the provided callbacks.
"""

import asyncio
import logging
import os

import google.genai as genai
from google.genai import types

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model ID — stable GA Live model for Google AI (non-Vertex).
# The SDK docstrings reference "gemini-live-2.5-flash-preview" for preview;
# "gemini-2.0-flash-live-001" is the stable GA alias used here.
# ---------------------------------------------------------------------------
LIVE_MODEL = "gemini-2.0-flash-live-001"

# PCM mime type for 16 kHz mono 16-bit little-endian audio from the mic.
PCM_MIME_TYPE = "audio/pcm;rate=16000"

BASE_SYSTEM_PROMPT = """You are Thymatic Health, a warm and grounding AI wellbeing coach.
Your role is to support the user's mental and physical wellbeing through gentle, evidence-based coaching.
Keep responses concise, warm, and actionable. Speak naturally as if in conversation."""


async def run_gemini_session(
    pcm_queue: asyncio.Queue,            # incoming PCM bytes from mic
    transcript_queue: asyncio.Queue,     # incoming final transcript strings (unused by Gemini realtime input but available)
    coach_audio_callback,                # async callable(bytes) — sends audio back to client
    coach_text_callback,                 # async callable(str)  — sends caption back to client
    system_context_queue: asyncio.Queue, # Sentinel policy updates → injected as user-turn context
    turn_boundary_queue: asyncio.Queue,  # explicit user turn completion signals
) -> None:
    """
    Run a Gemini Live session.

    Connects to the Gemini Live API and concurrently:
      - Forwards PCM audio chunks from pcm_queue to Gemini.
      - Injects Sentinel context updates (from system_context_queue) as
        bracketed user-turn messages so the model adjusts tone accordingly.
      - Receives audio/text responses from Gemini and dispatches them via
        coach_audio_callback / coach_text_callback.

    Note on live system-instruction updates:
      The google-genai Live SDK (v1.x) does NOT expose an API for updating
      the system instruction after the session is established.  The only
      supported approach is to send a `client_content` message with role
      "user" containing the contextual hint.  This is the pattern used here
      via `session.send_client_content`.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise EnvironmentError("GOOGLE_API_KEY is not set in the environment.")

    client = genai.Client(api_key=api_key)

    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=BASE_SYSTEM_PROMPT,
    )

    async with client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
        logger.info("Gemini Live session established.")

        async def _send_pcm() -> None:
            """Drain pcm_queue and forward each chunk to Gemini as realtime audio."""
            while True:
                try:
                    pcm_bytes: bytes = await pcm_queue.get()
                except asyncio.CancelledError:
                    return
                if pcm_bytes is None:
                    # Sentinel value — caller signals end of stream.
                    return
                try:
                    await session.send_realtime_input(
                        audio=types.Blob(data=pcm_bytes, mime_type=PCM_MIME_TYPE)
                    )
                except Exception as exc:
                    logger.warning("send_realtime_input error: %s", exc)

        async def _send_context() -> None:
            """
            Drain system_context_queue and inject each update as a user-turn
            message.  This is the recommended workaround for the lack of live
            system-instruction updates in the current SDK.
            """
            while True:
                try:
                    context_str: str = await system_context_queue.get()
                except asyncio.CancelledError:
                    return
                if context_str is None:
                    return
                try:
                    await session.send_client_content(
                        turns=types.Content(
                            role="user",
                            parts=[types.Part(text=context_str)],
                        ),
                        turn_complete=True,
                    )
                    logger.debug("Injected Sentinel context: %s", context_str)
                except Exception as exc:
                    logger.warning("send_client_content (context) error: %s", exc)

        async def _send_turn_boundaries() -> None:
            """Convert manual send actions into explicit Gemini activity-end signals."""
            while True:
                try:
                    turn_boundary = await turn_boundary_queue.get()
                except asyncio.CancelledError:
                    return
                if turn_boundary is None:
                    return
                try:
                    await session.send_realtime_input(activity_end={})
                    logger.debug("Sent explicit Gemini activity_end for manual turn completion.")
                except Exception as exc:
                    logger.warning("send_realtime_input (activity_end) error: %s", exc)

        async def _receive() -> None:
            """
            Receive Gemini responses and route audio bytes / text captions
            back to the client via the provided callbacks.

            session.receive() is an async generator that yields
            LiveServerMessage objects.  Each message exposes:
              - .data  → Optional[bytes]  (concatenated audio inline data)
              - .text  → Optional[str]    (concatenated text parts)
            """
            try:
                async for response in session.receive():
                    if response.data:
                        try:
                            await coach_audio_callback(response.data)
                        except Exception as exc:
                            logger.warning("coach_audio_callback error: %s", exc)
                    if response.text:
                        try:
                            await coach_text_callback(response.text)
                        except Exception as exc:
                            logger.warning("coach_text_callback error: %s", exc)
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.error("Gemini receive loop error: %s", exc)

        # Run all loops concurrently; cancel the others when any one
        # finishes (e.g. on WS disconnect the queues stop producing).
        send_pcm_task = asyncio.create_task(_send_pcm())
        send_ctx_task = asyncio.create_task(_send_context())
        send_turn_task = asyncio.create_task(_send_turn_boundaries())
        receive_task = asyncio.create_task(_receive())

        try:
            done, pending = await asyncio.wait(
                [send_pcm_task, send_ctx_task, send_turn_task, receive_task],
                return_when=asyncio.FIRST_EXCEPTION,
            )
            # Surface any exception from a completed task.
            for task in done:
                exc = task.exception()
                if exc:
                    raise exc
        except asyncio.CancelledError:
            pass
        finally:
            for task in [send_pcm_task, send_ctx_task, send_turn_task, receive_task]:
                task.cancel()
            await asyncio.gather(
                send_pcm_task,
                send_ctx_task,
                send_turn_task,
                receive_task,
                return_exceptions=True,
            )
            logger.info("Gemini Live session closed.")
