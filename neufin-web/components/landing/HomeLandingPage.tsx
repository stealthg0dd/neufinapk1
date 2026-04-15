'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { MarketRegime, ResearchNote } from '@/lib/api'
import { GraphicPlaceholder } from '@/components/GraphicPlaceholder'

const SWARM_AGENTS = [
  {
    id: 'MR',
    name: 'Macro Intelligence',
    color: '#0EA5E9',
    desc: 'Classifies market regime from FRED CPI, VIX, PMI, and yield curve — every decision is regime-aware.',
    status: 'Risk-Off · 82% confidence',
  },
  {
    id: 'PS',
    name: 'Portfolio Strategist',
    color: '#8B5CF6',
    desc: 'Converts macro signals into an actionable positioning thesis for your exact holdings.',
    status: 'Defensive rotation recommended',
  },
  {
    id: 'QA',
    name: 'Quantitative Analysis',
    color: '#1EB8CC',
    desc: 'Pearson correlation clusters, weighted beta, HHI concentration, Sharpe ratio — pure mathematics.',
    status: 'Sharpe 1.24 · Beta 0.82',
  },
  {
    id: 'TO',
    name: 'Tax Optimisation',
    color: '#22C55E',
    desc: 'Per-position CGT liability and tax-loss harvesting before year-end to protect after-tax alpha.',
    status: 'CGT exposure: $4,200',
  },
  {
    id: 'RR',
    name: 'Risk Sentinel',
    color: '#EF4444',
    desc: 'Independent second opinion on tail risk, concentration, and drawdown — not influenced by other agents.',
    status: 'Risk: HIGH · Tech cluster 67%',
  },
  {
    id: 'AD',
    name: 'Alpha Discovery',
    color: '#F5A623',
    desc: 'Live regime-aware scan for sector rotations and momentum signals missing from your portfolio.',
    status: '2 opportunities identified',
  },
  {
    id: 'IC',
    name: 'IC Synthesis',
    color: '#0F172A',
    desc: 'Aggregates all agents into one audit-quality Investment Committee memo, white-labeled and PDF-ready.',
    status: 'Briefing ready → PDF',
  },
] as const

const FREE_FEATURES = ['3 DNA analyses', 'Basic behavioral report', 'CSV upload'] as const
const ADVISOR_FEATURES = [
  'Unlimited portfolio analyses',
  'White-label PDF briefs',
  'Multi-client workspace',
  'API access (3 endpoints)',
] as const
const ENTERPRISE_FEATURES = [
  'Everything in Advisor',
  'Platform embed and SLA',
  'Dedicated integration support',
  'Revenue-share options',
] as const

const JURISDICTIONS = [
  {
    name: 'European Union',
    entity: 'Neufin OÜ — Estonia',
    status: 'active' as const,
    detail: 'GDPR-compliant processing, EU data residency options.',
  },
  {
    name: 'United States',
    entity: 'Neufin Inc.',
    status: 'active' as const,
    detail: 'SOC 2 Type II in progress; state privacy frameworks supported.',
  },
  {
    name: 'Singapore',
    entity: 'MAS-aligned workflows',
    status: 'launching' as const,
    detail: 'IC memos and audit trails mapped to advisor conduct expectations.',
  },
  {
    name: 'UAE · Malaysia',
    entity: 'Regional expansion',
    status: 'launching' as const,
    detail: 'Jurisdiction-specific disclosures on roadmap.',
  },
] as const

