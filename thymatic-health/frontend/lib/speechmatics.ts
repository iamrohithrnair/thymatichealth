// Speechmatics real-time transcription via @speechmatics/real-time-client v8
import { RealtimeClient } from '@speechmatics/real-time-client'

export interface TranscriptionHandle {
  sendPcm: (pcm: Int16Array) => void
  stop: () => void
}

/**
 * Start a Speechmatics real-time transcription session.
 *
 * @param token   Temporary JWT obtained from /api/speechmatics-token
 * @param onPartial  Called with each partial transcript string
 * @param onFinal    Called with each final transcript string
 */
export async function startTranscription(
  token: string,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
): Promise<TranscriptionHandle> {
  const client = new RealtimeClient({
    url: 'wss://eu.rt.speechmatics.com/v2',
  })

  // Subscribe to all server messages via the typed event target API
  client.addEventListener('receiveMessage', (event) => {
    const msg = event.data

    if (msg.message === 'AddPartialTranscript') {
      // metadata.transcript is the full concatenated partial text
      onPartial(msg.metadata.transcript)
    } else if (msg.message === 'AddTranscript') {
      onFinal(msg.metadata.transcript)
    }
  })

  // Start the session — SDK v8 takes (jwt, config) not an options object
  await client.start(token, {
    transcription_config: {
      language: 'en',
      enable_partials: true,
    },
    audio_format: {
      type: 'raw',
      encoding: 'pcm_s16le',
      sample_rate: 16000,
    },
  })

  function sendPcm(pcm: Int16Array): void {
    // sendAudio accepts ArrayBufferLike or ArrayBuffer or Blob or string
    client.sendAudio(pcm.buffer)
  }

  async function stop(): Promise<void> {
    try {
      await client.stopRecognition()
    } catch {
      // ignore timeout errors on cleanup
    }
  }

  return { sendPcm, stop }
}
