import { create } from "zustand";

interface SentinelEvent {
  policy: string;
  result: unknown;
  ts: number;
}

interface AppStore {
  // --- existing fields ---
  sessionId: string | null;
  transcripts: string[];
  pendingTurnSegments: string[];
  sentinelEvents: SentinelEvent[];
  setSessionId: (id: string | null) => void;
  addTranscript: (line: string) => void;
  addPendingTurnSegment: (text: string) => void;
  addSentTranscriptTurn: (text: string) => void;
  addSentinelEvent: (event: SentinelEvent) => void;
  clearPendingTurn: () => void;

  // --- W1.A additions ---
  /** Latest in-progress partial transcript (replaced on each partial event) */
  partialTranscript: string;
  /** Latest microphone RMS level, normalised 0–1 */
  micRms: number;
  setPartialTranscript: (text: string) => void;
  setMicRms: (rms: number) => void;
  resetSessionState: () => void;

  // --- Session mode ---
  /** 'manual': user must click Send Captured Turn; 'live': finals auto-send */
  sessionMode: 'manual' | 'live';
  setSessionMode: (mode: 'manual' | 'live') => void;
}

export const useStore = create<AppStore>((set) => ({
  // existing state
  sessionId: null,
  transcripts: [],
  pendingTurnSegments: [],
  sentinelEvents: [],
  setSessionId: (id) => set({ sessionId: id }),
  addTranscript: (line) =>
    set((s) => ({ transcripts: [...s.transcripts, line] })),
  addPendingTurnSegment: (text) =>
    set((s) => {
      const next = text.trim()
      if (!next || s.pendingTurnSegments[s.pendingTurnSegments.length - 1] === next) {
        return {}
      }
      return {
        pendingTurnSegments: [...s.pendingTurnSegments, next],
        partialTranscript: "",
      }
    }),
  addSentTranscriptTurn: (text) =>
    set((s) => ({
      transcripts: [...s.transcripts, text],
      pendingTurnSegments: [],
      partialTranscript: "",
    })),
  addSentinelEvent: (event) =>
    set((s) => {
      const next = [...s.sentinelEvents, event];
      return { sentinelEvents: next.length > 20 ? next.slice(-20) : next };
    }),
  clearPendingTurn: () => set({ pendingTurnSegments: [], partialTranscript: "" }),

  // W1.A additions
  partialTranscript: "",
  micRms: 0,
  setPartialTranscript: (text) => set({ partialTranscript: text }),
  setMicRms: (rms) => set({ micRms: rms }),
  resetSessionState: () =>
    set({
      sessionId: null,
      transcripts: [],
      pendingTurnSegments: [],
      sentinelEvents: [],
      partialTranscript: "",
      micRms: 0,
    }),

  // Session mode
  sessionMode: 'manual',
  setSessionMode: (mode) => set({ sessionMode: mode }),
}));
