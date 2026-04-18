'use client'
import { useEffect, useRef } from 'react'

export interface MicOrbProps {
  state: 'idle' | 'listening' | 'coach-speaking'
  rms: number
}

export default function MicOrb({ state, rms }: MicOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!orbRef.current) return
    const scale = state === 'listening' ? 1 + rms * 0.1 : 1
    orbRef.current.style.transform = `scale(${scale})`
  }, [rms, state])

  const orbBg =
    state === 'idle'
      ? 'var(--th-bg)'
      : 'var(--th-gradient-soft)'

  const orbShadow =
    state === 'listening'
      ? 'var(--th-shadow-in), 0 0 0 3px var(--th-primary)'
      : state === 'coach-speaking'
      ? 'var(--th-shadow-accent)'
      : 'var(--th-shadow-out)'

  return (
    <div className="relative flex items-center justify-center" style={{ width: 144, height: 144 }}>
      {/* Pulse ring when listening */}
      {state === 'listening' && (
        <span
          className="th-pulse-ring absolute inset-0 rounded-full"
          style={{ border: '2px solid var(--th-primary)', borderRadius: '50%' }}
          aria-hidden="true"
        />
      )}
      <div
        ref={orbRef}
        className={`flex items-center justify-center rounded-full transition-all duration-200 ${state === 'coach-speaking' ? 'th-glow' : ''}`}
        style={{ width: 128, height: 128, background: orbBg, boxShadow: orbShadow }}
        role="img"
        aria-label={`Microphone: ${state}`}
      >
        {state === 'coach-speaking' ? <SpeakerIcon /> : <MicIcon state={state} />}
      </div>
    </div>
  )
}

function MicIcon({ state }: { state: string }) {
  const color = state === 'listening' ? 'var(--th-primary)' : 'var(--th-text-muted)'
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
      stroke="var(--th-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}
