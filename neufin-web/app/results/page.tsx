'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import { fulfillReport } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useAnalytics } from '@/lib/posthog'
import type { DNAResult } from '@/lib/api'

// ── Stripe custom element types ───────────────────────────────────────────────
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-pricing-table': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>, HTMLElement
      > & {
        'pricing-table-id': string
        'publishable-key': string
        'customer-email'?: string
      }
    }
  }
}

const STRIPE_PK = 'pk_test_51T52dvGVXReXuoyMQ2mNNO4J3XElaRDSM2ig5t1SEbSZKHuuo0BDr0GQn7rZ5bfUzAWRIVrByyB1OMe9tLbntpTq00YkugAz9N'
const PRICING_TABLE_SINGLE    = 'prctbl_1TAS0JGVXReXuoyMioTiOhba'
const PRICING_TABLE_UNLIMITED = 'prctbl_1TAS1jGVXReXuoyMezkYvO6F'

const TYPE_COLORS: Record<string, string> = {
  'Diversified Strategist': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'Conviction Growth': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Momentum Trader': 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  'Defensive Allocator': 'bg-green-500/15 text-green-300 border-green-500/30',
  'Speculative Investor': 'bg-red-500/15 text-red-300 border-red-500/30',
}

function ScoreCircle({ score }: { score: number }) {
  const radius = 70
  const circ = 2 * Math.PI * radius
  const [offset, setOffset] = useState(circ)

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(circ - (score / 100) * circ)
    }, 200)
    return () => clearTimeout(timer)
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

