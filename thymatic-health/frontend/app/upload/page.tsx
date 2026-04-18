"use client";

import { useState } from "react";
import ScoreCard from "@/components/ScoreCard";
import Link from "next/link";

const JOINTS = [
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
] as const;

type Joint = (typeof JOINTS)[number];

interface AnalysisFrame {
  frame: number;
  observed: number;
  deviation: number;
  score: number;
}

interface AnalysisMeta {
  frames_detected: number;
  smoothness: number;
  min_angle: number;
  max_angle: number;
  mean_angle: number;
}

interface AnalysisResult {
  summary: AnalysisFrame[];
  meta: AnalysisMeta;
  warning?: string;
}

interface ScoreResult {
  score: number;
  feedback: string;
}

interface CombinedResult {
  analysis: AnalysisResult;
  scoreResult: ScoreResult;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [joint, setJoint] = useState<Joint>("left_knee");
  const [target, setTarget] = useState<number>(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CombinedResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Please select a video file.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("joint", joint);
      formData.append("target", String(target));

      const analyseRes = await fetch(`${API_BASE}/video/analyse`, {
        method: "POST",
        body: formData,
      });

      if (!analyseRes.ok) {
        const msg = await analyseRes.text();
        throw new Error(`Video analysis failed: ${msg}`);
      }

      const analysis: AnalysisResult = await analyseRes.json();

      const firstFrame = analysis.summary?.[0];
      const observedAngle = firstFrame?.observed ?? 0;

      const scoreRes = await fetch(`${API_BASE}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          angles: [{ joint, target, observed: observedAngle }],
        }),
      });

      if (!scoreRes.ok) {
        const msg = await scoreRes.text();
        throw new Error(`Scoring failed: ${msg}`);
      }

      const scoreResult: ScoreResult = await scoreRes.json();
      setResult({ analysis, scoreResult });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen px-4 py-12"
      style={{ backgroundColor: "var(--th-bg)" }}
    >
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        {/* Page header */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-medium cursor-pointer transition-all duration-200 ease-in-out hover:opacity-70
                       focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-primary)]"
            style={{ color: "var(--th-primary)" }}
            aria-label="Back to home"
          >
            ← Home
          </Link>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--th-text)" }}
          >
            Movement Analysis
          </h1>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="th-card p-6 flex flex-col gap-5"
          noValidate
        >
          {/* Video file */}
          <FormField label="Video file" htmlFor="video-file">
            <div className="th-card-inset px-4 py-3">
              <input
                id="video-file"
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm cursor-pointer
                           file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0
                           file:text-sm file:font-semibold file:cursor-pointer
                           file:transition-all file:duration-200 file:ease-in-out
                           file:bg-[var(--th-gradient-soft)] file:text-[var(--th-primary)]"
                style={{ color: "var(--th-text-muted)" }}
              />
            </div>
          </FormField>

          {/* Joint selector */}
          <FormField label="Joint" htmlFor="joint-select">
            <div className="th-card-inset overflow-hidden">
              <select
                id="joint-select"
                value={joint}
                onChange={(e) => setJoint(e.target.value as Joint)}
                className="w-full px-4 py-2.5 text-sm bg-transparent border-none
                           focus:outline-none cursor-pointer"
                style={{ color: "var(--th-text)" }}
              >
                {JOINTS.map((j) => (
                  <option key={j} value={j}>
                    {j.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </FormField>

          {/* Target angle */}
          <FormField label="Target angle (°)" htmlFor="target-angle">
            <div className="th-card-inset overflow-hidden">
              <input
                id="target-angle"
                type="number"
                min={0}
                max={180}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="w-full px-4 py-2.5 text-sm bg-transparent border-none
                           focus:outline-none"
                style={{ color: "var(--th-text)" }}
              />
            </div>
          </FormField>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="th-btn-primary w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:transform-none"
            aria-busy={loading}
          >
            {loading ? "Analysing…" : "Analyse movement"}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div
            className="th-card-inset px-4 py-3 text-sm"
            style={{
              color: '#EF4444',
              border: '1px solid rgba(239,68,68,0.27)',
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <ScoreCard
            score={result.scoreResult.score}
            feedback={result.scoreResult.feedback}
            meta={result.analysis.meta}
            warning={result.analysis.warning}
          />
        )}
      </div>
    </main>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--th-primary)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
