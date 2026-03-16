'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { fulfillReport, createCheckoutSession } from '@/lib/api'
import SocialProof from '@/components/SocialProof'
import AdvisorCTA from '@/components/AdvisorCTA'
import { trackEvent, EVENTS } from '@/components/Analytics'
import { useAuth } from '@/lib/auth-context'
import { useAnalytics } from '@/lib/posthog'
import type { DNAAnalysisResponse } from '@/lib/api'

const PortfolioPie = nextDynamic(() => import('@/components/PortfolioPie'), { ssr: false })


const TYPE_COLORS: Record<string, string> = {
  'Diversified Strategist': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'Conviction Growth':      'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Momentum Trader':        'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  'Defensive Allocator':    'bg-green-500/15 text-green-300 border-green-500/30',
  'Speculative Investor':   'bg-red-500/15 text-red-300 border-red-500/30',
}

// ── Formatters ────────────────────────────────────────────────────────────────
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const pct = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 100)

const usdFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
}

// ── Score circle ──────────────────────────────────────────────────────────────
function ScoreCircle({ score }: { score: number }) {
  const radius = 70
  const circ   = 2 * Math.PI * radius
  const [offset, setOffset] = useState(circ)

  useEffect(() => {
    const t = setTimeout(() => setOffset(circ - (score / 100) * circ), 200)
    return () => clearTimeout(t)
  }, [score, circ])

  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="180" height="180" className="-rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#1f2937" strokeWidth="12" />
        <circle
          cx="90" cy="90" r={radius} fill="none"
          stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-extrabold" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-500 uppercase tracking-widest">DNA Score</span>
      </div>
    </div>
  )
}

// ── Score label ───────────────────────────────────────────────────────────────
function ScoreLabel({ score }: { score: number }) {
  if (score >= 70) return <span className="text-xs text-green-400 font-semibold">Strong portfolio</span>
  if (score >= 40) return <span className="text-xs text-yellow-400 font-semibold">Room to improve</span>
  return <span className="text-xs text-red-400 font-semibold">High concentration risk</span>
}

