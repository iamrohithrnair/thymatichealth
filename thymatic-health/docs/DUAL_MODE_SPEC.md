# Dual-Mode Behavioral Specification: Live Session Feature

**Version:** 1.0  
**Status:** Design Complete  
**Author:** Product Engineering

---

## Executive Summary

This specification defines the exact dual-mode behavior for Thymatic Health's live session feature. The system supports two modes:

1. **Manual Mode** (default): User explicitly controls turn boundaries via "Send Captured Turn" button
2. **Live Mode**: Automatic turn boundary detection creates a conversational flow

The design principle is **frontend-only mode management** — the backend receives identical `turn_complete` events regardless of mode.

---

## A. Mode Definition

### State Variable

```typescript
sessionMode: 'manual' | 'live'
```

**Location:** Zustand store (`useStore`) and mirrored to `sessionModeRef` for use in callbacks.

### Default Mode

**Default:** `'manual'`

**Rationale:**
- Manual mode is the safer default for therapeutic contexts — users retain full control over what is sent to the coach
- Users new to the system can learn the flow before enabling automatic behavior
- Matches current production behavior (zero regression)

### Mode Switching Rules

| Condition | Can Switch? | Behavior |
|-----------|-------------|----------|
| `sessionState === 'idle'` | ✅ Yes | Free to change |
| `sessionState === 'connecting'` | ✅ Yes | Free to change |
| `sessionState === 'active'` AND `listeningState === 'stopped'` | ✅ Yes | Allowed with transition handling (see Section D) |
| `sessionState === 'active'` AND `listeningState === 'paused'` | ✅ Yes | Allowed with transition handling (see Section D) |
| `sessionState === 'active'` AND `listeningState === 'listening'` | ❌ No | Button disabled — user must pause/stop first |

**UI Enforcement:** The mode toggle buttons are disabled when `listeningState === 'listening'`.

---

## B. Live Mode Behavior

### Turn Boundary Detection

In Live Mode, `turn_complete` fires automatically based on **Speechmatics end-of-utterance events** (`AddTranscript` messages).

#### Detection Mechanism

The Speechmatics `AddTranscript` event already represents a natural speech boundary — the STT engine has determined the user completed a semantic unit. This is the **primary trigger**.

**Implementation:**

```typescript
// In startTranscription onFinal callback:
if (sessionModeRef.current === 'live') {
  // Speechmatics has signaled end-of-utterance → auto-send
  sentinelSocketRef.current?.sendTurnComplete(finalText)
  addSentTranscriptTurn(finalText)
}
```

#### Why NOT Silence Timeout?

A separate silence timeout is **not needed** because:

1. Speechmatics already incorporates silence detection in its `AddTranscript` emission logic
2. Adding a frontend timeout would create race conditions and duplicate sends
3. The STT engine has richer context (acoustics, prosody) than a simple timer

**Exception:** If future testing reveals Speechmatics holds utterances too long in certain scenarios, a **backstop timeout** may be added (see Edge Cases).

### Pending Turn Segments Behavior

In Live Mode, `pendingTurnSegments[]` is **not used for accumulation**:

| Mode | `onFinal` Behavior | `pendingTurnSegments` |
|------|-------------------|----------------------|
| Manual | `addPendingTurnSegment(text)` | Accumulates until "Send" |
| Live | `sendTurnComplete(text)` + `addSentTranscriptTurn(text)` | Stays empty |

**Fallback:** If `sendTurnComplete` returns `false` (WebSocket not ready), the segment is buffered to `pendingTurnSegments` to prevent data loss. The next successful `onFinal` or manual intervention will clear it.

### Send Button in Live Mode

The "Send Captured Turn" button and its containing card are **hidden in Live Mode**:

```tsx
{sessionState === 'active' && sessionMode === 'manual' && listeningState !== 'listening' && hasPendingTurn && (
  <SendCapturedTurnCard />
)}
```

**Rationale:** The button serves no purpose when turns auto-send. Showing it would confuse users.

**Exception:** If fallback buffering occurred (WebSocket was temporarily unavailable), the button appears so users can retry.

### Listening Controls in Live Mode

All listening controls remain **unchanged** in Live Mode:

| Button | Available | Behavior |
|--------|-----------|----------|
| Start Listening | ✅ | Activates mic, begins streaming PCM to Gemini + Sentinel |
| Pause Listening | ✅ | Pauses mic, stops PCM stream. Auto-flushes pending (see below) |
| Stop Listening | ✅ | Stops mic, stops PCM stream. Auto-flushes pending (see below) |
| Resume Listening | ✅ | Reactivates mic from paused state |

#### Auto-Flush on Pause/Stop (Live Mode Only)

