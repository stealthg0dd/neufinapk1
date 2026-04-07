'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Dna, Network, BarChart3, Shield, Lock, Sparkles, Zap } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { GlassCard } from '@/components/ui/GlassCard'
import { HeroPortfolioDemo } from '@/components/landing/HeroPortfolioDemo'
import GlobalChatWidget from '@/components/GlobalChatWidget'
import type { MarketRegime, ResearchNote } from '@/lib/api'

const REGIME_LABELS: Record<string, string> = {
  risk_on: 'Risk-On',
  risk_off: 'Risk-Off',
  stagflation: 'Stagflation',
  recovery: 'Recovery',
  recession_risk: 'Recession Risk',
}

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

export default function LandingPageClient({
  regime,
  researchTeaser,
}: {
  regime: MarketRegime | null
  researchTeaser: ResearchNote[]
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const proofRef = useRef(null)
  const proofInView = useInView(proofRef, { once: true, margin: '-40px' })

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [loading, user, router])

  if (!loading && user) return (
    <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[var(--amber)]/30 border-t-[var(--amber)] rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)]">
      <nav className="border-b border-[var(--border)] backdrop-blur-xl sticky top-0 z-20 bg-[var(--canvas)]/85">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-xl text-[var(--amber)] tracking-tight">
            NeuFin
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/research"
              className="hidden sm:inline text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2"
            >
              Research
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row items-center gap-12 lg:gap-8 px-4 sm:px-6 py-16 lg:py-0 overflow-hidden">
        <div className="absolute inset-0 neufin-grid-bg pointer-events-none" />
        <div
          className="absolute top-1/2 left-1/2 w-[min(900px,120vw)] h-[min(900px,120vw)] rounded-full blur-3xl pointer-events-none opacity-40"
          style={{
            background:
              'radial-gradient(circle, rgba(245,166,35,0.12) 0%, rgba(77,159,255,0.06) 45%, transparent 70%)',
            animation: 'float-bg 10s ease-in-out infinite',
          }}
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="relative flex-1 max-w-xl lg:max-w-none z-10"
        >
          <motion.h1
            variants={fadeUp}
            className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.08] text-[var(--text-primary)] mb-6"
          >
            Intelligence that moves
            <br />
            <span className="text-[var(--amber)]">faster than markets.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="text-lg text-[var(--text-secondary)] leading-relaxed mb-8 max-w-lg">
            Behavioral finance analysis trusted by Singapore&apos;s financial professionals.
            Institutional-grade insights in 60 seconds.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/upload"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-[var(--amber)] text-[var(--canvas)] font-semibold text-sm hover:opacity-95 transition-opacity"
            >
              Start Free Analysis
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl border border-[var(--border-accent)] bg-[var(--glass-bg)] backdrop-blur-xl text-[var(--text-primary)] font-semibold text-sm hover:border-[var(--amber)] transition-colors"
            >
              See Pricing
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-md lg:max-w-lg"
        >
          <HeroPortfolioDemo />
        </motion.div>
      </section>

      {/* Social proof */}
      <section ref={proofRef} className="border-y border-[var(--border)] py-10 px-4 sm:px-6 bg-[var(--surface-1)]/40">
        <motion.p
          initial={{ opacity: 0 }}
          animate={proofInView ? { opacity: 1 } : {}}
          className="text-center text-sm text-[var(--text-secondary)] max-w-3xl mx-auto mb-8"
        >
          Trusted by financial advisors managing <span className="text-[var(--text-primary)] font-mono">$2B+</span>{' '}
          AUM across Singapore and SEA
        </motion.p>
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Shield, t: 'MAS Compliant' },
            { icon: Lock, t: 'Bank-grade Security' },
            { icon: Sparkles, t: 'AI-Powered' },
            { icon: Zap, t: '60-second Analysis' },
          ].map(({ icon: Icon, t }) => (
            <motion.div
              key={t}
              initial={{ opacity: 0, y: 12 }}
              animate={proofInView ? { opacity: 1, y: 0 } : {}}
              className="flex items-center gap-2 justify-center text-xs sm:text-sm text-[var(--text-secondary)]"
            >
              <Icon className="w-4 h-4 text-[var(--amber)] shrink-0" aria-hidden />
              {t}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-3xl md:text-4xl text-center mb-12 text-[var(--text-primary)]"
          >
            Everything you need to see clearly
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Dna,
                color: 'text-[var(--amber)]',
                title: 'Portfolio DNA Score',
                desc: 'A single 0–100 read on behavioral risk, concentration, and discipline — built from live holdings.',
                bullets: ['HHI & beta decomposition', 'Bias-aware scoring', 'Shareable snapshot'],
              },
              {
                icon: Network,
                color: 'text-[var(--blue)]',
                title: 'AI Swarm Analysis',
                desc: 'Multiple specialist models challenge each other before any recommendation hits your desk.',
                bullets: ['Macro + quant + risk', 'Audit-friendly reasoning', 'Sub-90s turnaround'],
              },
              {
                icon: BarChart3,
                color: 'text-[var(--emerald)]',
                title: 'Research Intelligence',
                desc: 'Regime-aware notes and semantic search across our intelligence layer — not generic news feeds.',
                bullets: ['Live regime classification', 'Executive summaries', 'Advisor-grade depth'],
              },
            ].map((f) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <GlassCard className="p-6 h-full flex flex-col">
                  <f.icon className={`w-8 h-8 mb-4 ${f.color}`} aria-hidden />
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4 flex-1">{f.desc}</p>
                  <ul className="text-xs text-[var(--text-muted)] space-y-1.5">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span className="text-[var(--amber)]">·</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Research preview */}
      <section className="py-16 px-4 sm:px-6 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-3xl md:text-4xl mb-8 text-[var(--text-primary)]"
          >
            Market Intelligence. Built different.
          </motion.h2>
          <GlassCard className="p-6 md:p-8 mb-8">
            {regime ? (
              <>
                <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">Current regime</p>
                <p className="font-display text-3xl md:text-4xl text-[var(--text-primary)] mb-4">
                  {REGIME_LABELS[regime.regime] ?? regime.regime}
                </p>
                <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden max-w-md mb-2">
                  <div
                    className="h-full rounded-full bg-[var(--amber)]"
                    style={{ width: `${Math.round((regime.confidence ?? 0) * 100)}%` }}
                  />
                </div>
                <p className="text-sm font-mono text-[var(--text-secondary)]">
                  Confidence {(regime.confidence * 100).toFixed(0)}% · Updated{' '}
                  {new Date(regime.started_at).toLocaleDateString('en-SG', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </>
            ) : (
              <p className="text-[var(--text-secondary)] text-sm">
                Regime data loads when the intelligence service is available.
              </p>
            )}
          </GlassCard>
          {researchTeaser.length > 0 && (
            <div className="space-y-3 mb-8">
              <p className="text-sm text-[var(--text-muted)]">Latest notes</p>
              {researchTeaser.map((n) => (
                <GlassCard key={n.id} className="p-4">
                  <p className="font-medium text-[var(--text-primary)] mb-1">{n.title}</p>
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{n.executive_summary}</p>
                </GlassCard>
              ))}
            </div>
          )}
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 text-[var(--amber)] font-medium text-sm hover:underline"
          >
            Access full research → Sign up free
          </Link>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-16 px-4 sm:px-6 bg-[var(--surface-1)]/30">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="font-display text-2xl md:text-3xl mb-4">Simple tiers. Serious capability.</h2>
          <p className="text-[var(--text-secondary)] text-sm mb-6 max-w-lg mx-auto">
            Free DNA analyses, Advisor workflows, and Enterprise API — see full details on pricing.
          </p>
          <Link
            href="/pricing"
            className="inline-flex px-6 py-3 rounded-xl border border-[var(--border-accent)] text-[var(--text-primary)] font-semibold text-sm hover:bg-[var(--surface-2)] transition-colors"
          >
            View pricing →
          </Link>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-10 px-4 sm:px-6 mt-auto">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed text-center mb-6">
            <strong className="text-[var(--text-secondary)]">Regulatory disclaimer:</strong> NeuFin provides tools and
            analysis for informational purposes only. This is not financial advice. Past performance does not guarantee
            future results. Consult a licensed advisor. NeuFin aligns with MAS expectations for fintech and data
            services.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-[var(--text-secondary)]">
            <Link href="/pricing" className="hover:text-[var(--amber)]">
              Pricing
            </Link>
            <Link href="/research" className="hover:text-[var(--amber)]">
              Research
            </Link>
            <Link href="/contact-sales" className="hover:text-[var(--amber)]">
              Contact
            </Link>
            <Link href="/privacy" className="hover:text-[var(--amber)]">
              Privacy
            </Link>
          </div>
          <p className="text-center text-xs text-[var(--text-muted)] mt-6">
            NeuFin © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
      <GlobalChatWidget />
    </div>
  )
}
