interface ScoreCardProps {
  score: number;
  feedback: string;
  meta: {
    frames_detected: number;
    smoothness: number;
    min_angle: number;
    max_angle: number;
    mean_angle: number;
  };
  warning?: string;
}

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function ScoreCard({ score, feedback, meta, warning }: ScoreCardProps) {
  const clampedScore = Math.max(0, Math.min(10, score));
  const dashOffset = RING_CIRCUMFERENCE * (1 - clampedScore / 10);

  const scoreColor =
    clampedScore >= 8
      ? 'var(--th-cta)'   // emerald
      : clampedScore >= 6
      ? '#F59E0B'          // amber
      : '#EF4444';         // red

  const isHighScore = clampedScore >= 8;

  return (
    <div className="th-card p-6 flex flex-col gap-5">
      {/* Score ring + number */}
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0" style={{ width: 112, height: 112 }}>
          <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
            {/* Track */}
            <circle
              cx="56"
              cy="56"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="8"
              style={{ stroke: 'var(--th-primary)', opacity: 0.15 }}
            />
            {/* Progress */}
            <circle
              cx="56"
              cy="56"
              r={RING_RADIUS}
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 56 56)"
              style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
            />
          </svg>
          {/* Centred score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={isHighScore ? 'th-gradient-text text-3xl font-bold leading-none' : 'text-3xl font-bold leading-none'}
              style={isHighScore ? {} : { color: scoreColor }}
            >
              {clampedScore.toFixed(1)}
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--th-text-muted)' }}>
              / 10
            </span>
          </div>
        </div>

        {/* Feedback */}
        <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--th-text)' }}>
          {feedback}
        </p>
      </div>

      {/* Warning */}
      {warning && (
        <div
          className="th-card-inset px-4 py-3 text-sm"
          style={{
            color: '#D97706',
            border: '1px solid rgba(245,158,11,0.3)',
          }}
        >
          {warning}
        </div>
      )}

      {/* Meta grid */}
      <div className="th-card-inset p-4 grid grid-cols-2 gap-3">
        <MetaItem label="Frames detected" value={String(meta.frames_detected)} />
        <MetaItem
          label="Smoothness"
          value={`${(meta.smoothness * 100).toFixed(1)}%`}
        />
        <MetaItem label="Mean angle" value={`${meta.mean_angle.toFixed(1)}°`} />
        <MetaItem
          label="Range"
          value={`${meta.min_angle.toFixed(1)}° – ${meta.max_angle.toFixed(1)}°`}
        />
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--th-text-muted)' }}>
        {label}
      </dt>
      <dd className="text-sm font-semibold" style={{ color: 'var(--th-text)' }}>
        {value}
      </dd>
    </div>
  );
}
