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
  sentinelEvents: SentinelEvent[];
  setSessionId: (id: string) => void;
  addTranscript: (line: string) => void;
  addSentinelEvent: (event: SentinelEvent) => void;

  // --- W1.A additions ---
  /** Latest in-progress partial transcript (replaced on each partial event) */
  partialTranscript: string;
  /** Latest microphone RMS level, normalised 0–1 */
  micRms: number;
  addFinalTranscript: (text: string) => void;
  setPartialTranscript: (text: string) => void;
  setMicRms: (rms: number) => void;
}

export const useStore = create<AppStore>((set) => ({
  // existing state
  sessionId: null,
  transcripts: [],
  sentinelEvents: [],
  setSessionId: (id) => set({ sessionId: id }),
  addTranscript: (line) =>
    set((s) => ({ transcripts: [...s.transcripts, line] })),
  addSentinelEvent: (event) =>
    set((s) => {
      const next = [...s.sentinelEvents, event];
      return { sentinelEvents: next.length > 20 ? next.slice(-20) : next };
    }),

  // W1.A additions
  partialTranscript: "",
  micRms: 0,
  addFinalTranscript: (text) =>
    set((s) => ({ transcripts: [...s.transcripts, text], partialTranscript: "" })),
  setPartialTranscript: (text) => set({ partialTranscript: text }),
  setMicRms: (rms) => set({ micRms: rms }),
}));