export default function ResultsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token } = useAuth()
  const { track } = useAnalytics()

  const [result, setResult] = useState<DNAResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [fulfillLoading, setFulfillLoading] = useState(false)
  const [activePricingTable, setActivePricingTable] = useState<'single' | 'unlimited'>('single')
  // Referral state
  const [refToken, setRefToken] = useState<string | null>(null)
  const [refDiscount, setRefDiscount] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem('dnaResult')
    if (!stored) { router.replace('/upload'); return }
    const parsed: DNAResult = JSON.parse(stored)
    setResult(parsed)
    track('results_viewed', { dna_score: parsed.dna_score, investor_type: parsed.investor_type })

    // Persist ref_token from URL into sessionStorage
    const ref = searchParams.get('ref') || sessionStorage.getItem('ref_token')
    if (ref) {
      setRefToken(ref)
      sessionStorage.setItem('ref_token', ref)
      // Validate ref token
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/referrals/validate/${ref}`)
        .then(r => r.json())
        .then(d => setRefDiscount(d.valid))
        .catch(() => {})
    }

    const checkoutSuccess = searchParams.get('checkout_success')
    const storedReportId  = sessionStorage.getItem('pendingReportId')
    if (checkoutSuccess && storedReportId) {
      setFulfillLoading(true)
      fulfillReport(storedReportId, token)
        .then((r) => { setPdfUrl(r.pdf_url); sessionStorage.removeItem('pendingReportId') })
        .catch(() => {})
        .finally(() => setFulfillLoading(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams, token])

  // Share URL uses the share_token so the OG page loads correctly
  const shareUrl = result?.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${result.share_token}`
    : typeof window !== 'undefined' ? window.location.href : ''

  // Referral link: appends ?ref=<share_token> so new users get 20% off
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
      {/* Load Stripe Pricing Table script once */}
      <Script
        src="https://js.stripe.com/v3/pricing-table.js"
        strategy="lazyOnload"
      />

      <div className="min-h-screen flex flex-col">
        <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/upload" className="text-gray-400 hover:text-white text-sm transition-colors">
              ← New analysis
            </Link>
            <span className="text-xl font-bold text-gradient">Neufin</span>
            <div className="flex items-center gap-3">
              {user ? (
                <Link href="/dashboard" className="btn-primary py-2 text-sm">
                  Dashboard →
                </Link>
              ) : (
                <Link href="/auth" className="btn-outline py-2 text-sm">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </nav>

        {/* Referral discount banner */}
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

        {/* Sign-in save banner */}
        {!user && (
          <div className="bg-blue-950/60 border-b border-blue-800/40">
            <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
              <p className="text-xs text-blue-300">
                Sign in to save your DNA score and access it across devices
              </p>
              <Link
                href="/auth"
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 whitespace-nowrap"
              >
                Sign in to save →
              </Link>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
          {/* Score hero */}
          <div className="card text-center mb-6">
            <ScoreCircle score={result.dna_score} />
            <div className="mt-4">
              <span className={`badge border ${typeClass} text-sm px-4 py-1.5`}>
                {result.investor_type}
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-3">
              Portfolio value: <span className="text-white font-semibold">${result.total_value.toLocaleString()}</span>
              &nbsp;·&nbsp;{result.num_positions} positions&nbsp;·&nbsp;
              Max position: <span className="text-white font-semibold">{result.max_position_pct.toFixed(1)}%</span>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
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
          </div>

          <div className="card mb-6 border-blue-800/40 bg-blue-950/20">
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-2">🎯 Recommendation</h3>
            <p className="text-gray-200 leading-relaxed">{result.recommendation}</p>
          </div>

          {/* Share */}
          <div className="card mb-6">
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
          </div>

          {/* Referral link */}
          {referralUrl && (
            <div className="card mb-6 border-purple-800/30 bg-purple-950/20">
              <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-1">🎁 Your referral link</h3>
              <p className="text-xs text-gray-500 mb-3">
                Share this link — friends get 20% off their first report, and you build your Neufin reputation.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={referralUrl}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono"
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(referralUrl); track('referral_link_copied') }}
                  className="btn-primary text-xs py-2 px-4 shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Holdings preview */}
          {result.positions?.length > 0 && (
            <div className="card mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Holdings</h3>
              <div className="space-y-2">
                {result.positions.slice(0, 6).map((p) => (
                  <div key={p.symbol} className="flex items-center justify-between text-sm">
                    <span className="font-mono font-semibold text-white w-16">{p.symbol}</span>
                    <div className="flex-1 mx-4">
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(p.weight, 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-gray-400 w-12 text-right">{p.weight.toFixed(1)}%</span>
                    <span className="text-gray-300 w-24 text-right">
                      ${p.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
                {result.positions.length > 6 && (
                  <p className="text-xs text-gray-600 pt-1">+{result.positions.length - 6} more</p>
                )}
              </div>
            </div>
          )}

          {/* ── Advisor Report — Stripe Pricing Tables ─────────────────────── */}
          <div className="mt-2">
            <h2 className="text-xl font-bold text-center mb-2">Unlock Your Full Report</h2>
            <p className="text-gray-500 text-sm text-center mb-6">
              AI-generated 10-page PDF with risk analysis, sector allocation, market outlook & action plan
            </p>

            {/* PDF ready */}
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full btn-primary flex items-center justify-center gap-2 mb-6 py-3 text-center"
              >
                ⬇ Download Your Advisor Report (PDF)
              </a>
            )}

            {fulfillLoading && (
              <div className="flex items-center justify-center gap-2 text-sm text-blue-400 mb-6">
                <span className="inline-block w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                Generating your report…
              </div>
            )}

            {!pdfUrl && (
              <>
                {/* Plan tab toggle */}
                <div className="flex bg-gray-900 rounded-xl p-1 mb-6 border border-gray-800 max-w-xs mx-auto">
                  <button
                    onClick={() => setActivePricingTable('single')}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
                      ${activePricingTable === 'single' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Single · $29
                  </button>
                  <button
                    onClick={() => setActivePricingTable('unlimited')}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors
                      ${activePricingTable === 'unlimited' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    Pro · $99/mo
                  </button>
                </div>

                {/* Stripe Pricing Table — single report */}
                {activePricingTable === 'single' && (
                  <stripe-pricing-table
                    pricing-table-id={PRICING_TABLE_SINGLE}
                    publishable-key={STRIPE_PK}
                    {...(user?.email ? { 'customer-email': user.email } : {})}
                  />
                )}

                {/* Stripe Pricing Table — unlimited */}
                {activePricingTable === 'unlimited' && (
                  <stripe-pricing-table
                    pricing-table-id={PRICING_TABLE_UNLIMITED}
                    publishable-key={STRIPE_PK}
                    {...(user?.email ? { 'customer-email': user.email } : {})}
                  />
                )}
              </>
            )}
          </div>

          <div className="mt-8 text-center">
            <Link href="/dashboard" className="btn-primary inline-block px-10 py-3">
              Open Full Dashboard →
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}
