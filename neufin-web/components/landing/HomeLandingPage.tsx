import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  Code2,
  Cpu,
  FileText,
  Layers,
  LineChart,
  Lock,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import type { MarketRegime, ResearchNote } from '@/lib/api'
import { GlassCard } from '@/components/ui/GlassCard'
import LandingNav from '@/components/landing/LandingNav'
import Footer from '@/components/landing/Footer'

const TRUST_LOGOS = ['Polygon', 'Anthropic', 'Supabase'] as const

const VALUE_CARDS = [
  {
    icon: Cpu,
    title: 'Seven-agent swarm',
    line: 'Parallel specialist models on every upload — macro, quant, risk, tax, alpha, and synthesis.',
  },
  {
    icon: LineChart,
    title: 'IC-grade output',
    line: 'Structured briefings with scores, citations, and next actions — not generic chat paragraphs.',
  },
  {
    icon: Shield,
    title: 'Built for compliance',
    line: 'Designed for regulated contexts: encryption, audit-friendly flows, and jurisdiction-aware defaults.',
  },
  {
    icon: Zap,
    title: 'Seconds, not weeks',
    line: 'From CSV to committee-ready narrative in about a minute — no terminals or analyst bench.',
  },
] as const

const STEPS = [
  { n: '01', title: 'Upload', desc: 'Drop a positions CSV. No setup wizard.' },
  { n: '02', title: 'Analyze', desc: 'Seven agents score regime, risk, bias, and tax in parallel.' },
  { n: '03', title: 'Deliver', desc: 'Export an IC-style PDF or wire results into your stack.' },
] as const

const AGENTS = [
  { mono: 'MR', label: 'Macro regime' },
  { mono: 'PS', label: 'Strategist' },
  { mono: 'QA', label: 'Quant' },
  { mono: 'TX', label: 'Tax' },
  { mono: 'RS', label: 'Risk' },
  { mono: 'AS', label: 'Alpha' },
  { mono: 'IC', label: 'Synthesis' },
] as const

const TESTIMONIALS = [
  {
    quote:
      'We replaced a three-day reporting cycle with a single upload. Clients finally see bias and concentration in one view.',
    name: 'Private wealth desk',
    role: 'Singapore',
  },
  {
    quote:
      'The API fits our robo stack without a science project. DNA score and flags land next to our existing risk tiles.',
    name: 'Platform engineering lead',
    role: 'EU fintech',
  },
  {
    quote:
      'Output reads like an internal memo — which is exactly what compliance and IC reviewers expect.',
    name: 'CIO office',
    role: 'Advisory, UAE',
  },
] as const

function SectionShell({
  id,
  className = '',
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`border-t border-border/50 py-section first:border-t-0 ${className}`.trim()}
    >
      <div className="mx-auto max-w-7xl px-6">{children}</div>
    </section>
  )
}

function HeroProductPreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-[0_24px_80px_-20px_rgba(15,23,42,0.12)]">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-2 text-xs font-medium text-muted-foreground">NeuFin · Portfolio cockpit</span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        {[
          { label: 'DNA score', value: '78', sub: 'vs. peer median 64' },
          { label: 'Regime', value: 'Risk-off', sub: 'Confidence 82%' },
          { label: 'Top risk', value: 'Tech cluster', sub: '67% correlated sleeve' },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-border/80 bg-background px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className="mt-1 font-finance text-2xl font-semibold tabular-nums text-foreground">{k.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 bg-surface-2/80 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Holdings vs. benchmark</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Live</span>
        </div>
        <div className="flex h-36 items-end gap-1.5">
          {[40, 62, 48, 70, 55, 78, 52, 68, 44, 72, 58, 80].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/25 to-primary/5"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SwarmDiagram() {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {AGENTS.map((a) => (
          <div
            key={a.mono}
            className="flex w-[calc(50%-0.25rem)] flex-col items-center rounded-lg border border-border bg-surface px-2 py-2.5 text-center shadow-sm sm:w-auto sm:min-w-[4.75rem]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
              {a.mono}
            </span>
            <span className="mt-1 text-sm font-medium leading-tight text-muted-foreground">{a.label}</span>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-5 py-2 text-sm font-semibold text-primary">
        <Layers className="h-4 w-4" aria-hidden />
        Converges to IC briefing
      </div>
    </div>
  )
}

function ReportPreviewMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border bg-surface-2 px-6 py-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Investment committee memorandum</p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">Portfolio review — confidential</h3>
        <p className="mt-1 text-sm text-muted-foreground">Prepared by NeuFin swarm · DNA score 78 · Risk-off regime</p>
      </div>
      <div className="space-y-5 px-6 py-6 text-sm leading-relaxed text-muted-foreground">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Executive summary</p>
          <p className="mt-2">
            Concentration and behavioral bias materially increase drawdown risk relative to stated risk tolerance.
            Defensive rotation and tax-aware harvesting are recommended before next rebalance.
          </p>
        </div>
        <div className="grid gap-4 border-y border-border/60 py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Key metrics</p>
            <ul className="mt-2 space-y-1.5 font-mono text-xs">
              <li className="flex justify-between border-b border-border/40 py-1">
                <span>HHI concentration</span>
                <span className="text-foreground">0.34</span>
              </li>
              <li className="flex justify-between border-b border-border/40 py-1">
                <span>Portfolio beta</span>
                <span className="text-foreground">0.82</span>
              </li>
              <li className="flex justify-between py-1">
                <span>Sharpe (12m)</span>
                <span className="text-foreground">1.24</span>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Bias flags</p>
            <ul className="mt-2 space-y-1.5 text-xs">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                Overconfidence — 3 positions
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-risk" />
                Loss aversion — overweight defensives
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Anchoring — stale cost basis references
              </li>
            </ul>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Recommendations</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>Reduce correlated technology sleeve from 42% to under 30%.</li>
            <li>Harvest losses in two names before year-end; estimated tax alpha $4.2k.</li>
            <li>Re-test allocation against risk-off stress scenario next quarter.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function formatRegimeName(regime: string) {
  const map: Record<string, string> = {
    risk_on: 'Risk-on',
    risk_off: 'Risk-off',
    stagflation: 'Stagflation',
    recovery: 'Recovery',
    recession_risk: 'Recession risk',
  }
  return map[regime] ?? regime.replace(/_/g, ' ')
}

function normalizeRegime(regime: MarketRegime | null) {
  const r = regime as (MarketRegime & { current?: Partial<MarketRegime> }) | null
  const slug = (r?.current?.regime ?? r?.regime ?? '').toString().trim()
  const raw = r?.current?.confidence ?? r?.confidence
  let confidence: number | null = null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const x = raw > 1 ? raw / 100 : raw
    confidence = Math.max(0, Math.min(1, x))
  }
  return { slug, confidence }
}

export default function HomeLandingPage({
  regime,
  researchTeaser,
}: {
  regime: MarketRegime | null
  researchTeaser: ResearchNote[]
}) {
  const { slug: regimeSlug, confidence: regimeConf } = normalizeRegime(regime)
  const confPct = regimeConf !== null ? Math.round(regimeConf * 100) : null
  const regimeLabel = regimeSlug ? formatRegimeName(regimeSlug) : null
  const teaser = researchTeaser.filter((n): n is ResearchNote => Boolean(n?.id)).slice(0, 2)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <LandingNav />

      <main className="flex-1">
        {/* 1 — Hero */}
        <section className="border-b border-border/40 bg-surface py-section-hero">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-16">
            <div>
              <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Institutional portfolio intelligence</p>
              <h1 className="max-w-[20ch] text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
                IC-grade briefings from a single CSV upload.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                NeuFin runs seven specialized agents on every portfolio — regime, quant, risk, tax, alpha, and synthesis
                — so advisors and platforms can ship committee-ready output without a research bench.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/upload" className="btn-primary inline-flex justify-center px-8 py-3 text-base">
                  Analyze a portfolio
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={2} />
                </Link>
                <Link href="/pricing" className="btn-secondary inline-flex justify-center px-8 py-3 text-base">
                  View pricing
                </Link>
              </div>
              <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-primary" />
                  Encrypted uploads
                </span>
                <span className="hidden sm:inline text-border" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  Built for advisors &amp; platforms
                </span>
              </p>
            </div>
            <HeroProductPreview />
          </div>
        </section>

        {/* 2 — Trust */}
        <SectionShell className="bg-background">
          <p className="text-center text-sm font-medium text-muted-foreground">Trusted by investors and advisors</p>
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {TRUST_LOGOS.map((name) => (
              <span
                key={name}
                className="text-lg font-semibold tracking-tight text-muted-foreground/70 transition-colors hover:text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </SectionShell>

        {/* 3 — Value grid */}
        <SectionShell className="bg-surface/50">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Why teams standardize on NeuFin</h2>
            <p className="mt-3 text-muted-foreground">One platform for analysis, narrative, and API delivery — aligned to how ICs actually work.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE_CARDS.map(({ icon: Icon, title, line }) => (
              <div
                key={title}
                className="flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{line}</p>
              </div>
            ))}
          </div>
        </SectionShell>

        {/* 4 — How it works */}
        <SectionShell id="how-it-works" className="scroll-mt-24 bg-background">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">How the seven-agent swarm runs</h2>
            <p className="mt-3 text-muted-foreground">A fixed pipeline from file to committee memo — observable, repeatable, auditable.</p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-xl border border-border bg-surface p-6 text-left shadow-sm">
                <span className="font-mono text-xs font-bold text-primary">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-14">
            <SwarmDiagram />
          </div>
          <div className="mt-10 text-center">
            <Link href="/upload" className="text-sm font-semibold text-primary hover:underline">
              Run a sample analysis
              <ArrowRight className="ml-1 inline h-4 w-4 align-text-bottom" />
            </Link>
          </div>
        </SectionShell>

        {/* 5 — Product preview */}
        <SectionShell className="bg-surface/50">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Product preview</h2>
            <p className="mt-3 text-muted-foreground">
              Cockpit metrics, regime context, and narrative — designed to drop into advisor workflows.
            </p>
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <HeroProductPreview />
              {(regimeLabel || teaser.length > 0) && (
                <div className="flex flex-wrap gap-3">
                  {regimeLabel ? (
                    <div className="rounded-lg border border-border bg-surface px-4 py-2 text-sm">
                      <span className="text-muted-foreground">Regime · </span>
                      <span className="font-medium text-foreground">{regimeLabel}</span>
                      {confPct !== null ? (
                        <span className="text-muted-foreground"> · {confPct}% confidence</span>
                      ) : null}
                    </div>
                  ) : null}
                  {teaser.map((note) => (
                    <Link
                      key={note.id}
                      href={`/research/${note.id}`}
                      className="rounded-lg border border-border bg-surface px-4 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="font-medium text-foreground">{note.title ?? 'Research note'}</span>
                      <span className="ml-2 text-muted-foreground">→</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Holdings snapshot</span>
                <BarChart3 className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="space-y-2 font-mono text-xs">
                {['AAPL 18%', 'MSFT 14%', 'NVDA 11%', 'Cash 8%', 'Other 49%'].map((row) => (
                  <div key={row} className="flex justify-between border-b border-border/50 py-2 last:border-0">
                    <span className="text-muted-foreground">{row.split(' ')[0]}</span>
                    <span className="text-foreground">{row.split(' ')[1]}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Illustrative weights · not investment advice.</p>
            </div>
          </div>
        </SectionShell>

        {/* 6 — Report */}
        <SectionShell className="bg-background">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">IC-grade report layout</h2>
            <p className="mt-3 text-muted-foreground">
              The same sections your committee expects: summary, metrics, behavioral flags, and clear recommendations.
            </p>
          </div>
          <div className="mx-auto mt-12 max-w-3xl">
            <ReportPreviewMock />
          </div>
        </SectionShell>

        {/* 7 — API */}
        <SectionShell id="api" className="scroll-mt-24 bg-surface/50">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Plug into advisors and robo platforms</h2>
            <p className="mt-3 text-muted-foreground">
              REST endpoints for DNA scores, behavioral flags, and regime commentary — white-label friendly, JSON in, PDF
              or JSON out.
            </p>
          </div>
          <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-start">
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <Code2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">DNA Score API</strong> — score, archetype, and top bias flags for any
                  uploaded portfolio.
                </span>
              </li>
              <li className="flex gap-3">
                <Brain className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">Behavioral API</strong> — structured severity and dollar-impact hints
                  per position.
                </span>
              </li>
              <li className="flex gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">Reporting</strong> — generate IC-style PDFs from the same pipeline your
                  advisors use in-product.
                </span>
              </li>
            </ul>
            <pre className="overflow-x-auto rounded-xl border border-border bg-surface-2 p-5 font-mono text-xs leading-relaxed text-muted-foreground shadow-inner sm:text-sm">
              {`POST /api/portfolio/analyze
Content-Type: multipart/form-data

{
  "dna_score": 78,
  "investor_type": "Defensive allocator",
  "regime": "risk_off",
  "flags": ["overconfidence", "anchoring"]
}`}
            </pre>
          </div>
          <div className="mt-8 text-center">
            <Link href="/partners" className="text-sm font-semibold text-primary hover:underline">
              Partner &amp; API documentation
              <ArrowRight className="ml-1 inline h-4 w-4 align-text-bottom" />
            </Link>
          </div>
        </SectionShell>

        {/* 8 — Pricing */}
        <SectionShell className="bg-background">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Pricing</h2>
            <p className="mt-3 text-muted-foreground">Transparent tiers — upgrade when you are ready to automate distribution.</p>
          </div>
          <div className="mt-12 grid items-stretch gap-6 md:grid-cols-3">
            <GlassCard className="flex flex-col rounded-xl border border-border bg-surface p-7 shadow-sm">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground">Free</p>
              <p className="font-finance text-4xl font-bold text-foreground">$0</p>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">per month</p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-muted-foreground">
                {['3 DNA analyses', 'Basic behavioral report', 'CSV upload'].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/upload" className="btn-secondary block w-full py-3 text-center text-sm font-semibold">
                Start free
              </Link>
            </GlassCard>

            <GlassCard className="relative flex flex-col rounded-xl border-2 border-primary bg-surface p-7 shadow-sm">
              <span className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
                Popular
              </span>
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground">Advisor</p>
              <p className="font-finance text-4xl font-bold text-primary">$299</p>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">per month</p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-muted-foreground">
                {[
                  'Unlimited portfolio analyses',
                  'White-label PDF briefs',
                  'Multi-client workspace',
                  'API access (3 endpoints)',
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/pricing" className="btn-primary block w-full py-3 text-center text-sm font-semibold">
                Start 14-day trial
              </Link>
            </GlassCard>

            <GlassCard className="flex flex-col rounded-xl border border-border bg-surface p-7 shadow-sm">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground">Enterprise</p>
              <p className="font-finance text-4xl font-bold text-foreground">$999</p>
              <p className="mb-1 mt-1 text-sm text-muted-foreground">per month</p>
              <p className="mb-6 text-xs text-primary">Custom pricing available</p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-muted-foreground">
                {[
                  'Everything in Advisor',
                  'Platform embed and SLA',
                  'Dedicated integration support',
                  'Revenue-share options',
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/contact-sales" className="btn-secondary block w-full py-3 text-center text-sm font-semibold">
                Contact sales
              </Link>
            </GlassCard>
          </div>
        </SectionShell>

        {/* 9 — Social proof */}
        <SectionShell className="bg-surface/50">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">What teams say</h2>
            <p className="mt-3 text-muted-foreground">Representative feedback from design partners and early deployments.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <blockquote
                key={t.name}
                className="flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm"
              >
                <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
                <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-6 border-t border-border/60 pt-4 text-sm">
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="text-muted-foreground">{t.role}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </SectionShell>
      </main>

      <Footer />
    </div>
  )
}