When user pauses or stops listening in Live Mode, any text in `pendingTurnSegments` (from fallback buffering) is **automatically sent**:

```typescript
const setListeningMode = useCallback(async (nextState: ListeningState) => {
  listeningStateRef.current = nextState
  setListeningState(nextState)

  if (nextState !== 'listening') {
    setMicRms(0)
    setPartialTranscript('')
    
    // NEW: Auto-flush in live mode
    if (sessionModeRef.current === 'live' && pendingTurnSegments.length > 0) {
      const bufferedText = pendingTurnSegments.join(' ').trim()
      if (bufferedText && sentinelSocketRef.current?.sendTurnComplete(bufferedText)) {
        addSentTranscriptTurn(bufferedText)
      }
    }
  }

  await micRef.current?.setActive(nextState === 'listening')
}, [/* deps */])
```

---

## C. Manual Mode Behavior

### Confirmation: No Changes

Manual Mode behavior remains **exactly as currently implemented**:

1. User clicks **Start Listening** → mic activates, PCM streams to Sentinel + Gemini
2. Speechmatics emits partials → displayed in UI as `partialTranscript`
3. Speechmatics emits finals → buffered to `pendingTurnSegments[]`
4. User clicks **Pause Listening** → mic pauses, PCM stops, partial clears
5. User clicks **Send Captured Turn** → `sendTurnComplete` fires with buffered text
6. Backend processes: transcript to Sentinel, `activity_end{}` to Gemini
7. Coach responds with audio + captions

### Mode Toggle Interaction

The only new behavior in Manual Mode is the **mode toggle itself**:

- Toggle visible when `sessionState !== 'connecting'`
- Toggle disabled when `listeningState === 'listening'`
- Switching to Live Mode triggers transition logic (Section D)

---

## D. Transition Behavior

### Manual → Live (with pending unsent text)

**Scenario:** User has captured speech (`pendingTurnSegments.length > 0`) but hasn't sent it yet, then switches to Live Mode.

**Behavior:** The pending text is **immediately sent** and cleared:

```typescript
const switchMode = useCallback((mode: 'manual' | 'live') => {
  // Flush pending segments when switching TO live mode
  if (mode === 'live' && pendingTurnSegments.length > 0) {
    const bufferedText = pendingTurnSegments.join(' ').trim()
    if (bufferedText) {
      const sent = sentinelSocketRef.current?.sendTurnComplete(bufferedText) ?? false
      if (sent) {
        addSentTranscriptTurn(bufferedText)
      }
      // If send failed, segments remain — user will see error and can retry
    }
  }
  
  sessionModeRef.current = mode
  setSessionMode(mode)
  if (mode === 'live') clearPendingTurn()
}, [/* deps */])
```

**Rationale:** 
- Live Mode semantics = immediate delivery
- User is signaling they want conversational flow
- Don't discard their speech — send it

### Live → Manual (mid-session)

**Scenario:** User is in Live Mode, has been having automatic turns, then switches to Manual Mode.

**Behavior:** Simply change the mode flag. Next `onFinal` will buffer instead of auto-send.

```typescript
const switchMode = useCallback((mode: 'manual' | 'live') => {
  sessionModeRef.current = mode
  setSessionMode(mode)
  // No special handling needed for live → manual
}, [/* deps */])
```

