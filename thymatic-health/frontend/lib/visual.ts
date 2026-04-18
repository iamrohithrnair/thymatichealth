export interface VisualResponse {
  image_url: string
  video_url?: string
}

export async function fetchCoachVisual(theme: string, wantVideo = false): Promise<VisualResponse> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'
  const res = await fetch(`${backendUrl}/coach/visual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme, want_video: wantVideo }),
  })
  if (!res.ok) throw new Error(`Visual generation failed: ${res.status}`)
  return res.json()
}
