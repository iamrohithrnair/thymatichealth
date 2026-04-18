// Server route — never expose SPEECHMATICS_API_KEY to client
import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.SPEECHMATICS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'not configured' }, { status: 500 })

  const res = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ttl: 60 }),
  })
  if (!res.ok) return NextResponse.json({ error: 'token fetch failed' }, { status: 502 })
  const data = await res.json()
  return NextResponse.json({ token: data.key_value })
}
