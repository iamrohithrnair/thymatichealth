'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { startMicCapture, type MicCapture } from '@/lib/audio'
import { startTranscription, type TranscriptionHandle } from '@/lib/speechmatics'
import { createSentinelSocket, type SentinelSocketHandle } from '@/lib/sentinelSocket'
import { fetchCoachVisual } from '@/lib/visual'
import MicOrb from '@/components/MicOrb'
import CoachReply from '@/components/CoachReply'
import TranscriptStream from '@/components/TranscriptStream'
import SentinelBadges from '@/components/SentinelBadges'

type SessionState = 'idle' | 'connecting' | 'active' | 'error'
type ListeningState = 'stopped' | 'listening' | 'paused'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown; details?: unknown }
    const parts = [payload.error, payload.details].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )
    if (parts.length > 0) return parts.join(': ')
  } catch {
    // fall back to HTTP status below
  }

  return String(response.status)
}

export default function SessionPage() {
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [listeningState, setListeningState] = useState<ListeningState>('stopped')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [coachAudioChunks, setCoachAudioChunks] = useState<string[]>([])
  const [coachCaptions, setCoachCaptions] = useState<string[]>([])
  const [coachVisualUrl, setCoachVisualUrl] = useState<string | undefined>(undefined)
  const [coachSpeaking, setCoachSpeaking] = useState(false)

  const micRef = useRef<MicCapture | null>(null)
  const transcriptionRef = useRef<TranscriptionHandle | null>(null)
  const sentinelSocketRef = useRef<SentinelSocketHandle | null>(null)
  const coachSpeakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listeningStateRef = useRef<ListeningState>('stopped')
  const sessionActiveRef = useRef(false)
  const sessionModeRef = useRef<'manual' | 'live'>('live')

  const setSessionId = useStore((s) => s.setSessionId)
  const setMicRms = useStore((s) => s.setMicRms)
  const addSentinelEvent = useStore((s) => s.addSentinelEvent)
  const addPendingTurnSegment = useStore((s) => s.addPendingTurnSegment)
  const addSentTranscriptTurn = useStore((s) => s.addSentTranscriptTurn)
  const setPartialTranscript = useStore((s) => s.setPartialTranscript)
  const clearPendingTurn = useStore((s) => s.clearPendingTurn)
  const pendingTurnSegments = useStore((s) => s.pendingTurnSegments)
  const resetSessionState = useStore((s) => s.resetSessionState)
  const micRms = useStore((s) => s.micRms)
  const sessionMode = useStore((s) => s.sessionMode)
  const setSessionMode = useStore((s) => s.setSessionMode)
  const [isSendingTurn, setIsSendingTurn] = useState(false)
  const pendingTurnText = useMemo(
    () => pendingTurnSegments.join(' ').trim(),
    [pendingTurnSegments],
  )
  const hasPendingTurn = pendingTurnText.length > 0
  const sendHint =
    listeningState === 'paused'
      ? 'Listening is paused. Send this captured turn to Sentinel and the coach, or resume listening to keep adding to it.'
      : 'Listening is stopped. Send this captured turn to Sentinel and the coach, or start listening again to keep adding to it.'

  // Derive orb state
  const orbState =
    sessionState !== 'active'
      ? 'idle'
      : coachSpeaking
      ? 'coach-speaking'
      : listeningState === 'listening'
      ? 'listening'
      : 'idle'

  const stopCoachSpeaking = useCallback(() => {
    if (coachSpeakingTimeoutRef.current) {
      clearTimeout(coachSpeakingTimeoutRef.current)
      coachSpeakingTimeoutRef.current = null
    }
    setCoachSpeaking(false)
  }, [])

  const markCoachSpeaking = useCallback(() => {
    setCoachSpeaking(true)
    setPartialTranscript('')
    if (coachSpeakingTimeoutRef.current) {
      clearTimeout(coachSpeakingTimeoutRef.current)
    }
    coachSpeakingTimeoutRef.current = setTimeout(() => {
      coachSpeakingTimeoutRef.current = null
      setCoachSpeaking(false)
    }, 1500)
  }, [setPartialTranscript])

  const flushPendingTurn = useCallback(
    (failureMessage?: string) => {
      if (!pendingTurnText) return true

      const didSend = sentinelSocketRef.current?.sendTurnComplete(pendingTurnText) ?? false

      if (!didSend) {
        if (failureMessage) {
          setErrorMsg(failureMessage)
        }
        return false
      }

      setErrorMsg(null)
      addSentTranscriptTurn(pendingTurnText)
      return true
    },
    [addSentTranscriptTurn, pendingTurnText],
  )

  const setListeningMode = useCallback(
    async (nextState: ListeningState) => {
      listeningStateRef.current = nextState
      setListeningState(nextState)

      if (nextState !== 'listening') {
        setMicRms(0)
        setPartialTranscript('')

        if (sessionModeRef.current === 'live') {
          flushPendingTurn('Unable to auto-send the buffered live turn while pausing/stopping. Please resend it below.')
        }
      }

      await micRef.current?.setActive(nextState === 'listening')
    },
    [flushPendingTurn, setMicRms, setPartialTranscript],
  )

  const startSession = useCallback(async () => {
    setSessionState('connecting')
    sessionActiveRef.current = true
    listeningStateRef.current = 'stopped'
    setListeningState('stopped')
    setErrorMsg(null)
    setIsSendingTurn(false)
    resetSessionState()
    sessionModeRef.current = useStore.getState().sessionMode
    setCoachAudioChunks([])
    setCoachCaptions([])
    setCoachVisualUrl(undefined)
    stopCoachSpeaking()

    try {
      // Step 1 — create backend session
      const sessionRes = await fetch(`${BACKEND_URL}/session/start`, { method: 'POST' })
      if (!sessionRes.ok) throw new Error(`Session start failed: ${sessionRes.status}`)
      const { session_id } = await sessionRes.json() as { session_id: string }
      setSessionId(session_id)

      // Step 2 — start mic capture
      const mic = await startMicCapture()
      micRef.current = mic
      mic.onRms(setMicRms)
      await mic.setActive(false)

      // Step 3 — fetch Speechmatics JWT and start transcription
      const tokenRes = await fetch('/api/speechmatics-token')
      if (!tokenRes.ok) {
        throw new Error(`Speechmatics token fetch failed: ${await readApiError(tokenRes)}`)
      }
      const { token } = await tokenRes.json() as { token: string }

      const transcription = await startTranscription(
        token,
        // onPartial
        (text) => {
          if (listeningStateRef.current !== 'listening') return
          setPartialTranscript(text)
        },
        // onFinal — in manual mode: buffer locally; in live mode: stream + close the turn
        (text) => {
          if (!sessionActiveRef.current) return
          const finalText = text.trim()
          if (!finalText) return

          if (sessionModeRef.current === 'live') {
            const sent =
              sentinelSocketRef.current?.sendTranscript(finalText, { turnComplete: true }) ?? false
            if (sent) {
              setErrorMsg(null)
              addSentTranscriptTurn(finalText)
            } else {
              // Sentinel not ready yet — fall back to buffer so nothing is lost
              setErrorMsg('Live send was unavailable, so the turn was kept locally. You can resend it below.')
              addPendingTurnSegment(finalText)
            }
          } else {
            addPendingTurnSegment(finalText)
          }
        },
      )
      transcriptionRef.current = transcription

      // Wire mic PCM → transcription AND sentinel (audio.ts now supports multiple subscribers)
      mic.onPcm((pcm) => {
        if (listeningStateRef.current !== 'listening') return
        transcription.sendPcm(pcm)
      })
      mic.onPcm((pcm) => {
        if (listeningStateRef.current !== 'listening') return
        sentinelSocketRef.current?.sendPcm(pcm)
      })

      // Step 4 — create sentinel socket (also carries coach_audio / coach_caption events)
      const sentinel = createSentinelSocket(session_id, {
        backendUrl: BACKEND_URL.replace(/^http/, 'ws'),
        onPolicyResult: (event) => {
          addSentinelEvent({ policy: 'sentinel', result: event.result, ts: Date.now() })
          const payload = event.result as Record<string, unknown> | null
          const inner = payload?.result as Record<string, unknown> | undefined
          const actions = inner?.recommended_actions as Record<string, unknown> | undefined
          const urgency = actions?.urgency
          if (urgency === 'high' || urgency === 'urgent') {
            let toneHint = 'calming exercise'
            if (typeof actions?.for_agent === 'string') toneHint = actions.for_agent
            else if (typeof inner?.tone === 'string') toneHint = inner.tone
            fetchCoachVisual(toneHint).then((v) => setCoachVisualUrl(v.image_url)).catch(() => {})
          }
        },
        onCoachAudio: (base64) => {
          markCoachSpeaking()
          setCoachAudioChunks((prev) => [...prev, base64])
        },
        onCoachCaption: (text) => {
          markCoachSpeaking()
          setCoachCaptions((prev) => [...prev, text])
        },
        onStatus: (status) => console.debug('[sentinel]', status),
        onError: (err) => console.error('[sentinel] WS error', err),
        onClose: () => {
          if (!sessionActiveRef.current) return
          setErrorMsg(
            'The Sentinel/coach connection closed. End this session and start again, or check the backend terminal for errors (e.g. missing GOOGLE_API_KEY or Sentinel failing to connect).',
          )
        },
        onBridgeError: (msg) => {
          if (!sessionActiveRef.current) return
          setErrorMsg(msg)
        },
      })
      sentinelSocketRef.current = sentinel

      try {
        await sentinel.ready
      } catch {
        throw new Error(
          'Could not open the Sentinel/coach connection. Check that the backend is running and that NEXT_PUBLIC_BACKEND_URL matches it (including ws:// vs wss://).',
        )
      }

      setSessionState('active')
    } catch (err) {
      setSessionState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start session')
      stopAll()
    }
  }, [
    addPendingTurnSegment,
    addSentTranscriptTurn,
    addSentinelEvent,
    markCoachSpeaking,
    resetSessionState,
    setMicRms,
    setPartialTranscript,
    setSessionId,
    stopCoachSpeaking,
  ])

  const stopAll = useCallback(() => {
    sessionActiveRef.current = false
    listeningStateRef.current = 'stopped'
    setListeningState('stopped')
    setIsSendingTurn(false)
    micRef.current?.stop()
    micRef.current = null
    transcriptionRef.current?.stop()
    transcriptionRef.current = null
    sentinelSocketRef.current?.close()
    sentinelSocketRef.current = null
    stopCoachSpeaking()
    setSessionId(null)
    setMicRms(0)
    clearPendingTurn()
    setPartialTranscript('')
  }, [clearPendingTurn, setMicRms, setPartialTranscript, setSessionId, stopCoachSpeaking])

  useEffect(() => stopAll, [stopAll])

  useEffect(() => {
    sessionModeRef.current = sessionMode
  }, [sessionMode])

  const startListening = useCallback(() => {
    void setListeningMode('listening')
  }, [setListeningMode])

  const pauseListening = useCallback(() => {
    void setListeningMode('paused')
  }, [setListeningMode])

  const stopListening = useCallback(() => {
    void setListeningMode('stopped')
  }, [setListeningMode])

  const sendCapturedTurn = useCallback(() => {
    if (listeningState === 'listening' || !hasPendingTurn || isSendingTurn) return

    setIsSendingTurn(true)
    const s = sentinelSocketRef.current
    if (!s?.isOpen()) {
      setErrorMsg(
        'Not connected to Sentinel/coach (the live socket is closed). End the session and start again.',
      )
      setIsSendingTurn(false)
      return
    }
    if (!flushPendingTurn('Unable to send the captured turn to Sentinel/coach right now. Please try again.')) {
      setIsSendingTurn(false)
      return
    }
    setIsSendingTurn(false)
  }, [flushPendingTurn, hasPendingTurn, isSendingTurn, listeningState])

  const switchMode = useCallback(
    (mode: 'manual' | 'live') => {
      if (mode === 'live' && hasPendingTurn) {
        if (!flushPendingTurn('Unable to send the captured turn while switching to Live mode. Please try again.')) {
          return
        }
      }
      sessionModeRef.current = mode
      setSessionMode(mode)
      setErrorMsg(null)
    },
    [flushPendingTurn, hasPendingTurn, setSessionMode],
  )

  function endSession() {
    stopAll()
    setSessionState('idle')
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--th-bg)' }}
    >
      {/* Top bar — header + sentinel badges */}
      <header
        className="px-4 pt-5 pb-3"
        style={{ backgroundColor: 'var(--th-bg)' }}
      >
        <div className="max-w-5xl mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight flex items-baseline gap-2">
              <span className="th-gradient-text">Thymatic Health</span>
              <span className="text-sm font-normal" style={{ color: 'var(--th-text-muted)' }}>
                / Live Session
              </span>
            </h1>

            {/* Mode selector + Session controls */}
            <div className="flex items-center gap-3">
              {/* Mode toggle */}
              <div
                className="flex items-center rounded-xl overflow-hidden"
                style={{
                  border: '1px solid rgba(99,102,241,0.3)',
                  background: 'var(--th-card-inset)',
                }}
                role="group"
                aria-label="Session mode"
              >
                <button
                  onClick={() => switchMode('manual')}
                  disabled={listeningState === 'listening'}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={
                    sessionMode === 'manual'
                      ? { background: 'var(--th-primary)', color: '#fff' }
                      : { background: 'transparent', color: 'var(--th-text-muted)' }
                  }
                >
                  Manual
                </button>
                <button
                  onClick={() => switchMode('live')}
                  disabled={listeningState === 'listening'}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={
                    sessionMode === 'live'
                      ? { background: 'var(--th-primary)', color: '#fff' }
                      : { background: 'transparent', color: 'var(--th-text-muted)' }
                  }
                >
                  Live
                </button>
              </div>
              {sessionState === 'idle' || sessionState === 'error' ? (
                <button
                  onClick={startSession}
                  className="th-btn-primary"
                >
                  Start Session
                </button>
              ) : sessionState === 'connecting' ? (
                <span
                  className="text-sm"
                  style={{ color: 'var(--th-text-muted)' }}
                >
                  Connecting…
                </span>
              ) : (
                <>
                  {listeningState === 'stopped' ? (
                    <button onClick={startListening} className="th-btn-primary">
                      Start Listening
                    </button>
                  ) : listeningState === 'paused' ? (
                    <button onClick={startListening} className="th-btn-primary">
                      Resume Listening
                    </button>
                  ) : (
                    <button onClick={pauseListening} className="th-btn-secondary">
                      Pause Listening
                    </button>
                  )}

                  {listeningState !== 'stopped' && (
                    <button onClick={stopListening} className="th-btn-secondary">
                      Stop Listening
                    </button>
                  )}

                  <button
                    onClick={endSession}
                    className="th-btn-secondary cursor-pointer"
                    style={{ color: '#EF4444', borderColor: '#EF4444' }}
                  >
                    End Session
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <div
              className="th-card-inset text-sm px-4 py-2.5 rounded-xl"
              style={{
                color: '#EF4444',
                border: '1px solid rgba(239,68,68,0.27)',
              }}
              role="alert"
            >
              {errorMsg}
            </div>
          )}

          {sessionState === 'active' && listeningState !== 'listening' && hasPendingTurn && (
            <div
              className="th-card-inset rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              style={{ border: '1px solid rgba(99,102,241,0.24)' }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--th-text)' }}>
                  {sessionMode === 'live' ? 'Captured turn pending resend' : 'Captured turn ready'}
                </p>
                <p className="text-xs" style={{ color: 'var(--th-text-muted)' }}>
                  {sendHint}
                </p>
              </div>

              <button
                onClick={sendCapturedTurn}
                disabled={isSendingTurn}
                className="th-btn-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:transform-none"
              >
                {isSendingTurn ? 'Sending…' : 'Send Captured Turn'}
              </button>
            </div>
          )}

          {/* Sentinel badges */}
          <div className="th-card rounded-2xl px-3 py-2">
            <SentinelBadges />
          </div>
        </div>
      </header>

      {/* Main grid */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 pb-8">
        <div className="flex flex-col md:flex-row gap-5 h-full min-h-[480px]">
          {/* Left: Transcript */}
          <div className="md:w-72 flex-shrink-0 flex flex-col" style={{ minHeight: 320 }}>
            <TranscriptStream sessionState={sessionState} listeningState={listeningState} />
          </div>

          {/* Centre: MicOrb */}
          <div className="flex flex-col items-center justify-center gap-6 flex-shrink-0 px-4">
            <div className="th-card rounded-3xl p-8 flex flex-col items-center gap-5">
              <MicOrb state={orbState} rms={micRms} />
              <StatusLabel
                state={sessionState}
                orbState={orbState}
                listeningState={listeningState}
              />
            </div>
          </div>

          {/* Right: Coach reply */}
          <div className="flex-1 flex flex-col min-h-0" style={{ minHeight: 320 }}>
            <CoachReply
              audioChunks={coachAudioChunks}
              captions={coachCaptions}
              visualImageUrl={coachVisualUrl}
            />
          </div>
        </div>
      </div>
    </main>
  )
}

function StatusLabel({
  state,
  orbState,
  listeningState,
}: {
  state: SessionState
  orbState: 'idle' | 'listening' | 'coach-speaking'
  listeningState: ListeningState
}) {
  const label =
    state === 'idle'
      ? 'Ready'
      : state === 'connecting'
      ? 'Connecting…'
      : state === 'error'
      ? 'Error'
      : orbState === 'coach-speaking'
      ? 'Coach speaking'
      : listeningState === 'paused'
      ? 'Listening paused'
      : listeningState === 'stopped'
      ? 'Mic off'
      : 'Listening'

  return (
    <p
      className="text-xs font-semibold uppercase tracking-widest"
      style={{ color: 'var(--th-text-muted)' }}
    >
      {label}
    </p>
  )
}
