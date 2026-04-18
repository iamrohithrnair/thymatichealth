'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'

const MAX_ENTRIES = 50

type SessionState = 'idle' | 'connecting' | 'active' | 'error'
type ListeningState = 'stopped' | 'listening' | 'paused'

export default function TranscriptStream({
  sessionState,
  listeningState,
}: {
  sessionState: SessionState
  listeningState: ListeningState
}) {
  const transcripts = useStore((s) => s.transcripts)
  const pendingTurnSegments = useStore((s) => s.pendingTurnSegments)
  const partialTranscript = useStore((s) => s.partialTranscript)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pendingTurnText = pendingTurnSegments.join(' ').trim()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pendingTurnText, transcripts, partialTranscript])

  const visibleFinals = transcripts.slice(-MAX_ENTRIES)
  const emptyStateLabel =
    sessionState === 'connecting'
      ? 'Connecting…'
      : sessionState !== 'active'
      ? 'Start a session to capture transcript.'
      : listeningState === 'paused'
      ? 'Listening paused.'
      : listeningState === 'stopped'
      ? 'Microphone off. Start listening when ready.'
      : 'Waiting for speech…'

  return (
    <div className="th-card p-4 flex flex-col h-full">
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: 'var(--th-primary)' }}
      >
        Transcript
      </h2>

      <div className="th-card-inset flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 min-h-[160px]">
        {pendingTurnText && (
          <div
            className="rounded-xl px-3 py-2 mb-2"
            style={{
              background: 'var(--th-gradient-soft)',
              border: '1px solid rgba(99,102,241,0.35)',
            }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--th-primary)' }}
            >
              Captured turn · not sent yet
            </p>
            {pendingTurnSegments.map((segment, i) => (
              <p key={`${segment}-${i}`} className="text-sm leading-relaxed" style={{ color: 'var(--th-text)' }}>
                {segment}
              </p>
            ))}
          </div>
        )}

        {visibleFinals.length === 0 && !pendingTurnText && !partialTranscript && (
          <p className="text-xs italic" style={{ color: 'var(--th-text-muted)' }}>
            {emptyStateLabel}
          </p>
        )}

        {visibleFinals.map((line, i) => (
          <p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--th-text)' }}>
            {line}
          </p>
        ))}

        {partialTranscript && (
          <p
            className="text-sm italic leading-relaxed"
            style={{ color: 'var(--th-text-muted)' }}
          >
            {partialTranscript}
          </p>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