function CountUp({ end, suffix = '' }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        let start = 0
        const steps = 40
        const step = end / steps
        timerRef.current = setInterval(() => {
          start += step
          if (start >= end) {
            setCount(end)
            if (timerRef.current) clearInterval(timerRef.current)
            timerRef.current = null
          } else {
            setCount(Math.floor(start))
          }
        }, 30)
      },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => {
      obs.disconnect()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [end])

  return (
    <span ref={ref} className="tabular-nums">
      {count}
      {suffix}
    </span>
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
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    fn()
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const { slug: regimeSlug, confidence: regimeConf } = normalizeRegime(regime)
  const confPct = regimeConf !== null ? Math.round(regimeConf * 100) : null
  const regimeLabel = regimeSlug ? formatRegimeName(regimeSlug) : null
  const teaser = researchTeaser.filter((n): n is ResearchNote => Boolean(n?.id)).slice(0, 2)

  const navLinks = [
    { label: 'Features', href: '/features' },
    { label: 'Research', href: '/research' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Partners', href: '/partners' },
    { label: 'API', href: '/developer' },
  ] as const

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#334155]">
      <nav
        className={`fixed inset-x-0 top-0 z-50 h-16 transition-all duration-300 ${
          scrolled ? 'border-b border-[#E2E8F0] bg-white shadow-sm' : 'bg-white/80 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex-shrink-0">
            <Image src="/logo.png" alt="NeuFin" width={120} height={32} className="h-8 w-auto" priority />
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="text-sm font-medium text-[#475569] transition-colors hover:text-[#1EB8CC]"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-[#475569] transition-colors hover:text-[#0F172A] md:block"
            >
              Sign In
            </Link>
            <Link
              href="/upload"
              className="rounded-lg bg-[#1EB8CC] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-[#158A99] hover:shadow-md"
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative flex min-h-screen items-center overflow-hidden bg-white pt-16">
          <div
            className="pointer-events-none absolute right-1/4 top-1/4 h-[600px] w-[600px] rounded-full bg-[#1EB8CC]/5 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-1/4 left-1/4 h-[400px] w-[400px] rounded-full bg-[#8B5CF6]/4 blur-3xl"
            aria-hidden
          />

          <div className="relative mx-auto max-w-7xl px-6 py-24">
            <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
              <div className="min-w-0 max-w-4xl">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-[#1EB8CC]/30 bg-[#E0F7FA] px-4 py-2"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1EB8CC] opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#1EB8CC]" />
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-[#1EB8CC]">
                  Live · Portfolio Intelligence
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="mb-6 font-bold leading-[1.08] tracking-[-0.04em] text-[#0F172A]"
                style={{ fontSize: 'clamp(40px, 5.5vw, 68px)' }}
              >
                7 AI agents.
                <br />
                One portfolio.
                <br />
                <span className="text-[#1EB8CC]">60 seconds.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-10 max-w-xl text-[18px] leading-[1.75] text-[#475569]"
              >
                Upload your portfolio. Our 7-agent AI swarm delivers a complete Investment Committee briefing — behavioral
                biases, regime analysis, tax recommendations, alpha signals, and a white-labeled IC memo.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mb-14 flex flex-wrap gap-4"
              >
                <Link
                  href="/upload"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[#1EB8CC] px-8 py-4 text-[15px] font-semibold text-white shadow-[0_4px_24px_rgba(30,184,204,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#158A99] hover:shadow-[0_6px_32px_rgba(30,184,204,0.5)]"
                >
                  Analyze My Portfolio Free
                  <svg
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="#demo"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-8 py-4 text-[15px] font-semibold text-[#334155] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1EB8CC] hover:text-[#1EB8CC]"
                >
                  Watch 60-second demo
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.45 }}
                className="flex flex-wrap items-center gap-6 text-sm text-[#64748B]"
              >
                {['14-day free trial', 'No credit card required', 'MAS · GDPR · MiFID II aligned', 'SOC 2 in progress'].map(
                  (t, i) => (
                    <span key={i} className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#22C55E]" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t}
                    </span>
                  )
                )}
              </motion.div>
              </div>

              <div className="relative hidden lg:block">
                <div
                  className="absolute inset-0 scale-95 rounded-3xl bg-[#1EB8CC]/10 blur-3xl"
                  aria-hidden
                />
                <div className="relative overflow-hidden rounded-2xl border border-[#1EB8CC]/20 shadow-2xl shadow-[#1EB8CC]/10">
                  <GraphicPlaceholder
                    src="/graphics/hero-dashboard-mockup.png"
                    alt="NeuFin Dashboard"
                    width={1200}
                    height={750}
                    className="h-auto w-full"
                    label="Dashboard Preview — Add hero-dashboard-mockup.png to public/graphics/"
                  />
                </div>
                <div className="glass-card-light absolute -bottom-5 -left-5 px-4 py-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DCFCE7]">
                      <svg className="h-4 w-4 text-[#16A34A]" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#0F172A]">IC Briefing Ready</p>
                      <p className="text-xs text-[#64748B]">Generated in 58 seconds</p>
                    </div>
                  </div>
                </div>
                <div className="glass-card-light absolute -right-4 -top-4 px-3 py-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#F5A623]" />
                    <p className="text-xs font-semibold text-[#0F172A]">Regime: Risk-Off</p>
                    <span className="badge badge-warning text-xs">82%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="border-y border-[#E2E8F0] bg-[#F8FAFC] py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {(
                [
                  { value: 60, suffix: 's', label: 'IC briefing delivered' },
                  { value: 7, suffix: '', label: 'Specialized AI agents' },
                  { value: 47, suffix: '', label: 'Behavioral biases tracked' },
                  { value: 100, suffix: '%', label: 'White-labeled output' },
                ] as const
              ).map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="text-center"
                >
                  <div className="mb-2 text-[44px] font-bold leading-none tracking-tight text-[#0F172A]">
                    <CountUp end={s.value} suffix={s.suffix} />
                  </div>
                  <div className="text-[14px] font-medium text-[#64748B]">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Seven agents */}
        <section className="relative bg-white py-24" id="demo">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <GraphicPlaceholder
              src="/graphics/ai-agents-visualization.png"
              alt=""
              width={500}
              height={500}
              className="absolute right-0 top-1/2 w-[500px] -translate-y-1/2 rounded-3xl opacity-10"
              label="Agent visualization — Add ai-agents-visualization.png to public/graphics/"
            />
          </div>
          <div className="relative mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#1EB8CC]"
              >
                Agentic AI System
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 }}
                className="mb-4 font-bold leading-tight tracking-tight text-[#0F172A]"
                style={{ fontSize: 'clamp(28px, 3.5vw, 44px)' }}
              >
                Seven specialists. One Investment Committee.
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.12 }}
                className="mx-auto max-w-2xl text-[17px] leading-relaxed text-[#475569]"
              >
                Most platforms give you data. NeuFin gives you a complete IC — seven agents running simultaneously the moment
                you upload your portfolio.
              </motion.p>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {SWARM_AGENTS.slice(0, 4).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.07 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="cursor-default rounded-2xl border border-[#E2E8F0] bg-white p-6 transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
                >
                  <div
                    className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black tracking-wide text-white"
                    style={{ background: a.color }}
                  >
                    {a.id}
                  </div>
                  <h3 className="mb-2 text-[15px] font-semibold leading-snug text-[#0F172A]">{a.name}</h3>
                  <p className="mb-5 text-sm leading-[1.65] text-[#64748B]">{a.desc}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#22C55E]" />
                    <span className="text-sm font-semibold text-[#16A34A]">{a.status}</span>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-3">
              {SWARM_AGENTS.slice(4).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: (i + 4) * 0.07 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="cursor-default rounded-2xl border border-[#E2E8F0] bg-white p-6 transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
                >
                  <div
                    className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black text-white"
                    style={{ background: a.color }}
                  >
                    {a.id}
                  </div>
                  <h3 className="mb-2 text-[15px] font-semibold text-[#0F172A]">{a.name}</h3>
                  <p className="mb-5 text-sm leading-[1.65] text-[#64748B]">{a.desc}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                    <span className="text-sm font-semibold text-[#16A34A]">{a.status}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-16 text-center">
              <Link
                href="/upload"
                className="inline-flex items-center gap-3 rounded-xl bg-[#0F172A] px-10 py-4 text-[15px] font-semibold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1E293B] hover:shadow-xl"
              >
                Upload Portfolio — It&apos;s Free
                <span className="font-bold text-[#1EB8CC]">→</span>
              </Link>
              <p className="mt-3 text-sm text-[#94A3B8]">No account required · Results in 60 seconds</p>
            </div>
          </div>
        </section>

        {/* Value proposition */}
        <section className="bg-[#F8FAFC] py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 items-center gap-20 lg:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55 }}
              >
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#1EB8CC]">For Advisors</p>
                <h2
                  className="mb-6 font-bold leading-tight tracking-tight text-[#0F172A]"
                  style={{ fontSize: 'clamp(24px, 2.8vw, 36px)' }}
                >
                  Stop spending 3 hours on a report your client reads in 3 minutes.
                </h2>
                <div className="space-y-3">
                  {(
                    [
                      [
                        '3 hours building a quarterly report manually',
                        'IC-grade brief in 60 seconds, white-labeled with your branding',
                      ],
                      [
                        'No explanation when clients ask why they underperformed',
                        'Behavioral bias detection with quantified dollar impact per position',
                      ],
                      [
                        'Robo-advisors at 0.25% AUM undercutting your fee',
                        'Demonstrate IC-level analysis that justifies your 1% advisory fee',
                      ],
                    ] as const
                  ).map(([prob, sol], i) => (
                    <div key={i} className="flex gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5">
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#22C55E]">
                        <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="mb-1 text-sm text-[#94A3B8] line-through">{prob}</p>
                        <p className="text-[14px] font-medium text-[#0F172A]">{sol}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: 0.1 }}
              >
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#8B5CF6]">For Platforms</p>
                <h2
                  className="mb-6 font-bold leading-tight tracking-tight text-[#0F172A]"
                  style={{ fontSize: 'clamp(24px, 2.8vw, 36px)' }}
                >
                  One weekend integration, not six months of engineering.
                </h2>
                <div className="space-y-3">
                  {(
                    [
                      [
                        '6–12 months to build behavioral intelligence in-house',
                        'REST API integration in a single weekend — 3 endpoints',
                      ],
                      [
                        '$200K+ in development before your first client',
                        'DNA score and 47 bias flags per portfolio, out of the box',
                      ],
                      [
                        'Client churn spikes 15–25% in every market correction',
                        'Churn risk detected before clients panic-sell — automated',
                      ],
                    ] as const
                  ).map(([prob, sol], i) => (
                    <div key={i} className="flex gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5">
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#8B5CF6]">
                        <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="mb-1 text-sm text-[#94A3B8] line-through">{prob}</p>
                        <p className="text-[14px] font-medium text-[#0F172A]">{sol}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Pricing — data and hrefs preserved */}
        <section className="bg-white py-24" id="pricing">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 font-bold tracking-tight text-[#0F172A]" style={{ fontSize: 'clamp(28px, 3vw, 42px)' }}>
                Simple, transparent pricing
              </h2>
              <p className="text-[17px] text-[#475569]">Start free. Scale as your practice grows.</p>
            </div>

            <div className="mx-auto grid max-w-5xl grid-cols-1 items-stretch gap-6 md:grid-cols-3">
              <div className="flex flex-col rounded-2xl border border-[#E2E8F0] bg-white p-8">
                <div>
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[#64748B]">Free</p>
                  <div className="mb-2 flex items-baseline gap-1">
                    <span className="text-[52px] font-bold leading-none tracking-tight text-[#0F172A]">$0</span>
                    <span className="text-sm text-[#64748B]">/month</span>
                  </div>
                  <p className="mb-8 text-sm text-[#94A3B8]">Start with the basics</p>
                  <ul className="mb-6 flex-1 space-y-3">
                    {FREE_FEATURES.map((f) => (
                      <li key={f} className="flex gap-2 text-[14px] text-[#334155]">
                        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22C55E]" strokeWidth={2.25} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto pt-6">
                  <Link
                    href="/upload"
                    className="block w-full rounded-xl border-2 border-[#E2E8F0] py-3.5 text-center text-[14px] font-semibold text-[#0F172A] transition-all duration-200 hover:border-[#1EB8CC]"
                  >
                    Start Free
                  </Link>
                </div>
              </div>

              <div className="relative flex flex-col rounded-2xl bg-[#0F172A] p-8 shadow-[0_20px_60px_rgba(15,23,42,0.3)] ring-2 ring-[#1EB8CC]">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#1EB8CC] px-5 py-1.5 text-xs font-bold uppercase tracking-widest text-white shadow-sm">
                    Most Popular
                  </span>
                </div>
                <div>
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[#1EB8CC]">Advisor</p>
                  <div className="mb-2 flex items-baseline gap-1">
                    <span className="text-[52px] font-bold leading-none tracking-tight text-white">$299</span>
                    <span className="text-sm text-slate-400">/month</span>
                  </div>
                  <p className="mb-8 text-sm text-slate-400">For professional advisors</p>
                  <ul className="mb-6 flex-1 space-y-3">
                    {ADVISOR_FEATURES.map((f) => (
                      <li key={f} className="flex gap-2 text-[14px] text-slate-300">
                        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#1EB8CC]" strokeWidth={2.25} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto pt-6">
                  <Link
                    href="/pricing"
                    className="block w-full rounded-xl bg-[#1EB8CC] py-3.5 text-center text-[14px] font-semibold text-white shadow-[0_4px_20px_rgba(30,184,204,0.4)] transition-all duration-200 hover:bg-[#158A99]"
                  >
                    Start 14-Day Free Trial
                  </Link>
                </div>
              </div>

              <div className="flex flex-col rounded-2xl border border-[#E2E8F0] bg-white p-8">
                <div>
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[#64748B]">Enterprise</p>
                  <div className="mb-2 flex items-baseline gap-1">
                    <span className="text-[52px] font-bold leading-none tracking-tight text-[#0F172A]">$999</span>
                    <span className="text-sm text-[#64748B]">/month</span>
                  </div>
                  <p className="mb-1 text-sm text-[#94A3B8]">For platforms and institutions</p>
                  <p className="mb-8 text-sm font-medium text-[#1EB8CC]">Custom pricing available</p>
                  <ul className="mb-6 flex-1 space-y-3">
                    {ENTERPRISE_FEATURES.map((f) => (
                      <li key={f} className="flex gap-2 text-[14px] text-[#334155]">
                        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22C55E]" strokeWidth={2.25} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto pt-6">
                  <Link
                    href="/contact-sales"
                    className="block w-full rounded-xl bg-[#0F172A] py-3.5 text-center text-[14px] font-semibold text-white transition-all duration-200 hover:bg-[#1E293B]"
                  >
                    Contact Sales
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live market intelligence — regime + research teaser preserved */}
        <section className="bg-[#0F172A] py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-[#1EB8CC]">Live Market Intelligence</p>
              <h2 className="mb-2 text-[30px] font-bold text-white">Real-time regime monitoring</h2>
              <p className="text-[14px] text-slate-400">Our agents monitor 40+ macro signals continuously</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Current regime</p>
                {regimeLabel ? (
                  <>
                    <p className="mt-2 text-[20px] font-bold text-white">{regimeLabel}</p>
                    {confPct !== null ? (
                      <p className="mt-2 text-[14px] text-slate-300">Confidence · {confPct}%</p>
                    ) : (
                      <p className="mt-2 text-[14px] text-slate-300">Confidence data loading from research desk.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-[14px] text-slate-300">
                    Regime feed connects when market data services are available. Upload a portfolio for full swarm context.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Latest research</p>
                {teaser.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {teaser.map((note) => (
                      <li key={note.id}>
                        <Link
                          href={`/research/${note.id}`}
                          className="text-[15px] font-medium text-white transition-colors hover:text-[#1EB8CC]"
                        >
                          {note.title ?? 'Research note'}
                          <span className="ml-2 text-slate-400">→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[14px] text-slate-300">
                    <Link href="/research" className="font-medium text-[#1EB8CC] hover:underline">
                      Browse the research hub
                    </Link>{' '}
                    for regime and portfolio commentary.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Regulatory */}
        <section className="bg-[#F8FAFC] py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-10 text-center">
              <h2 className="text-[clamp(22px,2.5vw,28px)] font-bold text-[#0F172A]">Regulatory footprint</h2>
              <p className="mt-2 text-[15px] text-[#64748B]">Entities and posture we disclose to partners and committees.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {JURISDICTIONS.map((j) => (
                <div key={j.name} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-[#0F172A]">{j.name}</p>
                    <span
                      className={
                        j.status === 'active'
                          ? 'rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#16A34A]'
                          : 'rounded-full bg-[#FEF9C3] px-2 py-0.5 text-xs font-semibold text-[#854D0E]'
                      }
                    >
                      {j.status === 'active' ? 'Active' : 'Launching'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#475569]">{j.entity}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#64748B]">{j.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0F172A]">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-12 grid grid-cols-2 gap-12 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <Image src="/logo.png" alt="NeuFin" width={120} height={32} className="mb-5 h-8 w-auto brightness-0 invert" />
              <p className="mb-4 text-sm leading-[1.7] text-slate-400">
                Institutional-grade portfolio intelligence for advisors, IFAs, and wealth platforms. Built for the people who
                cannot afford to get it wrong.
              </p>
              <a href="mailto:info@neufin.ai" className="text-sm text-[#1EB8CC] hover:underline">
                info@neufin.ai
              </a>
            </div>

            {(
              [
                {
                  heading: 'Product',
                  links: [
                    { l: 'Features', href: '/features' },
                    { l: 'Pricing', href: '/pricing' },
                    { l: 'Partners', href: '/partners' },
                    { l: 'Research', href: '/research' },
                    { l: 'API Docs', href: '/developer' },
                  ],
                },
                {
                  heading: 'Legal',
                  links: [
                    { l: 'Privacy Policy', href: '/privacy' },
                    { l: 'Terms of Service', href: '/terms-and-conditions' },
                    { l: 'Contact Sales', href: '/contact-sales' },
                  ],
                },
                {
                  heading: 'Entities',
                  links: [
                    { l: 'Neufin OÜ — Estonia HQ', href: '#' },
                    { l: 'Neufin Inc. — United States', href: '#' },
                    { l: 'Singapore · UAE · Malaysia', href: '#' },
                  ],
                },
              ] as const
            ).map((col) => (
              <div key={col.heading}>
                <p className="mb-5 text-xs font-bold uppercase tracking-widest text-slate-400">{col.heading}</p>
                <div className="space-y-3">
                  {col.links.map(({ l, href }) => (
                    <Link
                      key={l}
                      href={href}
                      className="block text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {l}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-5 border-t border-white/10 pt-8 md:flex-row">
            <p className="text-xs text-slate-500">© 2026 Neufin OÜ. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-3">
              {['MAS Aligned', 'GDPR Compliant', 'MiFID II Aware', 'SOC 2 In Progress'].map((b) => (
                <span key={b} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-500">
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
