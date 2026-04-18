/**
 * sentinelSocket.ts — backend WebSocket client for the Sentinel bridge.
 *
 * Opens a WebSocket to /session/{sessionId}/audio, forwards PCM frames and
 * transcript strings, and surfaces incoming policy_result events via callback.
 */

export type PolicyResultEvent = { type: "policy_result"; result: unknown };

export interface SentinelSocketHandle {
  /** Send a chunk of raw PCM16 audio (as Int16Array). */
  sendPcm: (pcm: Int16Array) => void;
  /** Send a finalised transcript string. */
  sendTranscript: (text: string) => void;
  /** Close the WebSocket. */
  close: () => void;
}

export function createSentinelSocket(
  sessionId: string,
  opts: {
    backendUrl: string;
    onPolicyResult: (event: PolicyResultEvent) => void;
    onCoachAudio?: (base64: string) => void;
    onCoachCaption?: (text: string) => void;
    onStatus?: (status: string) => void;
    onError?: (err: Event) => void;
  }
): SentinelSocketHandle {
  const url = `${opts.backendUrl}/session/${sessionId}/audio`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  ws.addEventListener("message", (ev) => {
    let data: unknown;
    try {
      data = JSON.parse(ev.data as string);
    } catch {
      return;
    }

    const msg = data as { type: string; [k: string]: unknown };

    if (msg.type === "policy_result") {
      opts.onPolicyResult({ type: "policy_result", result: msg.result });
    } else if (msg.type === "coach_audio" && opts.onCoachAudio) {
      opts.onCoachAudio(msg.data as string);
    } else if (msg.type === "coach_caption" && opts.onCoachCaption) {
      opts.onCoachCaption(msg.text as string);
    } else if (msg.type === "status" && opts.onStatus) {
      opts.onStatus(msg.status as string);
    }
  });

  if (opts.onError) {
    ws.addEventListener("error", opts.onError);
  }

  return {
    sendPcm(pcm: Int16Array): void {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Send the underlying ArrayBuffer so the server receives raw binary.
      ws.send(pcm.buffer);
    },

    sendTranscript(text: string): void {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "transcript", text }));
    },

    close(): void {
      ws.close();
    },
  };
}
