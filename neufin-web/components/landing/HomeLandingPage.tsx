import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Brain, Check, Dna, MessageSquareQuote, Shield, X, Zap } from 'lucide-react'
import type { MarketRegime, ResearchNote } from '@/lib/api'
import { GlassCard } from '@/components/ui/GlassCard'
import LandingChatMount from '@/components/landing/LandingChatMount'

const REGIME_LABELS: Record<string, string> = {
  risk_on: 'Risk-On',
  risk_off: 'Risk-Off',
  stagflation: 'Stagflation',
  recovery: 'Recovery',
  recession_risk: 'Recession Risk',
}

function formatRegimeName(regime: string) {
  return REGIME_LABELS[regime] ?? regime.replace(/_/g, ' ')
}

function regimeTone(regime: string) {
  const r = regime.toLowerCase()
  if (r.includes('risk_off') || r.includes('recession') || r.includes('stagflation')) {
    return { dot: 'bg-risk', text: 'text-risk' }
  }
  if (r.includes('risk_on') || r.includes('recovery')) {
    return { dot: 'bg-positive', text: 'text-positive' }
  }
  return { dot: 'bg-warning', text: 'text-warning' }
}

function noteStripeClass(noteType?: string) {
  const u = (noteType ?? '').toUpperCase()
  if (u.includes('MACRO')) return 'bg-warning'
  if (u.includes('SECTOR')) return 'bg-primary'
  if (u.includes('REGIME')) return 'bg-risk'
  return 'bg-accent'
}

const DEMO_DNA = 78

