// Server route — never expose SPEECHMATICS_API_KEY to client
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function extractDetails(payload: unknown): string | null {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return null

  const details = payload as {
    error?: unknown
    message?: unknown
    detail?: unknown
  }

  for (const value of [details.error, details.message, details.detail]) {
    if (typeof value === 'string' && value.trim()) return value
  }

  return null
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function GET() {
  const apiKey = process.env.SPEECHMATICS_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'SPEECHMATICS_API_KEY is not configured on the Next.js server' },
      { status: 500 },
    )
  }

  try {
    const res = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ttl: 60 }),
    })

    const payload = await readPayload(res)

    if (!res.ok) {
      return NextResponse.json(
        {
          error: 'Speechmatics token mint failed',
          upstreamStatus: res.status,
          details: extractDetails(payload),
        },
        { status: 502 },
      )
    }

    const token =
      payload &&
      typeof payload === 'object' &&
      'key_value' in payload &&
      typeof payload.key_value === 'string'
        ? payload.key_value
        : null

    if (!token) {
      return NextResponse.json(
        { error: 'Speechmatics token mint returned no key_value' },
        { status: 502 },
      )
    }

    return NextResponse.json({ token })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Speechmatics token mint request failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 },
    )
  }
}
