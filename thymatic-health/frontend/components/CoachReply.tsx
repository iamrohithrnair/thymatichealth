'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchCoachVisual } from '@/lib/visual'
import Image from 'next/image'

export interface CoachReplyProps {
  audioChunks: string[]   // base64-encoded PCM16 LE chunks
  captions: string[]
  visualImageUrl?: string
}

export default function CoachReply({ audioChunks, captions, visualImageUrl }: CoachReplyProps) {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const playQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)
  const processedCountRef = useRef(0)

  const [generatedVisual, setGeneratedVisual] = useState<string | undefined>(undefined)
  const [visualLoading, setVisualLoading] = useState(false)
  const [visualError, setVisualError] = useState<string | null>(null)

  const captionsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll captions
  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [captions])

  // Decode and queue new audio chunks as they arrive
  useEffect(() => {
    const newChunks = audioChunks.slice(processedCountRef.current)
    if (newChunks.length === 0) return
    processedCountRef.current = audioChunks.length

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 })
    }
    const ctx = audioCtxRef.current

    newChunks.forEach((b64) => {
      // Decode base64 → binary string → ArrayBuffer
      const binaryStr = atob(b64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      playQueueRef.current.push(bytes.buffer)
    })

    playNext(ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioChunks])

  function playNext(ctx: AudioContext) {
    if (isPlayingRef.current) return
    const buf = playQueueRef.current.shift()
    if (!buf) return

    isPlayingRef.current = true

    // PCM16 LE → Float32 AudioBuffer
    const int16 = new Int16Array(buf)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }
    const audioBuf = ctx.createBuffer(1, float32.length, ctx.sampleRate)
    audioBuf.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = audioBuf
    source.connect(ctx.destination)
    source.onended = () => {
      isPlayingRef.current = false
      playNext(ctx)
    }
    source.start()
  }

  async function handleGenerateVisual() {
    const theme = captions[captions.length - 1] ?? 'gentle exercise'
    setVisualLoading(true)
    setVisualError(null)
    try {
      const res = await fetchCoachVisual(theme)
      setGeneratedVisual(res.image_url)
    } catch (e) {
      setVisualError(e instanceof Error ? e.message : 'Visual generation failed')
    } finally {
      setVisualLoading(false)
    }
  }

  const displayVisual = generatedVisual ?? visualImageUrl

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 h-full"
      style={{ boxShadow: 'var(--neu-shadow-out)', backgroundColor: 'var(--neu-bg)' }}
    >
      <h2
        className="text-sm font-semibold uppercase tracking-widest"
        style={{ color: 'var(--neu-text-muted)' }}
      >
        Coach
      </h2>

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Captions */}
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="flex-1 overflow-y-auto rounded-xl p-3 flex flex-col gap-2 min-h-[120px]"
            style={{ boxShadow: 'var(--neu-shadow-in)', backgroundColor: 'var(--neu-bg)' }}
          >
            {captions.length === 0 && (
              <p
                className="text-xs italic"
                style={{ color: 'var(--neu-text-muted)' }}
              >
                Waiting for coach response…
              </p>
            )}
            {captions.map((cap, i) => {
              const isLatest = i === captions.length - 1
              return (
                <p
                  key={i}
                  className={`leading-relaxed transition-all duration-200 ease-in-out ${
                    isLatest ? 'text-base font-semibold' : 'text-sm opacity-60'
                  }`}
                  style={{ color: 'var(--neu-text)' }}
                >
                  {cap}
                </p>
              )
            })}
            <div ref={captionsEndRef} />
          </div>
        </div>

        {/* Visual */}
        {displayVisual && (
          <div
            className="rounded-xl overflow-hidden flex-shrink-0 self-start"
            style={{
              width: 160,
              height: 160,
              boxShadow: 'var(--neu-shadow-out)',
            }}
          >
            <Image
              src={displayVisual}
              alt="Exercise visual"
              width={160}
              height={160}
              className="object-cover w-full h-full"
            />
          </div>
        )}
      </div>

      {/* Generate visual button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerateVisual}
          disabled={visualLoading || captions.length === 0}
          className="text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 ease-in-out cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            boxShadow: 'var(--neu-shadow-out)',
            backgroundColor: 'var(--neu-bg)',
            color: 'var(--neu-accent)',
          }}
          aria-label="Generate exercise visual from latest caption"
        >
          {visualLoading ? 'Generating…' : 'Generate exercise visual'}
        </button>
        {visualError && (
          <p className="text-xs" style={{ color: '#e53e3e' }}>
            {visualError}
          </p>
        )}
      </div>
    </div>
  )
}
