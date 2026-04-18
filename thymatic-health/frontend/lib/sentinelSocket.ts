/**
 * sentinelSocket.ts — backend WebSocket client for the Sentinel bridge.
 *
 * Opens a WebSocket to /session/{sessionId}/audio, forwards PCM frames and
 * transcript strings, and surfaces incoming policy_result events via callback.
 */

export type PolicyResultEvent = { type: "policy_result"; result: unknown };
export interface TranscriptSendOptions {
  turnComplete?: boolean;
}

const READY_TIMEOUT_MS = 25_000;

export interface SentinelSocketHandle {
  /**
   * Resolves when the server finishes Sentinel setup and sends
   * `{ type: "status", status: "connected" }` (not merely when the socket opens).
   * Rejects on timeout, WebSocket error/close before that, or server `{ type: "error" }`.
   */
  ready: Promise<void>;
  /** True if the WebSocket is open (safe to send). */
  isOpen: () => boolean;
  /** Send a chunk of raw PCM16 audio (as Int16Array). */
  sendPcm: (pcm: Int16Array) => void;
  /** Send a finalised transcript string. */
  sendTranscript: (text: string, options?: TranscriptSendOptions) => boolean;
  /** Send a manual turn-complete signal, optionally with buffered transcript text. */
  sendTurnComplete: (text?: string) => boolean;
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
    /** Fired when the WebSocket closes (including after a healthy session). */
    onClose?: () => void;
    /** Server `{ type: "error" }` after the session is already connected (e.g. Gemini bridge crashed). */
    onBridgeError?: (message: string) => void;
  }
): SentinelSocketHandle {
  const url = `${opts.backendUrl}/session/${sessionId}/audio`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  let readySettled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearReadyTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  let resolveReady!: () => void;
  let rejectReady!: (err: Error) => void;

  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;

    timer = setTimeout(() => {
      if (readySettled) return;
      readySettled = true;
      clearReadyTimer();
      rejectReady(new Error("Timed out waiting for Sentinel to finish connecting on the server."));
    }, READY_TIMEOUT_MS);

    ws.addEventListener("error", () => {
      if (readySettled) return;
      readySettled = true;
      clearReadyTimer();
      rejectReady(new Error("Sentinel WebSocket error (is the backend URL correct?)."));
    });

    ws.addEventListener("close", () => {
      if (!readySettled) {
        readySettled = true;
        clearReadyTimer();
        rejectReady(
          new Error(
            "Sentinel connection closed before the server reported ready — check backend logs, THYMIA_API_KEY, and GOOGLE_API_KEY.",
          ),
        );
      }
      opts.onClose?.();
    });
  });

  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;

    let data: unknown;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }

    const msg = data as { type: string; [k: string]: unknown };

    if (msg.type === "error") {
      const message = typeof msg.message === "string" ? msg.message : "Session error from server";
      if (!readySettled) {
        readySettled = true;
        clearReadyTimer();
        rejectReady(new Error(message));
      } else {
        opts.onBridgeError?.(message);
      }
      return;
    }

    if (msg.type === "status" && msg.status === "connected") {
      if (!readySettled) {
        readySettled = true;
        clearReadyTimer();
        resolveReady();
      }
      opts.onStatus?.(msg.status as string);
      return;
    }

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
    ready,

    isOpen: () => ws.readyState === WebSocket.OPEN,

    sendPcm(pcm: Int16Array): void {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(pcm.buffer);
    },

    sendTranscript(text: string, options?: TranscriptSendOptions): boolean {
      if (ws.readyState !== WebSocket.OPEN) return false;
      ws.send(
        JSON.stringify({
          type: "transcript",
          text,
          ...(options?.turnComplete ? { turn_complete: true } : {}),
        })
      );
      return true;
    },

    sendTurnComplete(text?: string): boolean {
      if (ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify({ type: "turn_complete", text }));
      return true;
    },

    close: () => {
      ws.close();
    },
  };
}