export default function HomeLandingPage({
  regime,
  researchTeaser,
}: {
  regime: MarketRegime | null
  researchTeaser: ResearchNote[]
}) {
  const conf =
    typeof regime?.confidence === 'number' ? Math.max(0, Math.min(1, regime.confidence)) : null
  const confPct = conf !== null ? Math.round(conf * 100) : null
  const regimeLabel = regime ? formatRegimeName(regime.regime) : null
  const tone = regime ? regimeTone(regime.regime) : { dot: 'bg-muted-foreground', text: 'text-muted-foreground' }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/20 font-mono text-sm font-bold text-primary">
              N
            </div>
            <span className="font-mono text-sm font-bold tracking-widest text-primary">NEUFIN</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link
              href="/features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </Link>
            <Link
              href="/research"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Research
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="#api-platform"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              API
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign In
            </Link>
            <Link
              href="/upload"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* SECTION 1 — HERO */}
      <section className="relative min-h-screen overflow-hidden bg-background">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(30,184,204,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(30,184,204,0.04) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
            animation: 'grid-move-50 25s linear infinite',
          }}
        />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 pb-20 pt-24 lg:grid-cols-2">
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[11px] text-primary">
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary"
                style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
              />
              PRIVATE CAPITAL INTELLIGENCE
            </span>
            <h1 className="mb-5 font-sans text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
              <span className="block">
                The{' '}
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  decision cockpit
                </span>
              </span>
              <span className="block">for private capital.</span>
            </h1>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Portfolio monitoring, behavioral bias detection, and AI-powered IC memos. Built for PE analysts who move
              faster than Bloomberg.
            </p>
            <div className="mb-10 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
              <Link
                href="/upload"
                className="rounded-lg bg-primary px-6 py-3 text-center text-sm font-medium text-primary-foreground transition-all hover:scale-105 hover:bg-primary/90"
              >
                Start Free Analysis →
              </Link>
              <Link
                href="#api-platform"
                className="px-4 py-3 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Explore API Platform
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                MAS Aware
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                60s Analysis
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Brain className="h-3.5 w-3.5 shrink-0" />
                Behavioral AI
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="text-center">
                <p className="font-mono text-2xl font-bold tabular-nums text-foreground">2,400+</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolios Analyzed</p>
              </div>
              <div className="text-center">
                <p className="font-mono text-2xl font-bold tabular-nums text-foreground">$4.2B</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assets Tracked</p>
              </div>
              <div className="text-center">
                <p className="font-mono text-2xl font-bold tabular-nums text-foreground">60s</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Analysis Time</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-risk/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-positive/70" />
              <span className="flex-1 text-center font-mono text-[10px] text-muted-foreground/50">
                NEUFIN TERMINAL v1.0
              </span>
            </div>
            <div className="p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}
                  style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }}
                />
                <span className="font-mono text-[10px] text-muted-foreground">REGIME:</span>
                <span className={`font-mono text-[10px] font-bold ${tone.text}`}>
                  {regimeLabel ?? 'NO SIGNAL'}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {confPct !== null ? `${confPct}% conf` : '— conf'}
                </span>
              </div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                PORTFOLIO DNA SCORE
              </p>
              <div className="flex items-end gap-3">
                <span className="font-mono text-6xl font-bold tabular-nums text-foreground">{DEMO_DNA}</span>
                <span className="mb-2 self-end text-xl text-muted-foreground">/100</span>
              </div>
              <div className="mb-4 mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  style={
                    {
                      '--target-width': `${DEMO_DNA}%`,
                      animation: 'bar-fill 1.5s ease-out forwards',
                    } as CSSProperties
                  }
                />
              </div>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {[
                  { k: 'BETA', v: '0.82' },
                  { k: 'SHARPE', v: '1.24' },
                  { k: 'HHI', v: '0.34' },
                ].map((m) => (
                  <div key={m.k} className="rounded-lg bg-surface-2 p-2 text-center">
                    <p className="font-mono text-[9px] uppercase text-muted-foreground/60">{m.k}</p>
                    <p className="font-mono text-[13px] font-medium tabular-nums text-foreground">{m.v}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 p-3">
                <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  ⚠ Overconfidence detected. Recent strong performance may be masking concentration risk in 3 correlated
                  positions.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-warning/10 px-2 py-0.5 font-mono text-[9px] text-warning">
                  ANCHORING
                </span>
                <span className="rounded-full bg-risk/10 px-2 py-0.5 font-mono text-[9px] text-risk">
                  OVERCONFIDENCE
                </span>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] text-accent">HERD RISK</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 — PROBLEM / SOLUTION */}
      <section className="py-20">
        <div className="mx-auto mb-12 max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">
            Why PE teams are switching
            <br />
            <span className="text-foreground">
              from <span className="text-muted-foreground">legacy terminals</span>
            </span>
          </h2>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 md:grid-cols-2">
          <div className="rounded-xl border border-risk/20 bg-risk/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <X className="h-4 w-4 text-risk" strokeWidth={2} />
              <span className="text-risk">What you lose 6 hours a day to</span>
            </h3>
            <ul className="space-y-3">
              {[
                'Copying data between 4 systems to build one IC deck',
                'No visibility into behavioral bias in your own decisions',
                'Private portfolio companies invisible to market terminals',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-3 w-3 shrink-0 text-risk" strokeWidth={2} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-positive/20 bg-positive/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Check className="h-4 w-4 text-positive" strokeWidth={2} />
              <span className="text-positive">What you get instead</span>
            </h3>
            <ul className="space-y-3">
              {[
                'Portfolio DNA + IC memo in under 60 seconds',
                'Behavioral bias detection built into every decision view',
                'Public equities + private holdings in one normalized view',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-positive" strokeWidth={2} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* SECTION 3 — MARKET INTELLIGENCE */}
      <section className="border-y border-border/40 bg-surface/30 py-20">
        <p className="mb-2 text-center font-mono text-[11px] uppercase tracking-widest text-primary">
          LIVE MARKET INTELLIGENCE
        </p>
        <p className="mb-10 text-center text-muted-foreground">
          Our agents monitor 40+ macro signals continuously
        </p>
        <div className="mx-auto max-w-2xl px-6">
          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="font-mono text-4xl font-bold text-foreground">
              {regimeLabel ?? 'Awaiting regime signal'}
            </p>
            <div className="mt-4">
              <div className="mb-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>Confidence</span>
                <span>{confPct !== null ? `${confPct}%` : '—'}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  style={{ width: confPct !== null ? `${confPct}%` : '0%' }}
                />
              </div>
            </div>
            <p className="mt-3 font-mono text-[10px] text-muted-foreground/60">
              Last updated:{' '}
              {regime?.started_at
                ? new Date(regime.started_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-5xl px-6">
          {researchTeaser.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {researchTeaser.map((note) => {
                const stripe = noteStripeClass(note.note_type)
                const nconf = Math.round((note.confidence_score ?? 0) * 100)
                return (
                  <div
                    key={note.id}
                    className="relative overflow-hidden rounded-lg border border-border bg-surface p-4 pl-5 transition-colors hover:border-primary/20"
                  >
                    <div className={`absolute bottom-3 left-0 top-3 w-0.5 rounded-full ${stripe}`} aria-hidden />
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {(note.note_type ?? 'note').replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{nconf}% conf</span>
                    </div>
                    <h3 className="mb-1 mt-1.5 text-sm font-medium leading-snug text-foreground">{note.title}</h3>
                    <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                      {note.executive_summary}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {new Date(note.generated_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      <Link href={`/research/${note.id}`} className="cursor-pointer text-[11px] text-primary">
                        Read →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Research notes will appear here when the intelligence layer is live.
            </p>
          )}
          <div className="mt-8 text-center">
            <Link href="/research" className="text-sm font-medium text-primary hover:underline">
              View all research →
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 4 — API PLATFORM */}
      <section id="api-platform" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-bold text-foreground">Embed intelligence into your platform</h2>
          <p className="mt-2 text-center text-muted-foreground">Neufin as a behavioral intelligence API layer</p>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                icon: Dna,
                name: 'DNA Score API',
                desc: 'Portfolio DNA score and factor breakdown for any uploaded book.',
              },
              {
                icon: Brain,
                name: 'Behavioral Bias API',
                desc: 'Structured bias flags and severity scores for decision workflows.',
              },
              {
                icon: MessageSquareQuote,
                name: 'Regime Commentary API',
                desc: 'Macro regime classification with confidence and narrative hooks.',
              },
            ].map(({ icon: Icon, name, desc }) => (
              <div
                key={name}
                className="flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/30"
              >
                <Icon className="mb-3 h-8 w-8 text-primary" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold text-foreground">{name}</h3>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{desc}</p>
                <span className="mt-4 inline-flex w-fit rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Coming Q3 2026
                </span>
              </div>
            ))}
          </div>
          <pre className="mt-10 overflow-x-auto rounded-xl border border-border bg-surface-3 p-5 font-mono text-sm text-muted-foreground">
            {`{
  "dna_score": 78,
  "investor_type": "Growth-Oriented",
  "behavioral_flags": ["overconfidence", "anchoring"],
  "regime": "risk_off",
  "recommendation": "Reduce concentration in correlated positions"
}`}
          </pre>
        </div>
      </section>

      {/* SECTION 5 — PRICING */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-10 text-center text-3xl font-bold text-foreground">Pricing</h2>
          <div className="grid items-stretch gap-6 md:grid-cols-3">
            <GlassCard className="flex flex-col p-6">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Free</p>
              <p className="mb-1 font-display text-4xl text-foreground">$0</p>
              <p className="mb-6 text-sm text-muted-foreground">per month</p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-muted-foreground">
                {['3 DNA analyses', 'Basic behavioral report', 'CSV upload'].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/upload"
                className="block w-full rounded-xl border border-[var(--glass-border)] py-3 text-center text-sm text-foreground transition-colors hover:border-[var(--border-accent)]"
              >
                Start Free
              </Link>
            </GlassCard>

            <GlassCard className="relative flex flex-col border-[var(--border-accent)] p-6 shadow-[0_0_60px_-20px_rgba(245,166,35,0.45)]">
              <span className="absolute -top-3 right-4 rounded-full bg-[var(--amber)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--canvas)]">
                Most Popular
              </span>
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Advisor</p>
              <p className="mb-1 font-display text-4xl font-normal text-[var(--amber)]">$299</p>
              <p className="mb-6 text-sm text-muted-foreground">per month</p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-muted-foreground">
                {['Unlimited analyses', '10 advisor reports / mo', 'Multi-client workspace', 'API access'].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="block w-full rounded-xl bg-[var(--amber)] py-3 text-center text-sm font-semibold text-[var(--canvas)]"
              >
                Start 14-Day Free Trial
              </Link>
            </GlassCard>

            <GlassCard className="flex flex-col border-[var(--blue)]/35 p-6">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Enterprise</p>
              <p className="mb-1 font-display text-4xl text-foreground">$999</p>
              <p className="mb-2 text-sm text-muted-foreground">per month</p>
              <p className="mb-6 text-xs text-[var(--blue)]">Custom pricing available</p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-muted-foreground">
                {['Everything in Advisor', 'Unlimited reports', 'White-label', 'Dedicated support'].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact-sales"
                className="block w-full rounded-xl border border-[var(--blue)]/40 py-3 text-center text-sm text-foreground"
              >
                Contact Sales
              </Link>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* SECTION 6 — CTA FOOTER */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xl font-semibold text-foreground md:text-2xl">
            Start in 60 seconds. No Bloomberg subscription required.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/upload"
              className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Analyze My Portfolio Free
            </Link>
            <Link
              href="/contact-sales"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              Book a Demo
            </Link>
          </div>
          <p className="mx-auto mt-8 max-w-xl text-center text-[11px] leading-relaxed text-muted-foreground/50">
            NeuFin provides financial data and analysis tools for informational and educational purposes only. This is
            not financial advice. Past performance does not indicate future results. NeuFin aligns with MAS guidelines on
            fintech and data services.
          </p>
        </div>
      </section>

      <LandingChatMount />
    </div>
  )
}