// ── Results content (client component) ────────────────────────────────────────
export default function ResultsContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { user, token } = useAuth()
  const { track }    = useAnalytics()

  const [result, setResult]               = useState<DNAAnalysisResponse | null>(null)
  const [copied, setCopied]               = useState(false)
  const [pdfUrl, setPdfUrl]               = useState<string | null>(null)
  const [fulfillLoading, setFulfillLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [refToken, setRefToken]           = useState<string | null>(null)
  const [refDiscount, setRefDiscount]     = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('dnaResult')
    if (!stored) { router.replace('/upload'); return }

    let parsed: DNAAnalysisResponse
    try {
      parsed = JSON.parse(stored)
      if (typeof parsed.dna_score !== 'number') throw new Error('malformed')
    } catch {
      router.replace('/upload')
      return
    }

    setResult(parsed)
    track('results_viewed', { dna_score: parsed.dna_score, investor_type: parsed.investor_type })
    trackEvent(EVENTS.UPLOAD_COMPLETE, { dna_score: parsed.dna_score, investor_type: parsed.investor_type })

    // Referral token from URL or storage
    const ref = searchParams.get('ref') || localStorage.getItem('ref_token')
    if (ref) {
      setRefToken(ref)
      localStorage.setItem('ref_token', ref)
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/referrals/validate/${ref}`)
        .then(r => r.json())
        .then(d => setRefDiscount(d.valid))
        .catch(() => {})
    }

    // Post-checkout fulfillment
    const checkoutSuccess   = searchParams.get('checkout_success')
    const storedReportId    = localStorage.getItem('pendingReportId')
    if (checkoutSuccess && storedReportId) {
      setFulfillLoading(true)
      fulfillReport(storedReportId, token)
        .then(r => { setPdfUrl(r.pdf_url); localStorage.removeItem('pendingReportId') })
        .catch(() => {})
        .finally(() => setFulfillLoading(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams, token])

  const shareUrl = result?.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${result.share_token}`
    : typeof window !== 'undefined' ? window.location.href : ''

  const referralUrl = result?.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/upload?ref=${result.share_token}`
    : ''

  const copyShare = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    track('share_link_copied', { share_token: result?.share_token })
    setTimeout(() => setCopied(false), 2000)
  }

  const shareTwitter = () => {
    if (!result) return
    track('share_twitter_clicked')
    const text = `I just got my Investor DNA Score: ${result.dna_score}/100 🧬\nI'm a "${result.investor_type}"\n\nDiscover yours → `
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text + shareUrl)}`, '_blank')
  }

  const startOver = () => {
    localStorage.removeItem('dnaResult')
    router.push('/upload')
  }

  const startCheckout = async () => {
    if (!result?.record_id) {
      document.getElementById('unlock-report')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setCheckoutLoading(true)
    track('checkout_started', { record_id: result.record_id })
    trackEvent(EVENTS.CHECKOUT_CLICKED, { record_id: result.record_id })
    try {
      await createCheckoutSession(result.record_id, token)
      // createCheckoutSession redirects — execution stops here on success
    } catch (e) {
      track('checkout_error', { error: e instanceof Error ? e.message : 'unknown' })
      setCheckoutLoading(false)
    }
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  const typeClass = TYPE_COLORS[result.investor_type] || 'bg-gray-700 text-gray-300 border-gray-600'

  return (
    <>
      <SocialProof />
      <div className="min-h-screen flex flex-col">

        {/* Nav */}
        <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={startOver} className="text-gray-400 hover:text-white text-sm transition-colors">
              ← New analysis
            </button>
            <span className="text-xl font-bold text-gradient">Neufin</span>
            <div className="flex items-center gap-3">
              {user ? (
                <Link href="/dashboard" className="btn-primary py-2 text-sm">Dashboard →</Link>
              ) : (
                <Link href="/auth" className="btn-outline py-2 text-sm">Sign in</Link>
              )}
            </div>
          </div>
        </nav>

        {/* Referral banner */}
        {refDiscount && (
          <div className="bg-green-950/60 border-b border-green-800/40">
            <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center gap-2">
              <span className="text-green-400 text-sm">🎉</span>
              <p className="text-xs text-green-300 font-medium">
                You were referred — get <strong>20% off</strong> your first report automatically at checkout
              </p>
            </div>
          </div>
        )}

        {/* Sign-in nudge */}
        {!user && (
          <div className="bg-blue-950/60 border-b border-blue-800/40">
            <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
              <p className="text-xs text-blue-300">Sign in to save your DNA score across devices</p>
              <Link href="/auth" className="text-xs font-semibold text-blue-400 hover:text-blue-300 whitespace-nowrap">
                Sign in to save →
              </Link>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >

            {/* ── Hero: Score + Type ─────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="card text-center">
              <ScoreCircle score={result.dna_score} />
              <div className="mt-3 mb-1">
                <ScoreLabel score={result.dna_score} />
              </div>
              <div className="mt-2">
                <span className={`badge border ${typeClass} text-sm px-4 py-1.5`}>
                  {result.investor_type}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-3">
                Portfolio value:&nbsp;
                <span className="text-white font-semibold">{usd(result.total_value)}</span>
                &nbsp;·&nbsp;
                {result.num_positions} positions
                &nbsp;·&nbsp;
                Max position:&nbsp;
                <span className="text-white font-semibold">{pct(result.max_position_pct)}</span>
              </p>
            </motion.div>

            {/* ── Overview cards ─────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4">
              <div className="card text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Value</p>
                <p className="text-2xl font-bold text-white">{usd(result.total_value)}</p>
              </div>
              <div className="card text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Positions</p>
                <p className="text-2xl font-bold text-white">{result.num_positions}</p>
              </div>
            </motion.div>

            {/* ── AI Analysis ────────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="grid md:grid-cols-2 gap-4">
              <div className="card">
                <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-3">💪 Strengths</h3>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-300">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card">
                <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">⚠️ Watch out</h3>
                <ul className="space-y-2">
                  {result.weaknesses.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-300">
                      <span className="text-red-500 mt-0.5 shrink-0">!</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            {/* ── Action plan ────────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="card border-blue-800/40 bg-blue-950/20">
              <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-2">🎯 Your Neufin Action Plan</h3>
              <p className="text-gray-200 leading-relaxed">{result.recommendation}</p>
            </motion.div>

            {/* ── Holdings table ─────────────────────────────────────────── */}
            {result.positions?.length > 0 && (
              <motion.div variants={fadeUp} className="card">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Holdings</h3>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                        <th className="text-left pb-2 pr-4">Symbol</th>
                        <th className="text-right pb-2 px-4">Shares</th>
                        <th className="text-right pb-2 px-4">Price</th>
                        <th className="text-right pb-2 px-4">Value</th>
                        <th className="text-left pb-2 pl-4">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {result.positions.map((p) => (
                        <tr key={p.symbol} className="hover:bg-gray-800/30 transition-colors">
                          <td className="py-2.5 pr-4 font-mono font-bold text-white">{p.symbol}</td>
                          <td className="py-2.5 px-4 text-right text-gray-300">
                            {new Intl.NumberFormat('en-US').format(p.shares)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-gray-300">{usdFull(p.price)}</td>
                          <td className="py-2.5 px-4 text-right text-white font-medium">{usd(p.value)}</td>
                          <td className="py-2.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden min-w-[64px]">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${Math.min(p.weight, 100)}%` }}
                                />
                              </div>
                              <span className="text-gray-400 text-xs w-10 text-right shrink-0">
                                {pct(p.weight)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {result.positions.map((p) => (
                    <div key={p.symbol} className="flex items-center justify-between py-2 border-b border-gray-800/60 last:border-0">
                      <div>
                        <p className="font-mono font-bold text-white">{p.symbol}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Intl.NumberFormat('en-US').format(p.shares)} shares · {usdFull(p.price)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-white">{usd(p.value)}</p>
                        <div className="flex items-center gap-1.5 justify-end mt-1">
                          <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(p.weight, 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{pct(p.weight)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Allocation Overview ─────────────────────────────────── */}
            {result.positions?.length > 0 && (
              <motion.div variants={fadeUp} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                    Allocation Overview
                  </h3>
                  {result.max_position_pct > 40 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1">
                      ⚠ High concentration
                    </span>
                  )}
                </div>
                <PortfolioPie positions={result.positions} />
              </motion.div>
            )}

            {/* ── Actions ────────────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-3">
              {/* Share My DNA */}
              <a
                href={result.share_url || shareUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => track('share_dna_opened', { share_token: result.share_token })}
                className="btn-primary flex items-center justify-center gap-2 py-3 text-sm"
              >
                🧬 Share My DNA
              </a>

              {/* PDF — opens download if ready, otherwise starts checkout */}
              <button
                onClick={pdfUrl ? () => window.open(pdfUrl, '_blank') : startCheckout}
                disabled={checkoutLoading}
                className={`btn-primary flex items-center justify-center gap-2 py-3 text-sm
                  ${checkoutLoading ? 'opacity-70 cursor-wait' : ''}`}
              >
                {checkoutLoading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redirecting…
                  </>
                ) : pdfUrl ? (
                  '⬇ Download Report'
                ) : (
                  '📄 Unlock Full Report'
                )}
              </button>

              {/* Start Over */}
              <button
                onClick={startOver}
                className="flex items-center justify-center gap-2 py-3 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                ↩ Start Over
              </button>
            </motion.div>

            {/* ── Share panel ─────────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="card">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Share your result</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={copyShare}
                  className="btn-outline text-xs py-2.5 flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
                >
                  {copied ? '✓ Copied!' : '🔗 Copy link'}
                </button>
                <button
                  onClick={shareTwitter}
                  className="bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  𝕏 Twitter/X
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`I got ${result.dna_score}/100 on my Investor DNA Score 🧬 I'm a "${result.investor_type}" — see yours free → ${shareUrl}`)}`}
                  target="_blank" rel="noreferrer"
                  onClick={() => track('share_whatsapp_clicked')}
                  className="bg-[#25D366]/80 hover:bg-[#25D366] text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`My Investor DNA Score: ${result.dna_score}/100 — I'm a "${result.investor_type}"`)}`}
                  target="_blank" rel="noreferrer"
                  onClick={() => track('share_telegram_clicked')}
                  className="bg-[#2AABEE]/80 hover:bg-[#2AABEE] text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  Telegram
                </a>
              </div>
            </motion.div>

            {/* ── Referral link ───────────────────────────────────────────── */}
            {referralUrl && (
              <motion.div variants={fadeUp} className="card border-purple-800/30 bg-purple-950/20">
                <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-1">🎁 Your referral link</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Share this link — friends get 20% off their first report, and you build your Neufin reputation.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly value={referralUrl}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono"
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText(referralUrl); track('referral_link_copied') }}
                    className="btn-primary text-xs py-2 px-4 shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Unlock report ───────────────────────────────────────────── */}
            <motion.div variants={fadeUp} id="unlock-report">
              {/* PDF ready — download banner */}
              {pdfUrl ? (
                <a
                  href={pdfUrl} target="_blank" rel="noreferrer"
                  onClick={() => trackEvent(EVENTS.PDF_DOWNLOADED, { source: 'results_page' })}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base"
                >
                  ⬇ Download Your Advisor Report (PDF)
                </a>
              ) : (
                <div className="card border-blue-800/40 bg-gradient-to-br from-blue-950/30 to-purple-950/20">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-white">Unlock Your Full Report</h2>
                      <p className="text-gray-500 text-xs mt-0.5">AI-generated · 10-page PDF · one-time $29</p>
                    </div>
                    <span className="text-2xl shrink-0">📄</span>
                  </div>

                  {/* What's inside */}
                  <ul className="space-y-2 mb-5">
                    {[
                      { icon: '📊', label: 'Detailed Sector Exposure', sub: 'Breakdown by industry, geography & asset class' },
                      { icon: '📉', label: 'Annualized Volatility & Risk Metrics', sub: 'Sharpe ratio, max drawdown, beta vs S&P 500' },
                      { icon: '🎯', label: 'Actionable Buy / Sell Signals', sub: 'AI-ranked rebalancing moves with rationale' },
                      { icon: '🏦', label: 'Advisor-Ready White-label Formatting', sub: 'Clean PDF you can share with your financial advisor' },
                    ].map(({ icon, label, sub }) => (
                      <li key={label} className="flex items-start gap-3">
                        <span className="text-base shrink-0 mt-0.5">{icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-200">{label}</p>
                          <p className="text-xs text-gray-500">{sub}</p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {fulfillLoading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-blue-400 py-3">
                      <span className="inline-block w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      Generating your report…
                    </div>
                  ) : (
                    <button
                      onClick={startCheckout}
                      disabled={checkoutLoading}
                      className={`w-full btn-primary py-3.5 text-base flex items-center justify-center gap-2
                        ${checkoutLoading ? 'opacity-70 cursor-wait' : ''}`}
                    >
                      {checkoutLoading ? (
                        <>
                          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Redirecting to checkout…
                        </>
                      ) : (
                        'Unlock Professional Report · $29 →'
                      )}
                    </button>
                  )}

                  <p className="text-center text-xs text-gray-600 mt-3">
                    Secured by Stripe · instant delivery · no subscription
                  </p>

                  {/* Free unlock via referrals */}
                  <div className="mt-3 pt-3 border-t border-gray-800/60 text-center">
                    <Link
                      href="/referrals"
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      🎁 Or get it free by inviting 3 friends →
                    </Link>
                  </div>
                </div>
              )}
            </motion.div>

            {/* ── Advisor CTA ─────────────────────────────────────────────── */}
            {refToken && (
              <motion.div variants={fadeUp}>
                <AdvisorCTA refToken={refToken} />
              </motion.div>
            )}

            {/* ── Dashboard CTA ───────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="text-center pb-6">
              <Link href="/dashboard" className="btn-primary inline-block px-10 py-3">
                Open Full Dashboard →
              </Link>
            </motion.div>

          </motion.div>
        </main>
      </div>
    </>
  )
}
