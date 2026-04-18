'use client'

import { useState, useRef, useCallback } from 'react'
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

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

export default function SessionPage() {
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [coachAudioChunks, setCoachAudioChunks] = useState<string[]>([])
  const [coachCaptions, setCoachCaptions] = useState<string[]>([])
  const [coachVisualUrl, setCoachVisualUrl] = useState<string | undefined>(undefined)

  const micRef = useRef<MicCapture | null>(null)
  const transcriptionRef = useRef<TranscriptionHandle | null>(null)
  const sentinelSocketRef = useRef<SentinelSocketHandle | null>(null)

  const setSessionId = useStore((s) => s.setSessionId)
  const setMicRms = useStore((s) => s.setMicRms)
  const addSentinelEvent = useStore((s) => s.addSentinelEvent)
  const addFinalTranscript = useStore((s) => s.addFinalTranscript)
  const setPartialTranscript = useStore((s) => s.setPartialTranscript)
  const micRms = useStore((s) => s.micRms)

  // Derive orb state
  const orbState =
    sessionState !== 'active'
      ? 'idle'
      : coachCaptions.length > 0 && coachAudioChunks.length > 0
      ? 'coach-speaking'
      : 'listening'

  const startSession = useCallback(async () => {
    setSessionState('connecting')
    setErrorMsg(null)
    setCoachAudioChunks([])
    setCoachCaptions([])
    setCoachVisualUrl(undefined)

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

      // Step 3 — fetch Speechmatics JWT and start transcription
      const tokenRes = await fetch('/api/speechmatics-token')
      if (!tokenRes.ok) throw new Error(`Speechmatics token fetch failed: ${tokenRes.status}`)
      const { token } = await tokenRes.json() as { token: string }

      const transcription = await startTranscription(
        token,
        // onPartial
        (text) => setPartialTranscript(text),
        // onFinal — update store AND forward to sentinel
        (text) => {
          addFinalTranscript(text)
          sentinelSocketRef.current?.sendTranscript(text)
        },
      )
      transcriptionRef.current = transcription

      // Wire mic PCM → transcription AND sentinel (audio.ts now supports multiple subscribers)
      mic.onPcm((pcm) => transcription.sendPcm(pcm))
      mic.onPcm((pcm) => sentinelSocketRef.current?.sendPcm(pcm))

      // Step 4 — create sentinel socket (also carries coach_audio / coach_caption events)
      const sentinel = createSentinelSocket(session_id, {
        backendUrl: BACKEND_URL.replace(/^http/, 'ws'),
        onPolicyResult: (event) => {
          addSentinelEvent({ policy: 'sentinel', result: event.result, ts: Date.now() })
          const res = event.result as Record<string, unknown> | null
          if (res && (res.urgency === 'high' || res.urgency === 'urgent')) {
            const toneHint = typeof res.tone === 'string' ? res.tone : 'calming exercise'
            fetchCoachVisual(toneHint).then((v) => setCoachVisualUrl(v.image_url)).catch(() => {})
          }
        },
        onCoachAudio: (base64) => setCoachAudioChunks((prev) => [...prev, base64]),
        onCoachCaption: (text) => setCoachCaptions((prev) => [...prev, text]),
        onStatus: (status) => console.debug('[sentinel]', status),
        onError: (err) => console.error('[sentinel] WS error', err),
      })
      sentinelSocketRef.current = sentinel

      setSessionState('active')
    } catch (err) {
      setSessionState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start session')
      stopAll()
    }
  }, [addFinalTranscript, addSentinelEvent, setMicRms, setPartialTranscript, setSessionId])

  function stopAll() {
    micRef.current?.stop()
    micRef.current = null
    transcriptionRef.current?.stop()
    transcriptionRef.current = null
    sentinelSocketRef.current?.close()
    sentinelSocketRef.current = null
    setMicRms(0)
    setPartialTranscript('')
  }

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

            {/* Session controls */}
            <div className="flex items-center gap-3">
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
                <button
                  onClick={endSession}
                  className="th-btn-secondary cursor-pointer"
                  style={{ color: '#EF4444', borderColor: '#EF4444' }}
                >
                  End Session
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {sessionState === 'error' && errorMsg && (
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
            <TranscriptStream />
          </div>

          {/* Centre: MicOrb */}
          <div className="flex flex-col items-center justify-center gap-6 flex-shrink-0 px-4">
            <div className="th-card rounded-3xl p-8 flex flex-col items-center gap-5">
              <MicOrb state={orbState} rms={micRms} />
              <StatusLabel state={sessionState} orbState={orbState} />
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
}: {
  state: SessionState
  orbState: 'idle' | 'listening' | 'coach-speaking'
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