**Note:** `pendingTurnSegments` will be empty (Live Mode doesn't accumulate), so no data loss risk.

---

## E. Backend Changes

### Required Changes: **None**

The backend already handles `turn_complete` generically:

```python
# bridge.py lines 117-122
elif msg_type == "turn_complete":
    text: str = (data.get("text") or "").strip()
    if text:
        await transcript_queue.put(text)
        await sentinel_service.send_transcript(text)
    await turn_boundary_queue.put(True)
```

This works identically whether the frontend sends `turn_complete` from:
- User clicking "Send Captured Turn" (Manual Mode)
- Automatic `onFinal` callback (Live Mode)

### Mode Awareness: **Not Required**

The backend does not need to know which mode the frontend is in because:

1. The message format (`{"type": "turn_complete", "text": "..."}`) is identical
2. Sentinel processing is identical
3. Gemini `activity_end` signaling is identical
4. The only difference is **timing** — which is a frontend concern

### Event Semantics: **Unchanged**

| Event | Semantics |
|-------|-----------|
| Binary PCM | Forwarded to Sentinel + Gemini (unchanged) |
| `{"type": "transcript", ...}` | Forwarded to Sentinel + Gemini transcript queue (unchanged) |
| `{"type": "turn_complete", ...}` | Signals turn boundary + forwards any text (unchanged) |

---

## F. Edge Cases

### 1. Long Silence in Live Mode

**Scenario:** User says one sentence, then pauses for 30+ seconds.

**Behavior:** 
- Speechmatics will emit `AddTranscript` when it detects the utterance is complete (typically 0.5-2 seconds of silence)
- `turn_complete` fires immediately upon that event
- The coach receives the turn and may respond
- The long silence afterward has no effect (mic is still streaming ambient audio to Gemini, which is fine)

**Edge case within edge case:** If Speechmatics is slow to finalize and user expects instant response:
- Future enhancement: Add optional **backstop timeout** (e.g., 3 seconds of silence after last partial) that forces finalization
- For V1, rely on Speechmatics timing which is tuned for conversation

### 2. Mode Switch Mid-Word

**Scenario:** User is speaking "I feel anx—" and switches mode while `partialTranscript` shows this fragment.

**Behavior:**
- Mode switch is **blocked** while `listeningState === 'listening'`
- User must pause/stop first
- The partial transcript is cleared on pause/stop
- Speechmatics will emit the final when user resumes (if they continued speaking before pausing) or discard the fragment

**This is intentional:** Switching modes mid-utterance would create confusing semantics.

### 3. Pause Listening with Pending Segments (Live Mode)

**Scenario:** User is in Live Mode, WebSocket briefly disconnected during speech, segments buffered to fallback array, then user pauses listening.

**Behavior:**
- Auto-flush logic in `setListeningMode` sends the buffered segments
- If send succeeds: segments cleared, transcript appears in history
- If send fails: segments remain, error displayed, user can retry via "Send Captured Turn" button (which appears when there's pending text)

### 4. Gemini Responding While User Starts Talking (Live Mode)

**Scenario:** Coach is mid-response (audio playing, `coachSpeaking === true`), user starts talking.

**Behavior:**
- User's speech is still captured (mic is active if `listeningState === 'listening'`)
- PCM streams to Gemini Live in real-time (this is already the case — Gemini handles barge-in)
- Speechmatics produces transcripts
- `turn_complete` fires when user stops speaking
- Gemini Live will interrupt itself and process the new turn

**Note:** Gemini Live's barge-in handling is a **backend/Gemini capability**, not a frontend concern. The frontend's job is to keep streaming PCM and signaling turn boundaries.

### 5. Rapid Multiple Utterances (Live Mode)

**Scenario:** User says three short sentences in quick succession: "Yes." "That makes sense." "Tell me more."

**Behavior:**
- Speechmatics may emit 3 separate `AddTranscript` events
- Each triggers a `turn_complete`
- Backend receives 3 `turn_complete` messages in rapid succession
- Gemini receives 3 `activity_end` signals
- Coach will likely respond to the compound input

**This is correct behavior.** If testing reveals issues (e.g., Gemini responding between each sentence), consider:
- Debouncing `turn_complete` with a 500ms window to coalesce rapid utterances
- Not recommended for V1 — wait for real user feedback

### 6. Network Reconnection

**Scenario:** WebSocket disconnects and reconnects mid-session.

**Behavior:**
- Existing reconnection logic handles this (if implemented)
- Mode state persists in Zustand store
- On reconnection, mode behavior continues as configured
- Any segments buffered during disconnection are either:
  - Sent automatically (Live Mode auto-flush)
  - Available for manual send (Manual Mode)

---

## G. UI/UX Summary

### Mode Toggle

```
┌─────────────────────────────────────────┐
│  [Manual]  [Live]     [Start Listening] │
└─────────────────────────────────────────┘
```

- **Location:** Header bar, left of session controls
- **Style:** Segmented button (current implementation)
- **Disabled when:** `listeningState === 'listening'`
- **Tooltip (disabled state):** "Pause or stop listening to change modes"

### Mode Indicators

| Mode | Visual Cues |
|------|-------------|
| Manual | "Send Captured Turn" card appears when paused/stopped with pending text |
| Live | No send card. Optional: subtle "Live" badge or different orb animation |

### Status Label Updates

The `StatusLabel` component may optionally show mode:

```typescript
// Optional enhancement:
const modeLabel = sessionMode === 'live' ? ' (Live)' : ''
// "Listening (Live)" vs "Listening"
```

---

## H. Implementation Checklist

### Frontend Changes

- [ ] Confirm `sessionMode` and `setSessionMode` exist in store (✅ already present)
- [ ] Confirm `sessionModeRef` exists in page.tsx (✅ already present)
- [ ] Update `switchMode` function:
  - [ ] Add pending segment flush when switching to Live Mode
- [ ] Update `setListeningMode` function:
  - [ ] Add auto-flush logic for Live Mode on pause/stop
- [ ] Update `onFinal` callback in `startTranscription`:
  - [ ] Current logic is correct (✅ already handles mode)
- [ ] Verify "Send Captured Turn" card visibility condition
- [ ] Verify mode toggle disabled state

### Backend Changes

- [ ] None required

### Testing Scenarios

1. **Manual Mode Regression**
   - Start session in Manual Mode
   - Speak, pause, send manually
   - Verify coach responds
   
2. **Live Mode Basic Flow**
   - Switch to Live Mode before session
   - Start session, start listening
   - Speak a sentence
   - Verify `turn_complete` fires automatically
   - Verify coach responds
   
3. **Mode Switch with Pending Text**
   - Start in Manual Mode
   - Speak, pause (don't send)
   - Switch to Live Mode
   - Verify pending text is sent
   
4. **Live Mode Pause/Stop**
   - In Live Mode, listening
   - Pause listening mid-speech
   - Verify any buffered text is sent
   
5. **Network Disruption**
   - In Live Mode
   - Simulate WebSocket close during speech
   - Verify fallback buffering works
   - Verify retry mechanism works

---

## I. Future Considerations

### Not In V1

1. **Configurable silence timeout** — Wait for user feedback
2. **Utterance coalescing** — Wait for real-world rapid-fire issues
3. **Mode persistence across sessions** — Consider for V2
4. **Per-segment send confirmation animations** — Nice to have

### API Surface Stability

This design ensures the backend API remains stable. Any future Live Mode enhancements (voice activity detection, smarter turn prediction) can be implemented frontend-only without backend changes.

---

## Appendix: State Machine

```
                    ┌──────────────────────────────────────────────────┐
                    │                    SESSION                        │
                    │  ┌─────────────────────────────────────────────┐ │
                    │  │              MODE: MANUAL                    │ │
                    │  │  ┌─────────────────────────────────────────┐│ │
                    │  │  │  LISTENING: stopped                     ││ │
                    │  │  │    - pendingTurnSegments may have data  ││ │
                    │  │  │    - "Send" button enabled if data      ││ │
                    │  │  │    - Can switch to Live Mode            ││ │
                    │  │  └─────────────────────────────────────────┘│ │
                    │  │              │                               │ │
                    │  │    [Start Listening]                         │ │
                    │  │              ▼                               │ │
                    │  │  ┌─────────────────────────────────────────┐│ │
                    │  │  │  LISTENING: listening                   ││ │
                    │  │  │    - onFinal → buffer to pending        ││ │
                    │  │  │    - Cannot switch modes                ││ │
                    │  │  └─────────────────────────────────────────┘│ │
                    │  │              │                               │ │
                    │  │    [Pause/Stop]                              │ │
                    │  │              ▼                               │ │
                    │  │  ┌─────────────────────────────────────────┐│ │
                    │  │  │  LISTENING: paused/stopped              ││ │
                    │  │  │    - "Send" button enabled if data      ││ │
                    │  │  │    - [Send] → turn_complete → clear     ││ │
                    │  │  └─────────────────────────────────────────┘│ │
                    │  └─────────────────────────────────────────────┘ │
                    │                      │                           │
                    │       [Switch to Live Mode]                      │
                    │       (flushes pending → turn_complete)          │
                    │                      ▼                           │
                    │  ┌─────────────────────────────────────────────┐ │
                    │  │              MODE: LIVE                      │ │
                    │  │  ┌─────────────────────────────────────────┐│ │
                    │  │  │  LISTENING: stopped                     ││ │
                    │  │  │    - pendingTurnSegments empty          ││ │
                    │  │  │    - No "Send" button                   ││ │
                    │  │  │    - Can switch to Manual Mode          ││ │
                    │  │  └─────────────────────────────────────────┘│ │
                    │  │              │                               │ │
                    │  │    [Start Listening]                         │ │
                    │  │              ▼                               │ │
                    │  │  ┌─────────────────────────────────────────┐│ │
                    │  │  │  LISTENING: listening                   ││ │
                    │  │  │    - onFinal → turn_complete (auto)     ││ │
                    │  │  │    - Cannot switch modes                ││ │
                    │  │  └─────────────────────────────────────────┘│ │
                    │  │              │                               │ │
                    │  │    [Pause/Stop]                              │ │
                    │  │              ▼                               │ │
                    │  │  ┌─────────────────────────────────────────┐│ │
                    │  │  │  LISTENING: paused/stopped              ││ │
                    │  │  │    - Auto-flush any fallback buffer     ││ │
                    │  │  │    - No "Send" button (unless fallback) ││ │
                    │  │  └─────────────────────────────────────────┘│ │
                    │  └─────────────────────────────────────────────┘ │
                    └──────────────────────────────────────────────────┘
```

---

*End of Specification*
