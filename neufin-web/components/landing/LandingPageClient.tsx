'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { MarketRegime, ResearchNote } from '@/lib/api'

const GlobalChatWidget = dynamic(() => import('@/components/GlobalChatWidget'), { ssr: false })

const REGIME_LABELS: Record<string, string> = {
  risk_on: 'Risk-On',
  risk_off: 'Risk-Off',
  stagflation: 'Stagflation',
  recovery: 'Recovery',
  recession_risk: 'Recession Risk',
}

export default function LandingPageClient({
  regime,
  researchTeaser,
}: {
  regime: MarketRegime | null
  researchTeaser: ResearchNote[]
}) {
  const [showChatWidget, setShowChatWidget] = useState(false)

  useEffect(() => {
    // Defer non-critical widget so initial landing parse/hydration is lighter.
    const id = window.setTimeout(() => setShowChatWidget(true), 1200)
    return () => window.clearTimeout(id)
  }, [])

  // Hash token (#access_token=) is now handled by AuthProvider's initSession()
  // which calls setSession() before clearing the hash. No duplicate handling needed here.

  const conf =
    typeof regime?.confidence === 'number' ? Math.max(0, Math.min(1, regime.confidence)) : 0
  const regimeLabel = regime ? REGIME_LABELS[regime.regime] ?? regime.regime : null

  return (
    <div className="min-h-screen flex flex-col bg-[#080B14]">
      <nav className="border-b border-[var(--border)] backdrop-blur-xl sticky top-0 z-20 bg-[#080B14]/85">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-semibold text-white tracking-tight">
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

      <section className="relative overflow-hidden px-4 sm:px-6 py-16 md:py-20">
        <div className="absolute inset-0 pointer-events-none bg-[length:60px_60px]" style={{ backgroundImage: 'linear-gradient(rgba(124,58,237,0.06) 1px, transparent 1px),linear-gradient(90deg, rgba(124,58,237,0.06) 1px, transparent 1px)', animation: 'grid-move 20s linear infinite' }} />
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[55%_45%] gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs">
              ✦ AI-Powered Portfolio Intelligence
            </span>
            <h1 className="mt-5 text-[40px] md:text-[64px] font-bold leading-tight text-white">
              <span className="block">Your portfolio,</span>
              <span className="block">
                finally{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #f5a623)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  intelligent.
                </span>
              </span>
            </h1>
            <p className="mt-6 text-[18px] text-[#8B95B0] max-w-[480px]">
              Upload your holdings. Get institutional-grade behavioral finance analysis in 60 seconds. Know your real risk.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
                href="/login"
                className="px-6 py-3 bg-[#7c3aed] text-white rounded-full font-medium hover:bg-purple-600 transition-all hover:scale-105 text-center"
            >
                Analyze my portfolio free
            </Link>
            <Link
                href="/research"
                className="px-6 py-3 text-[#8B95B0] hover:text-white transition-colors text-center"
            >
                See sample report →
            </Link>
            </div>
            <div className="mt-12 flex flex-wrap gap-8">
              <div>
                <p className="text-3xl font-semibold text-[var(--amber)]">2,400+</p>
                <p className="text-sm text-[#8B95B0]">Portfolios analyzed</p>
              </div>
              <div>
                <p className="text-3xl font-semibold text-[var(--amber)]">$4.2B</p>
                <p className="text-sm text-[#8B95B0]">Assets tracked</p>
              </div>
              <div>
                <p className="text-3xl font-semibold text-[var(--amber)]">60s</p>
                <p className="text-sm text-[#8B95B0]">Average analysis time</p>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <p className="text-xs text-[#8B95B0] mb-3">Portfolio DNA Score</p>
            <div className="flex items-end justify-center gap-1">
              <p className="text-[72px] leading-none font-bold text-[var(--amber)]">78</p>
              <p className="text-[#8B95B0] mb-2">/100</p>
            </div>
            <div className="mt-4 flex justify-center">
              <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden>
                <circle cx="70" cy="70" r="54" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
                <circle
                  cx="70"
                  cy="70"
                  r="54"
                  fill="none"
                  stroke="#f5a623"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="339"
                  strokeDashoffset="339"
                  style={{ animation: 'score-ring 1.5s ease-out forwards' }}
                  transform="rotate(-90 70 70)"
                />
              </svg>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {['Risk: Moderate', 'Beta: 0.82', 'Sharpe: 1.24'].map((x) => (
                <span key={x} className="px-3 py-1 rounded-full bg-white/5 text-[#8B95B0] text-xs">
                  {x}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-[32px] text-white font-semibold">Live Market Intelligence</h2>
          <p className="text-[#8B95B0] mt-2">Our AI continuously monitors global markets</p>
          <div className="mt-8 grid md:grid-cols-3 gap-4">
            <div className="backdrop-blur-xl bg-white/5 border border-amber-500/40 rounded-2xl p-6">
              <p className="text-xs text-[#8B95B0] mb-2">Current Regime</p>
              {regimeLabel ? (
                <>
                  <p className="text-2xl font-semibold text-white">{regimeLabel}</p>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-3">
                    <div className="h-full bg-[var(--amber)]" style={{ width: `${Math.round(conf * 100)}%` }} />
                  </div>
                  <p className="text-xs text-[#8B95B0] mt-2">Confidence {Math.round(conf * 100)}%</p>
                </>
              ) : (
                <p className="text-sm text-[#8B95B0]">Markets closed. Intelligence refreshes when feeds are available.</p>
              )}
            </div>
            {(researchTeaser?.length ?? 0) > 0 ? (
              researchTeaser.slice(0, 2).map((n) => (
                <div key={n.id} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-white font-medium">{n.title}</p>
                  <p className="text-sm text-[#8B95B0] mt-2 line-clamp-3">{n.executive_summary}</p>
                </div>
              ))
            ) : (
              <>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-sm text-[#8B95B0]">Markets closed. Latest research will appear shortly.</p>
                </div>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-sm text-[#8B95B0]">No active note feed right now. Check back soon.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl text-white font-semibold text-center mb-8">Pricing</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <p className="text-white font-semibold">Free</p>
              <p className="text-3xl text-white mt-2">$0</p>
              <p className="text-sm text-[#8B95B0] mt-3">Get started with portfolio DNA analysis.</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-amber-500/50 rounded-2xl p-6">
              <p className="text-white font-semibold">Advisor</p>
              <p className="text-3xl text-white mt-2">$299/mo</p>
              <p className="text-sm text-[#8B95B0] mt-3">Client-ready workflows and deeper intelligence.</p>
              <Link href="/pricing" className="inline-block mt-5 px-5 py-2.5 rounded-full bg-[var(--amber)] text-[#101010] font-medium">
                Start 14-Day Free Trial
              </Link>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <p className="text-white font-semibold">Enterprise</p>
              <p className="text-3xl text-white mt-2">$999/mo</p>
              <p className="text-sm text-[#8B95B0] mt-3">API, controls, and team operations at scale.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-10 px-4 sm:px-6 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#8B95B0]">NeuFin © 2026 · Neufin OÜ, Estonia</p>
          <div className="flex items-center gap-4 text-sm text-[#8B95B0]">
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Terms
            </Link>
            <Link href="/pricing" className="hover:text-white">
              MAS Disclaimer
            </Link>
          </div>
        </div>
      </footer>
      {showChatWidget ? <GlobalChatWidget /> : null}
    </div>
  )
}
