import Link from 'next/link'

export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-20"
      style={{ backgroundColor: 'var(--th-bg)' }}
    >
      {/* Hero */}
      <section className="flex flex-col items-center text-center mb-16 max-w-5xl w-full">
        <h1 className="th-gradient-text text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-tight">
          Thymatic Health
        </h1>
        <p
          className="text-lg max-w-lg mx-auto mb-10 leading-relaxed"
          style={{ color: 'var(--th-text-muted)' }}
        >
          AI-powered wellbeing coaching — real-time voice biomarkers, adaptive guidance, and movement scoring.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/session" className="th-btn-primary">
            Start Voice Session
          </Link>
          <Link href="/upload" className="th-btn-secondary">
            Analyse Movement
          </Link>
        </div>
      </section>

      {/* CTA cards */}
      <section
        className="flex flex-col md:flex-row gap-6 mb-14 w-full max-w-3xl"
        aria-label="Get started"
      >
        <CtaCard
          href="/session"
          title="Start Voice Session"
          description="Live AI coaching with real-time biomarker analysis and Sentinel safety monitoring."
          icon={<MicIcon />}
        />
        <CtaCard
          href="/upload"
          title="Analyse Movement"
          description="Upload a video to score your exercise form with MediaPipe pose detection."
          icon={<VideoIcon />}
        />
      </section>

      {/* Feature bento grid */}
      <section
        className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-3xl"
        aria-label="Features"
      >
        <FeatureCard
          icon={<BiomarkerIcon />}
          heading="Real-time Biomarkers"
          body="Sentinel-powered wellbeing analysis tracks emotional and physiological signals during conversation."
        />
        <FeatureCard
          icon={<VoiceIcon />}
          heading="Voice Intelligence"
          body="Speechmatics STT and Gemini Live deliver low-latency transcription and empathetic AI responses."
        />
        <FeatureCard
          icon={<ScoreIcon />}
          heading="Exercise Scoring"
          body="BlazePose detects joint angles frame-by-frame and scores your movement against clinical targets."
        />
      </section>
    </main>
  )
}

/* CTA card */
interface CtaCardProps {
  href: string
  title: string
  description: string
  icon: React.ReactNode
}

function CtaCard({ href, title, description, icon }: CtaCardProps) {
  return (
    <Link
      href={href}
      className="flex-1 th-card p-8 flex flex-col gap-4 cursor-pointer
                 transition-all duration-200 ease-in-out hover:scale-[1.02]
                 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-primary)]"
      style={{
        textDecoration: 'none',
        borderTop: '3px solid',
        borderImage: 'var(--th-gradient) 1',
      }}
    >
      <span
        className="w-12 h-12 flex items-center justify-center rounded-xl"
        style={{ background: 'var(--th-gradient-soft)', boxShadow: 'var(--th-shadow-in)' }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span
        className="text-lg font-semibold"
        style={{ color: 'var(--th-text)' }}
      >
        {title}
      </span>
      <span
        className="text-sm leading-relaxed"
        style={{ color: 'var(--th-text-muted)' }}
      >
        {description}
      </span>
      <span className="th-gradient-text text-sm font-bold mt-auto">
        Get started →
      </span>
    </Link>
  )
}

/* Feature card */
interface FeatureCardProps {
  icon: React.ReactNode
  heading: string
  body: string
}

function FeatureCard({ icon, heading, body }: FeatureCardProps) {
  return (
    <div className="th-card p-6 flex flex-col gap-3 cursor-default hover:scale-[1.01] transition-transform duration-200">
      <div
        className="w-12 h-12 flex items-center justify-center rounded-xl"
        style={{ background: 'var(--th-gradient-soft)', boxShadow: 'var(--th-shadow-in)' }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold" style={{ color: 'var(--th-text)' }}>
        {heading}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--th-text-muted)' }}>
        {body}
      </p>
    </div>
  )
}

/* SVG Icons */
function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="var(--th-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="var(--th-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

function BiomarkerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="var(--th-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function VoiceIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="var(--th-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function ScoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="var(--th-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
