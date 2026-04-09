import Link from 'next/link'
import { Brain, Check, CheckCircle, Dna, Globe, MessageSquareQuote, Shield, X } from 'lucide-react'
import type { MarketRegime, ResearchNote } from '@/lib/api'
import { GlassCard } from '@/components/ui/GlassCard'
import LandingNav from '@/components/landing/LandingNav'
import LandingMarketChatPanel from '@/components/landing/LandingMarketChatPanel'
import StockTickerMarquee from '@/components/landing/StockTickerMarquee'
import SwarmHeroTerminal from '@/components/landing/SwarmHeroTerminal'

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

/** API may return flat MarketRegime or nested `{ current: { regime, confidence, ... } }`. */
function normalizeRegime(regime: MarketRegime | null) {
  const r = regime as (MarketRegime & { current?: Partial<MarketRegime> }) | null
  const slug = (r?.current?.regime ?? r?.regime ?? '').toString().trim()
  const raw = r?.current?.confidence ?? r?.confidence
  let confidence: number | null = null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const x = raw > 1 ? raw / 100 : raw
    confidence = Math.max(0, Math.min(1, x))
  }
  const startedAt = r?.current?.started_at ?? r?.started_at
  return { slug, confidence, startedAt }
}

export default function HomeLandingPage({
  regime,
  researchTeaser,
}: {
  regime: MarketRegime | null
  researchTeaser: ResearchNote[]
}) {
  const { slug: regimeSlug, confidence: regimeConf, startedAt: regimeStartedAt } = normalizeRegime(regime)
  const confPct = regimeConf !== null ? Math.round(regimeConf * 100) : null
  const regimeLabel = regimeSlug ? formatRegimeName(regimeSlug) : null
  const tone = regimeSlug ? regimeTone(regimeSlug) : { dot: 'bg-muted-foreground', text: 'text-muted-foreground' }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <LandingNav />

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
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 pb-20 pt-28 sm:pt-32 md:pt-24 lg:grid-cols-2">
          <div>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[11px] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              AGENTIC PORTFOLIO INTELLIGENCE
            </span>

            <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-primary/80">
              7 AI Agents. IC-Grade Intelligence. 60 Seconds.
            </p>

            <h1 className="mb-4 font-sans text-5xl font-bold leading-[1.1] md:text-6xl">
              <span className="block">7 AI Agents.</span>
              <span className="block">One portfolio.</span>
              <span
                className="block"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Institutional clarity.
              </span>
            </h1>

            <p className="mb-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Upload your portfolio. Our swarm of 7 specialized AI agents analyzes market regime, behavioral biases, risk
              clusters, and alpha opportunities — delivering an IC-grade investment brief in 60 seconds. No Bloomberg
              subscription required.
            </p>

            <div className="mb-8 flex flex-wrap gap-6">
              <div className="flex flex-col">
                <span className="font-mono text-2xl font-bold tabular-nums text-risk">60s</span>
                <span className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  IC-grade portfolio brief, from CSV upload
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-2xl font-bold tabular-nums text-risk">47</span>
                <span className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Behavioral biases tracked per portfolio
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-2xl font-bold tabular-nums text-positive">7</span>
                <span className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Specialized AI agents running in parallel
                </span>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { k: '7 Specialized AI Agents', v: 'working in parallel on your portfolio' },
                { k: '47 Behavioral Biases Detected', v: 'including loss aversion, anchoring' },
                { k: 'IC-Grade Output', v: 'investment committee briefings in 60 seconds' },
              ].map((p) => (
                <div key={p.k} className="rounded-xl border border-border/60 bg-surface/60 p-3">
                  <p className="text-sm font-semibold text-foreground">{p.k}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{p.v}</p>
                </div>
              ))}
            </div>

            <div className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link
                href="/upload"
                className="rounded-lg bg-primary px-6 py-3 text-center text-sm font-medium text-primary-foreground transition-all hover:scale-105 hover:bg-primary/90"
              >
                Analyze My Portfolio Free →
              </Link>
              <Link
                href="#swarm-demo"
                className="px-4 py-3 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Watch Swarm Demo
              </Link>
            </div>

            <p className="mb-4 text-[11px] text-muted-foreground">
              In beta with advisors across SG, UAE & UK · Enterprise-grade security · info@neufin.ai
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle className="h-3 w-3 shrink-0 text-positive" />
                14-day free trial
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle className="h-3 w-3 shrink-0 text-positive" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Shield className="h-3 w-3 shrink-0 text-primary" />
                Enterprise-grade security
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Globe className="h-3 w-3 shrink-0 text-primary" />
                MAS · GDPR · MiFID II aligned
              </span>
            </div>
          </div>

          <SwarmHeroTerminal />
        </div>
      </section>

      <StockTickerMarquee />

      <section id="swarm-demo" className="relative scroll-mt-20 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-primary">AGENTIC AI SYSTEM</p>
            <h2 className="text-4xl font-bold text-foreground">
              7 AI agents working in parallel
              <br />
              on every portfolio decision.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Most platforms give you data. NeuFin gives you a team. Seven specialized AI agents run simultaneously the
              moment you upload your portfolio — each one an expert in its domain.
            </p>
          </div>

          {(() => {
            const agents = [
              {
                id: 'market_regime',
                name: 'MARKET REGIME',
                emoji: '🌍',
                tagline: 'Reads the macro environment',
                description:
                  'Monitors VIX, PMI, yield curve, and inflation signals via FRED API to classify the current market regime across 5 categories.',
                output: 'Current: Risk-Off · Confidence 82%',
                color: 'risk',
              },
              {
                id: 'strategist',
                name: 'STRATEGIST',
                emoji: '🧠',
                tagline: 'Turns macro into narrative',
                description:
                  'Synthesizes Finnhub news + FRED signals into a coherent macro narrative and positioning thesis for your specific holdings.',
                output: 'Defensive rotation recommended',
                color: 'warning',
              },
              {
                id: 'quant',
                name: 'QUANT',
                emoji: '📊',
                tagline: "Numbers don't lie",
                description:
                  'Computes HHI concentration, weighted beta across 6 data providers, Sharpe ratio, and correlation cluster analysis.',
                output: 'Sharpe 1.24 · Beta 0.82 · 3 clusters',
                color: 'primary',
              },
              {
                id: 'tax_arch',
                name: 'TAX ARCHITECT',
                emoji: '🏛️',
                tagline: 'Protects after-tax alpha',
                description:
                  'Calculates per-position CGT liability and after-tax alpha. Flags positions approaching long-term capital gains thresholds.',
                output: 'CGT exposure: $4,200',
                color: 'warning',
              },
              {
                id: 'risk_sentinel',
                name: 'RISK SENTINEL',
                emoji: '🛡️',
                tagline: 'Independent risk layer',
                description:
                  'Runs a completely independent risk assessment — not influenced by the other agents. Provides a second opinion on concentration and tail risk.',
                output: 'Risk: HIGH · Tech cluster 67%',
                color: 'risk',
              },
              {
                id: 'alpha_scout',
                name: 'ALPHA SCOUT',
                emoji: '⚡',
                tagline: "Finds what you're missing",
                description:
                  "Scans for alpha opportunities your current portfolio isn't capturing — sector rotations, momentum signals, and underweighted positions relative to regime.",
                output: '2 opportunities identified',
                color: 'positive',
              },
              {
                id: 'synthesizer',
                name: 'SYNTHESIZER',
                emoji: '✦',
                tagline: 'Produces the IC briefing',
                description:
                  'Aggregates all agent outputs into a single institutional-grade Investment Committee briefing — actionable, cited, and audit-ready.',
                output: 'IC Briefing → PDF ready',
                color: 'accent',
              },
            ] as const

            const colorVar = (c: string) => (['risk', 'warning', 'primary', 'positive', 'accent'].includes(c) ? c : 'primary')
            const borderHover = (c: string) => `hover:border-[hsl(var(--${colorVar(c)})/0.4)]`
            const pillText = (c: string) => `text-[hsl(var(--${colorVar(c)}))]`

            const firstRow = agents.slice(0, 4)
            const secondRow = agents.slice(4)

            const Card = (a: (typeof agents)[number]) => (
              <div
                key={a.id}
                className={[
                  'rounded-xl border border-border bg-surface p-5 transition-colors',
                  borderHover(a.color),
                ].join(' ')}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl leading-none" aria-hidden>
                    {a.emoji}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{a.name}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{a.tagline}</p>
                <p className="mb-3 mt-1 text-[12px] leading-relaxed text-muted-foreground">{a.description}</p>
                <span className={['inline-flex items-center rounded bg-surface-2 px-2 py-1 font-mono text-[10px]', pillText(a.color)].join(' ')}>
                  → {a.output}
                </span>
              </div>
            )

            return (
              <>
                <div className="mb-12">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {firstRow.map((a) => Card(a))}
                  </div>
                  <div className="mx-auto mt-4 max-w-5xl">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {secondRow.map((a) => Card(a))}
                    </div>
                  </div>
                </div>

                <div className="mx-auto mt-8 max-w-4xl">
                  <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                    <div className="w-full rounded-xl border border-border/60 border-dashed bg-surface/40 p-4 text-center md:w-[28%]">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your Portfolio CSV</p>
                    </div>

                    <div className="hidden h-px flex-1 bg-border/60 md:block" aria-hidden />
                    <div className="hidden text-muted-foreground/60 md:block" aria-hidden>
                      →
                    </div>
                    <div className="hidden h-px flex-1 bg-border/60 md:block" aria-hidden />

                    <div className="w-full rounded-xl border border-border/60 bg-surface p-4 text-center md:w-[44%]">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">7 Agents</p>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {['primary', 'accent', 'warning', 'risk', 'positive', 'primary', 'accent'].map((c, i) => (
                          <span
                            key={`${c}-${i}`}
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: `hsl(var(--${c}))` }}
                            aria-hidden
                          />
                        ))}
                      </div>
                      <p className="mt-3 text-[11px] text-muted-foreground">in parallel</p>
                    </div>

                    <div className="hidden h-px flex-1 bg-border/60 md:block" aria-hidden />
                    <div className="hidden text-muted-foreground/60 md:block" aria-hidden>
                      →
                    </div>
                    <div className="hidden h-px flex-1 bg-border/60 md:block" aria-hidden />

                    <div className="w-full rounded-xl border border-primary/40 bg-primary/5 p-4 text-center md:w-[28%]">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-primary">IC-Grade Briefing</p>
                    </div>
                  </div>

                  <p className="mt-4 text-center text-sm text-muted-foreground">⚡ Average analysis time: 60 seconds</p>
                </div>

                <div className="mt-12 text-center">
                  <h3 className="text-2xl font-bold text-foreground">Ready to see your agents work?</h3>
                  <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                      href="/upload"
                      className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:scale-105 hover:bg-primary/90"
                    >
                      Upload Portfolio — It&apos;s Free
                    </Link>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">No account required for your first analysis</p>
                </div>
              </>
            )
          })()}
        </div>
      </section>

      {/* SECTION 2 — PROBLEM / SOLUTION */}
      <section className="py-20">
        <div className="mx-auto mb-12 max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">Why advisors and PE teams choose to switch</h2>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 md:grid-cols-2">
          <div className="rounded-xl border border-risk/20 bg-risk/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <X className="h-4 w-4 text-risk" strokeWidth={2} />
              <span className="text-risk">What you're losing right now</span>
            </h3>
            <ul className="space-y-3">
              {[
                '3 hours building one quarterly client report — manually',
                "No behavioral explanation when clients ask 'why is my portfolio down?'",
                'Losing clients to robo-advisors who charge 0.25% vs your 1% AUM fee',
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
                "Portfolio DNA brief in 60 seconds — branded with your name, not NeuFin's",
                "Behavioral bias detection: 'Your client shows Overconfidence — here's the dollar impact'",
                'IC-grade output that justifies your advisory fee vs any robo-competitor',
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
      <section className="py-20">
        <div className="mx-auto mb-12 max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">Why B2B platforms choose NeuFin over building in-house</h2>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 md:grid-cols-2">
          <div className="rounded-xl border border-risk/20 bg-risk/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <X className="h-4 w-4 text-risk" strokeWidth={2} />
              <span className="text-risk">What your engineering team quotes you</span>
            </h3>
            <ul className="space-y-3">
              {[
                '6–12 months to build a behavioral intelligence layer',
                '3 engineers, $200K+ in development cost',
                'Churn spikes 15–25% every market correction with no intervention tool',
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
              <span className="text-positive">What you get with NeuFin API</span>
            </h3>
            <ul className="space-y-3">
              {[
                'REST API integration in a weekend — not 6 months',
                'DNA Score + behavioral bias flags per user portfolio',
                'Churn risk detection before users panic-sell',
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

      {/* Multi-Region Compliance */}
      <section className="border-y border-border/40 bg-surface/20 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-primary">REGULATORY FRAMEWORK</p>
            <h2 className="text-2xl font-bold text-foreground">Compliance Across Every Market We Operate</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Neufin is built for global institutional deployment with jurisdiction-specific compliance frameworks.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                flag: '🇸🇬',
                region: 'Singapore',
                regulatory: 'MAS (Monetary Authority of Singapore)',
                items: ['Capital Markets Services regime awareness'],
                status: { label: 'Active', tone: 'bg-positive/10 text-positive border-positive/30' },
              },
              {
                flag: '🇲🇾',
                region: 'Malaysia',
                regulatory: 'Securities Commission Malaysia (SC)',
                items: ['CMSA compliance framework'],
                status: { label: 'Active', tone: 'bg-positive/10 text-positive border-positive/30' },
              },
              {
                flag: '🇹🇭',
                region: 'Thailand',
                regulatory: 'SEC Thailand oversight',
                items: ['Investment Advisory Act alignment'],
                status: { label: 'Launching 2026', tone: 'bg-warning/10 text-warning border-warning/30' },
              },
              {
                flag: '🇻🇳',
                region: 'Vietnam',
                regulatory: 'SSC (State Securities Commission)',
                items: ['Securities Law 2019 framework'],
                status: { label: 'Launching 2026', tone: 'bg-warning/10 text-warning border-warning/30' },
              },
              {
                flag: '🇦🇪',
                region: 'UAE',
                regulatory: 'ADGM / DFSA regulatory framework',
                items: ['FinTech permission alignment'],
                status: { label: 'Active', tone: 'bg-positive/10 text-positive border-positive/30' },
              },
              {
                flag: '🇪🇺',
                region: 'European Union / Estonia HQ',
                regulatory: 'GDPR compliance (full)',
                items: ['MiFID II awareness', 'ESMA regulatory alignment', 'Neufin OÜ registered entity'],
                status: { label: 'Active', tone: 'bg-positive/10 text-positive border-positive/30' },
              },
              {
                flag: '🇺🇸',
                region: 'United States',
                regulatory: 'SEC Reg S-P, FINRA 4512 alignment',
                items: ['SOC 2 Type II in preparation', 'CCPA aligned', 'Registered office: USA'],
                status: { label: 'Active', tone: 'bg-positive/10 text-positive border-positive/30' },
              },
            ].map((c) => (
              <div key={c.region} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none" aria-hidden>
                      {c.flag}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.region}</p>
                      <p className="mt-1 font-mono text-[11px] text-primary">{c.regulatory}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${c.status.tone}`}>
                    {c.status.label}
                  </span>
                </div>

                <ul className="mt-4 space-y-2">
                  {c.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
              {regimeStartedAt
                ? new Date(regimeStartedAt).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-5xl px-6">
          {researchTeaser.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {researchTeaser
                .filter((note): note is ResearchNote => Boolean(note?.id))
                .map((note) => {
                  const stripe = noteStripeClass(note?.note_type)
                  const nconf = Math.round((note?.confidence_score ?? 0) * 100)
                  const genAt = note?.generated_at
                  return (
                    <div
                      key={note.id}
                      className="relative overflow-hidden rounded-lg border border-border bg-surface p-4 pl-5 transition-colors hover:border-primary/20"
                    >
                      <div className={`absolute bottom-3 left-0 top-3 w-0.5 rounded-full ${stripe}`} aria-hidden />
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          {(note?.note_type ?? 'note').replace(/_/g, ' ')}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{nconf}% conf</span>
                      </div>
                      <h3 className="mb-1 mt-1.5 text-sm font-medium leading-snug text-foreground">
                        {note?.title ?? 'Untitled'}
                      </h3>
                      <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                        {note?.executive_summary ?? ''}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {genAt
                            ? new Date(genAt).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })
                            : '—'}
                        </span>
                        <Link
                          href={`/research/${note.id}`}
                          className="cursor-pointer text-[11px] text-primary"
                        >
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
          <h2 className="text-center text-3xl font-bold text-foreground">Embed behavioral intelligence into your platform</h2>
          <p className="mt-2 text-center text-muted-foreground">
            Three API endpoints. One weekend integration. No behavioral layer to build.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                icon: Dna,
                name: 'DNA Score API',
                desc: 'DNA Score (0–100) + behavioral archetype + top bias flags for any portfolio CSV.',
              },
              {
                icon: Brain,
                name: 'Behavioral Bias API',
                desc: '47 behavioral bias flags with severity scores and dollar impact per position.',
              },
              {
                icon: MessageSquareQuote,
                name: 'Regime Commentary API',
                desc: 'Live macro regime (Risk-On / Risk-Off / Neutral) with natural-language commentary.',
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
                {[
                  'Unlimited portfolio analyses',
                  'Unlimited advisor client briefs (white-label PDF)',
                  'Multi-client workspace',
                  'Behavioral bias reports per client',
                  'API access (3 endpoints)',
                ].map((f) => (
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
                {[
                  'Everything in Advisor',
                  'Unlimited reports + white-label output',
                  'API embed for your platform (portal / reporting / CRM layer)',
                  'Revenue share model available',
                  'Dedicated integration support + SLA',
                ].map((f) => (
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

      <LandingMarketChatPanel />

      {/* SECTION 6 — CTA FOOTER */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xl font-semibold text-foreground md:text-2xl">
            IC-grade portfolio intelligence in 60 seconds. No Bloomberg. No analyst. No waiting.
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
          <div className="mt-8 border-t border-border/40 pt-6">
            <div className="grid grid-cols-1 gap-4 text-[11px] text-muted-foreground/60 md:grid-cols-2">
              <div className="text-left">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40">
                  REGISTERED ENTITIES
                </p>
                <p>Neufin OÜ — Registered in Estonia (EU) · HQ</p>
                <p>Neufin Inc. — Registered Office, United States</p>
                <p>Singapore · Malaysia · UAE · Thailand · Vietnam (Coming 2026)</p>
              </div>
              <div className="text-left md:text-right">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40">LEGAL</p>
                <p>© 2026 Neufin OÜ. All rights reserved.</p>
                <p>A unit of CTech Ventures</p>
                <p>info@neufin.ai · www.neufin.ai</p>
              </div>
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground/40">
              NeuFin provides financial data and portfolio analysis tools for informational purposes only. This is not
              investment advice, and no output from NeuFin constitutes a recommendation to buy, sell, or hold any
              security. Past performance does not indicate future results. NeuFin OÜ is registered in Estonia (EU).
              NeuFin aligns with MAS guidelines on fintech and data services.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
