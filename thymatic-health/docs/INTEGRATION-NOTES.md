# Integration Notes

Live record of actual API shapes, auth mechanisms, and SDK quirks discovered during implementation.

---

## Speechmatics

- **JWT mint:** `POST https://mp.speechmatics.com/v1/api_keys?type=rt` with `Authorization: Bearer $SPEECHMATICS_API_KEY` and body `{"ttl":60}`. Response field is `key_value` (not `token` or `jwt`).
- **WebSocket URL:** `wss://eu.rt.speechmatics.com/v2` (EU region). Pass JWT as first arg to `client.start(jwt, config)`, not inside the config object.
- **SDK version:** `@speechmatics/real-time-client` v8.3.1.
- **Event shape (v8):** `addEventListener('receiveMessage', e => ...)` on the client. `e.data.message` discriminates — `'AddPartialTranscript'` and `'AddTranscript'` both carry transcript in `e.data.metadata.transcript`.
- **Audio format:** `sendAudio(pcm.buffer)` — pass the `ArrayBuffer` of a `Int16Array`.

---

## Thymia Sentinel

- **Auth:** `SentinelClient` reads `THYMIA_API_KEY` from env automatically. Also accepts `api_key=` constructor kwarg. Raises `ValueError` at construction if neither present. Key is sent inside the WebSocket config frame on `connect()`.
- **SDK version:** `thymia-sentinel` 1.1.0.
- **Policy slug used:** `"wellbeing-default"` (verify available policy names against your Thymia account).
- **Result shape (POLICY_RESULT frame):**
  ```json
  {
    "type": "POLICY_RESULT",
    "policy": "<slug>",
    "policy_name": "<display name>",
    "triggered_at_turn": 1,
    "timestamp": "<iso>",
    "result": {
      "type": "safety_analysis",
      "classification": { "level": "...", "alert": false, "confidence": "high|medium|low" },
      "concerns": [],
      "recommended_actions": {
        "for_agent": "<instruction string>",
        "urgency": "low|medium|high|urgent"
      }
    }
  }
  ```
- **Extra SDK methods (available, not used in v1):** `send_agent_audio(bytes)`, `send_agent_transcript(str)`, `on_progress` decorator.

---

## Gemini Live

- **Model ID:** `"gemini-2.0-flash-live-001"` (GA stable).
- **Connection:** `async with client.aio.live.connect(model=..., config=LiveConnectConfig(...)) as session`.
- **Send audio:** `session.send_realtime_input(audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000"))` — `send()` is deprecated since Q3 2025.
- **PCM mime type:** `"audio/pcm;rate=16000"` (16kHz mono Int16 LE).
- **Receive:** `async for msg in session.receive()` yields `LiveServerMessage`; `.data` = audio bytes, `.text` = text. Generator breaks on `turn_complete`.
- **System instruction updates:** Not supported mid-session. Workaround: inject `[CONTEXT: ...]` as a user-role turn via `session.send_client_content(turns=Content(role="user", parts=[Part(text="...")]), turn_complete=True)`.

---

## fal.ai

- **Auth:** `FAL_KEY` env var (format: `<key_id>:<key_secret>`).
- **Async function:** `fal_client.run_async(model_id, arguments={...})` returns response dict directly.
- **Image model:** `fal-ai/flux/schnell`. Response: `{"images": [{"url": "https://...", "width": int, "height": int, "content_type": "image/jpeg"}]}`. Extract: `result["images"][0]["url"]`.
- **Video model:** `fal-ai/wan/v2.2/text-to-video`. Response: `{"video": {"url": "https://..."}}`. Jobs take 60–300s; pass `timeout=300.0`.
- **URL parsing fix:** operator precedence bug in `item.get("url") or item if isinstance(item, str) else str(item)` — fixed to explicit `item.get("url") if isinstance(item, dict) else item`.

---

## MediaPipe

- **Version:** `mediapipe` 0.10.33.
- **API:** Tasks API only (`mediapipe.tasks.python.vision.PoseLandmarker`). Legacy `mp.solutions.pose` is not present.
- **Model:** `pose_landmarker_lite.task` — downloaded from MediaPipe CDN on first call, cached at `backend/models/pose_landmarker_lite.task`.
- **Angle computation:** 3D law-of-cosines at joint's middle landmark using triplet `(A, B, C)`. Runs in VIDEO mode.
