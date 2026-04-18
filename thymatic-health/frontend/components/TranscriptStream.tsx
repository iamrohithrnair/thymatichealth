'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'

const MAX_ENTRIES = 50

export default function TranscriptStream() {
  const transcripts = useStore((s) => s.transcripts)
  const partialTranscript = useStore((s) => s.partialTranscript)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcripts, partialTranscript])

  const visibleFinals = transcripts.slice(-MAX_ENTRIES)

  return (
    <div className="th-card p-4 flex flex-col h-full">
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: 'var(--th-primary)' }}
      >
        Transcript
      </h2>

      <div className="th-card-inset flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 min-h-[160px]">
        {visibleFinals.length === 0 && !partialTranscript && (
          <p className="text-xs italic" style={{ color: 'var(--th-text-muted)' }}>
            Waiting for speech…
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
