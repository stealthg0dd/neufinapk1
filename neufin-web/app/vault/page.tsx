'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { debugAuth } from '@/lib/auth-debug'
import { useUser } from '@/lib/store'
import {
  getVaultHistory,
  createStripePortal,
  type VaultRecord,
} from '@/lib/api'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const TYPE_COLORS: Record<string, string> = {
  'Diversified Strategist': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Conviction Growth':      'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Momentum Trader':        'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'Defensive Allocator':    'text-green-400 bg-green-500/10 border-green-500/20',
  'Speculative Investor':   'text-red-400 bg-red-500/10 border-red-500/20',
}

const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export default function VaultPage() {
  const { user, token, loading: authLoading, signOut } = useAuth()
  const { isPro, subscriptionTier, advisorName }       = useUser()

  const [history,       setHistory]       = useState<VaultRecord[]>([])
  const [fetching,      setFetching]      = useState(true)
  const [query,         setQuery]         = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError,   setPortalError]   = useState<string | null>(null)

  useEffect(() => {
    debugAuth('vault:mount')
  }, [])

  useEffect(() => {
    if (!token) { setFetching(false); return }
    getVaultHistory(token)
      .then(d => setHistory(d.history || []))
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [token])

  async function openPortal() {
    if (!token) return
    setPortalLoading(true)
    setPortalError(null)
    try {
      const { portal_url } = await createStripePortal(window.location.href, token)
      window.location.href = portal_url
    } catch (err: unknown) {
      setPortalError(err instanceof Error ? err.message : 'Could not open billing portal')
      setPortalLoading(false)
    }
  }

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-5 text-center px-6">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold text-white">Your Vault</h1>
        <p className="text-gray-500 text-sm max-w-xs">
          Sign in to access your portfolio history, saved reports, and subscription details — across all your devices.
        </p>
        <Link href="/auth?next=/vault" className="btn-primary px-8 py-3">Sign In →</Link>
        <Link href="/upload" className="text-sm text-gray-600 hover:text-gray-400 transition-colors">
          Or analyse a portfolio first
        </Link>
      </div>
    )
  }

  if (authLoading || fetching) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  const filtered = history.filter(r =>
    query === '' ||
    r.investor_type?.toLowerCase().includes(query.toLowerCase()) ||
    fmt(r.created_at).toLowerCase().includes(query.toLowerCase())
  )

  const bestScore   = history.length ? Math.max(...history.map(r => r.dna_score)) : null
  const latestScore = history[0]?.dna_score ?? null

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <div className="flex items-center gap-4">
            <Link href="/results" className="text-gray-400 hover:text-white text-sm transition-colors">
              Results
            </Link>
            <button onClick={signOut} className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full">
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-8">

          {/* ── Header ─────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Your Vault
                {isPro && (
                  <span className="text-xs bg-gradient-to-r from-yellow-500/20 to-amber-500/20
                    border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
                    PRO
                  </span>
                )}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {user?.email} · {history.length} analysis{history.length !== 1 ? 'es' : ''} saved
              </p>
            </div>
            <Link href="/upload" className="btn-primary text-sm px-4 py-2 shrink-0">
              + New Analysis
            </Link>
          </motion.div>

          {/* ── Stats ──────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Latest Score',    value: latestScore ?? '—',   icon: '🧬' },
              { label: 'Personal Best',   value: bestScore ?? '—',     icon: '🏆' },
              { label: 'Total Analyses',  value: history.length,       icon: '📊' },
              { label: 'Plan',            value: isPro ? 'Pro' : 'Free', icon: isPro ? '⭐' : '🆓' },
            ].map(stat => (
              <div key={stat.label} className="card text-center">
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* ── Subscription card ──────────────────────────── */}
          <motion.div variants={fadeUp}
            className={`card ${isPro
              ? 'border-yellow-500/20 bg-gradient-to-br from-yellow-950/20 to-amber-950/10'
              : 'border-gray-800'}`}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{isPro ? '⭐' : '🆓'}</span>
                  <h2 className="font-semibold text-white">
                    {isPro ? 'Pro Advisor' : 'Free Plan'}
                  </h2>
                  {advisorName && (
                    <span className="text-xs text-gray-500">· {advisorName}</span>
                  )}
                </div>
                <p className="text-gray-500 text-sm">
                  {isPro
                    ? 'Unlimited reports · White-label PDFs · Priority AI analysis'
                    : 'Upgrade to Pro for unlimited reports and white-label advisor branding.'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {isPro ? (
                  <button
                    onClick={openPortal}
                    disabled={portalLoading}
                    className="btn-outline text-sm px-4 py-2 flex items-center gap-2"
                  >
                    {portalLoading
                      ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                      : null}
                    Manage Billing
                  </button>
                ) : (
                  <Link href="/pricing" className="btn-primary text-sm px-4 py-2">
                    Upgrade to Pro →
                  </Link>
                )}
              </div>
            </div>
            {portalError && (
              <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                {portalError}
              </p>
            )}
          </motion.div>

          {/* ── Analysis history ───────────────────────────── */}
          <motion.div variants={fadeUp} className="card space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-white">Analysis History</h2>
              {history.length > 4 && (
                <input
                  type="search"
                  placeholder="Filter by type or date…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="input text-sm py-1.5 px-3 w-48"
                />
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-4xl">📭</p>
                <p className="text-gray-400 font-medium">
                  {history.length === 0 ? 'No analyses yet' : 'No matches'}
                </p>
                {history.length === 0 && (
                  <>
                    <p className="text-gray-600 text-sm">
                      Upload your first portfolio CSV to see your Investor DNA Score here.
                    </p>
                    <Link href="/upload" className="btn-primary inline-block mt-2 px-5 py-2 text-sm">
                      Analyse My Portfolio →
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-800/60">
                {filtered.map((record, i) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    className="py-4 flex items-start gap-4"
                  >
                    {/* Score badge */}
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold
                      ${record.dna_score >= 70 ? 'bg-green-500/15 text-green-400'
                        : record.dna_score >= 40 ? 'bg-yellow-500/15 text-yellow-400'
                        : 'bg-red-500/15 text-red-400'}`}
                    >
                      <span className="text-lg leading-none">{record.dna_score}</span>
                      <span className="text-[9px] text-current opacity-70">DNA</span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs border px-2 py-0.5 rounded-full ${
                          TYPE_COLORS[record.investor_type] ?? 'text-gray-400 bg-gray-800 border-gray-700'
                        }`}>
                          {record.investor_type}
                        </span>
                        <span className="text-xs text-gray-600">{fmt(record.created_at)}</span>
                        {record.total_value > 0 && (
                          <span className="text-xs text-gray-600">{usd(record.total_value)}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{record.recommendation}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      <Link
                        href={`/share/${record.share_token}`}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        View ↗
                      </Link>
                      <Link
                        href={`/upload?rerun=${record.share_token}`}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        title="Re-run with current market prices"
                      >
                        Re-run ↻
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* ── Account actions ─────────────────────────────── */}
          <motion.div variants={fadeUp}
            className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-800/60 pt-4"
          >
            <div className="flex gap-4">
              <Link href="/advisor/settings" className="hover:text-gray-400 transition-colors">Advisor Settings</Link>
              <Link href="/advisor/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</Link>
              <Link href="/market" className="hover:text-gray-400 transition-colors">Market DNA</Link>
            </div>
            <button
              onClick={signOut}
              className="text-gray-700 hover:text-red-400 transition-colors"
            >
              Sign out
            </button>
          </motion.div>

        </motion.div>
      </main>
    </div>
  )
}
