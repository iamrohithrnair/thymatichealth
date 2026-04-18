// AudioWorklet-based 16kHz mono PCM16 mic capture with RMS metering

export interface MicCapture {
  stream: MediaStream
  stop: () => void
  setActive: (active: boolean) => Promise<void>
  onPcm: (cb: (pcm: Int16Array) => void) => void
  onRms: (cb: (rms: number) => void) => void
}

const processorCode = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0][0]
    if (ch) this.port.postMessage(ch)
    return true
  }
}
registerProcessor('pcm-processor', PcmProcessor)
`

/** Convert a Float32Array of audio samples to Int16Array PCM16. */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    // clamp to [-1, 1] then scale to [-32768, 32767]
    const clamped = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767
  }
  return int16
}

/** Compute RMS of a Float32Array, normalised to [0, 1]. */
function computeRms(float32: Float32Array): number {
  let sum = 0
  for (let i = 0; i < float32.length; i++) {
    sum += float32[i] * float32[i]
  }
  return Math.sqrt(sum / float32.length)
}

export async function startMicCapture(): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

  // Create AudioContext at 16kHz so we get native 16kHz output (browser will resample)
  const audioCtx = new AudioContext({ sampleRate: 16000 })

  // Create a Blob URL for the worklet processor code
  const blob = new Blob([processorCode], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)

  await audioCtx.audioWorklet.addModule(blobUrl)
  URL.revokeObjectURL(blobUrl)

  const source = audioCtx.createMediaStreamSource(stream)
  const workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor')

  const pcmCbs: Array<(pcm: Int16Array) => void> = []
  let rmsCb: ((rms: number) => void) | null = null

  workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const float32 = event.data
    if (rmsCb) {
      rmsCb(computeRms(float32))
    }
    if (pcmCbs.length > 0) {
      const pcm = float32ToInt16(float32)
      for (const cb of pcmCbs) cb(pcm)
    }
  }

  source.connect(workletNode)
  // Connect to destination so the graph stays active (but output is silent to speakers)
  workletNode.connect(audioCtx.destination)

  async function setActive(active: boolean): Promise<void> {
    if (active) {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }
      return
    }

    if (audioCtx.state === 'running') {
      await audioCtx.suspend()
    }

    if (rmsCb) {
      rmsCb(0)
    }
  }

  function stop() {
    workletNode.disconnect()
    source.disconnect()
    audioCtx.close()
    stream.getTracks().forEach((t) => t.stop())
  }

  return {
    stream,
    stop,
    setActive,
    onPcm(cb) {
      pcmCbs.push(cb)
    },
    onRms(cb) {
      rmsCb = cb
    },
  }
}
