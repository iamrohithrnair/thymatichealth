"use client";

/**
 * SentinelBadges — displays the last N Sentinel policy-result events.
 * Soft UI Evolution design with vivid level colours and gradient confidence pills.
 */

import { useStore } from "@/lib/store";

interface Classification {
  level?: number;
  alert?: string;
  confidence?: string;
}

interface SafetyResult {
  type?: string;
  classification?: Classification;
  recommended_actions?: Record<string, unknown>;
}

interface SentinelEventShape {
  policy?: string;
  policy_name?: string;
  result?: SafetyResult | Record<string, unknown>;
  ts?: number;
}

function isHighConfidence(confidence?: string): boolean {
  return confidence === "high";
}

function levelLabel(level?: number): string {
  if (level === undefined) return "";
  if (level >= 3) return "L3";
  if (level >= 2) return "L2";
  if (level >= 1) return "L1";
  return "L0";
}

function levelDot(level?: number): string {
  if (level === undefined) return "#A5B4FC";
  if (level >= 3) return "#EF4444";  // red
  if (level >= 2) return "#F97316";  // orange
  if (level >= 1) return "#F59E0B";  // amber
  return "#10B981";                   // emerald
}

export default function SentinelBadges() {
  const sentinelEvents = useStore((s) => s.sentinelEvents);

  if (sentinelEvents.length === 0) {
    return (
      <div
        className="text-xs italic px-3 py-2 rounded-xl"
        style={{ color: 'var(--th-text-muted)' }}
      >
        No Sentinel events yet
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 p-1">
      {sentinelEvents.map((ev, idx) => {
        const raw = ev as unknown as SentinelEventShape;
        const policyName = raw.policy_name ?? raw.policy ?? "Wellbeing";
        const result = (raw.result ?? {}) as SafetyResult;
        const classification = result.classification;
        const actions = result.recommended_actions ?? {};
        const actionKeys = Object.keys(actions).filter(
          (k) => actions[k] !== null && actions[k] !== undefined
        );
        const highConf = isHighConfidence(classification?.confidence);

        return (
          <div
            key={idx}
            className="th-card px-3 py-2 rounded-xl flex flex-col gap-1 transition-all duration-200 ease-in-out"
            style={{
              border: highConf
                ? '1.5px solid var(--th-primary)'
                : '1.5px solid transparent',
              minWidth: 120,
            }}
          >
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: levelDot(classification?.level) }}
                aria-hidden="true"
              />
              <span
                className="text-xs font-semibold capitalize"
                style={{ color: 'var(--th-text)' }}
              >
                {policyName.replace(/_/g, " ")}
              </span>

              {classification?.level !== undefined && (
                <span
                  className="th-card-inset text-xs font-bold px-1.5 py-0.5 rounded-lg"
                  style={{ color: levelDot(classification.level) }}
                >
                  {levelLabel(classification.level)}
                </span>
              )}
            </div>

            {/* Confidence pill */}
            {classification?.confidence && (
              <span
                className="text-xs px-2 py-0.5 rounded-full self-start font-medium"
                style={
                  highConf
                    ? {
                        background: 'var(--th-gradient)',
                        color: '#fff',
                      }
                    : {
                        color: 'var(--th-text-muted)',
                        border: '1px solid transparent',
                      }
                }
              >
                {classification.confidence}
              </span>
            )}

            {/* Alert */}
            {classification?.alert && (
              <p className="text-xs" style={{ color: 'var(--th-text-muted)' }}>
                {classification.alert}
              </p>
            )}

            {/* Action tags */}
            {actionKeys.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {actionKeys.map((key) => (
                  <span
                    key={key}
                    className="th-card-inset text-xs px-1.5 py-0.5 rounded-lg"
                    style={{ color: 'var(--th-text-muted)' }}
                  >
                    {key}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
