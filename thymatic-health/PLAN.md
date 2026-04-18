# Thymatic Health — Plan

## Wave 0 — Scaffold
- [x] **W0.1** Root tree, PLAN.md, README, .env.example, docs
- [x] **W0.2** Next.js 14 frontend scaffold + stubs
- [x] **W0.3** FastAPI backend scaffold + stubs
- [x] **W0.4** .env wiring documented

## Wave 1 — Parallel (dispatch all 4 agents in one message after W0)

### 1A — Speechmatics STT (frontend)
- [x] **W1.A.1** speechmatics-token API route (server JWT mint)
- [x] **W1.A.2** lib/audio.ts — AudioWorklet 16kHz PCM16 + RMS
- [x] **W1.A.3** lib/speechmatics.ts — RealtimeClient, emit to store
- [x] **W1.A.4** TranscriptStream.tsx component

### 1B — Sentinel bridge (backend + frontend)
- [x] **W1.B.1** services/sentinel.py — SentinelClient async wrapper
- [x] **W1.B.2** routes/session.py — POST /session/start + WS /session/{id}/audio
- [x] **W1.B.3** services/bridge.py skeleton — Sentinel fan-out, Gemini placeholder
- [x] **W1.B.4** lib/sentinelSocket.ts — backend WS client, PCM tee, policy_result events
- [x] **W1.B.5** SentinelBadges.tsx component

### 1C — Scoring + MediaPipe pose (backend + frontend)
- [x] **W1.C.1** services/scoring.py — pure-function angle scoring
- [x] **W1.C.2** routes/score.py — POST /score
- [x] **W1.C.3** services/pose.py — MediaPipe BlazePose pipeline
- [x] **W1.C.4** routes/video.py — POST /video/analyse (multipart)
- [x] **W1.C.5** app/upload/page.tsx + ScoreCard.tsx

### 1D — fal.ai visuals (backend + frontend)
- [x] **W1.D.1** services/fal.py — generate_image + generate_video
- [x] **W1.D.2** routes/visual.py — POST /coach/visual
- [x] **W1.D.3** lib/visual.ts — typed fetch helper

## Wave 2 — Parallel (dispatch after Wave 1)

### 2A — Gemini Live (backend; depends on 1B bridge skeleton)
- [x] **W2.A.1** services/gemini_live.py — google-genai Live session
- [x] **W2.A.2** services/bridge.py — fill Sentinel→Gemini hook, stream coach_audio

### 2B — UI (frontend; depends on 1A + 1B; invoke ui-ux-pro-max skill)
- [x] **W2.B.1** app/page.tsx — landing, neumorphic blocks
- [x] **W2.B.2** MicOrb.tsx — neumorphic pulsing orb
- [x] **W2.B.3** CoachReply.tsx — audio player + captions + visual card
- [x] **W2.B.4** Restyle TranscriptStream, SentinelBadges, ScoreCard
- [x] **W2.B.5** app/session/page.tsx — block grid layout
- [x] **W2.B.6** app/upload/page.tsx — restyle to block system

## Wave 3 — Tuner (DO NOT run unless user explicitly asks)

## Wave 4 — Verification
- [x] **W4.1** backend /health ok — `{"status":"ok"}` ✓
- [x] **W4.2** frontend builds clean — Next.js 16.2.4 Turbopack, 0 TS errors ✓
- [ ] **W4.3** /session full voice round-trip — requires browser (mic access)
- [ ] **W4.4** /upload pose + score — requires video file; MediaPipe model downloads on first call
- [x] **W4.5** fal.ai visual renders — returns `https://v3b.fal.media/...` ✓ (fixed URL parsing bug)
- [x] **W4.6** INTEGRATION-NOTES.md filled ✓

## Confirmed settings
- Gemini: GOOGLE_API_KEY
- fal.ai: FAL_KEY
- Speechmatics region: eu.rt.speechmatics.com
- Sentinel policy: ["wellbeing-default"]
- Wave 3 (Tuner): skipped unless user asks
