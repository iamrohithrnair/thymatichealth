"""
SentinelService — async wrapper around thymia_sentinel.SentinelClient.

Wraps the SDK so the rest of the application can:
  - create one service per session
  - push PCM audio and transcripts in
  - pull policy-result dicts out via an async generator (iter_results)
"""

import asyncio
from typing import AsyncGenerator

from thymia_sentinel import SentinelClient


class SentinelService:
    """
    Per-session async wrapper for the Thymia Sentinel SDK.

    Auth: SentinelClient reads THYMIA_API_KEY from the environment
    automatically (or accepts api_key= as a constructor kwarg).
    The .env file is loaded by app/main.py before this module is imported.
    """

    def __init__(self, user_label: str, policies: list[str]) -> None:
        self.user_label = user_label
        self.policies = policies
        self._client: SentinelClient | None = None
        self._queue: asyncio.Queue[dict] = asyncio.Queue()

    async def connect(self) -> None:
        """Create and connect the underlying SentinelClient."""
        self._client = SentinelClient(
            user_label=self.user_label,
            policies=self.policies,
        )

        @self._client.on_policy_result
        async def _handle_result(result: dict) -> None:
            await self._queue.put(result)

        await self._client.connect()

    async def send_audio(self, pcm: bytes) -> None:
        """Forward raw PCM16 bytes to Sentinel as user audio."""
        if self._client is not None:
            await self._client.send_user_audio(pcm)

    async def send_transcript(self, text: str) -> None:
        """Forward a user transcript string to Sentinel."""
        if self._client is not None:
            await self._client.send_user_transcript(text)

    async def iter_results(self) -> AsyncGenerator[dict, None]:
        """
        Async generator that yields policy-result dicts as they arrive.

        Yields indefinitely until the caller stops iterating (e.g. on WS
        disconnect).  Each yielded value is the raw dict received from the
        Lyra server with shape::

            {
                "type": "POLICY_RESULT",
                "policy": str,
                "policy_name": str,
                "triggered_at_turn": int,
                "timestamp": float,
                "result": dict,
            }
        """
        while True:
            result = await self._queue.get()
            yield result

    async def close(self) -> None:
        """Disconnect from the Lyra server cleanly."""
        if self._client is not None:
            await self._client.close()
            self._client = None
