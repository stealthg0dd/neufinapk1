'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import AppHeader from '@/components/AppHeader'
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
  'Diversified Strategist': 'border-primary/30 bg-primary-light text-primary-dark',
  'Conviction Growth': 'border-purple-200 bg-purple-50 text-purple-900',
  'Momentum Trader': 'border-amber-200 bg-amber-50 text-amber-900',
  'Defensive Allocator': 'border-emerald-200 bg-emerald-50 text-emerald-900',
  'Speculative Investor': 'border-red-200 bg-red-50 text-red-800',
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-app px-6 text-center text-navy">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold">Your Vault</h1>
        <p className="max-w-xs text-sm text-muted2">
          Sign in to access your portfolio history, saved reports, and subscription details — across all your devices.
        </p>
        <Link href="/auth?next=/vault" className="btn-primary px-8 py-3">
          Sign In →
        </Link>
        <Link href="/upload" className="text-sm text-muted2 transition-colors hover:text-primary-dark">
          Or analyse a portfolio first
        </Link>
      </div>
    )
  }

  if (authLoading || fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
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
    <div className="flex min-h-screen flex-col bg-app text-navy">
      <AppHeader />
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-bold text-gradient">
            Neufin
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/results" className="text-sm text-muted2 transition-colors hover:text-primary-dark">
              Results
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="text-sm text-muted2 transition-colors hover:text-primary-dark"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-section">
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-8">

          {/* ── Header ─────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
                Your Vault
                {isPro && (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    PRO
                  </span>
                )}
              </h1>
              <p className="mt-0.5 text-sm text-muted2">
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
              <div key={stat.label} className="card text-center ring-1 ring-inset ring-primary/30">
                <div className="mb-1 text-2xl">{stat.icon}</div>
                <div className="text-2xl font-bold text-navy">{stat.value}</div>
                <div className="mt-0.5 text-xs text-muted2">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* ── Subscription card ──────────────────────────── */}
          <motion.div
            variants={fadeUp}
            className={`card ring-1 ring-inset ring-primary/30 ${
              isPro ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-surface-2' : ''
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-lg">{isPro ? '⭐' : '🆓'}</span>
                  <h2 className="font-semibold text-navy">{isPro ? 'Pro Advisor' : 'Free Plan'}</h2>
                  {advisorName && <span className="text-xs text-muted2">· {advisorName}</span>}
                </div>
                <p className="text-sm text-muted2">
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
                    {portalLoading ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-primary/40 border-t-primary" />
                    ) : null}
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
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{portalError}</p>
            )}
          </motion.div>

          {/* ── Analysis history ───────────────────────────── */}
          <motion.div variants={fadeUp} className="card space-y-4 ring-1 ring-inset ring-primary/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-navy">Analysis History</h2>
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
              <div className="text-center py-section space-y-3">
                <p className="text-4xl">📭</p>
                <p className="font-medium text-muted2">{history.length === 0 ? 'No analyses yet' : 'No matches'}</p>
                {history.length === 0 && (
                  <>
                    <p className="text-sm text-muted2">Upload your first portfolio CSV to see your Investor DNA Score here.</p>
                    <Link href="/upload" className="btn-primary inline-block mt-2 px-5 py-2 text-sm">
                      Analyse My Portfolio →
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((record, i) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    className="py-4 flex items-start gap-4"
                  >
                    {/* Score badge */}
                    <div
                      className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-bold ${
                        record.dna_score >= 70
                          ? 'bg-emerald-50 text-emerald-800'
                          : record.dna_score >= 40
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-red-50 text-red-800'
                      }`}
                    >
                      <span className="text-lg leading-none">{record.dna_score}</span>
                      <span className="text-sm text-current opacity-70">DNA</span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            TYPE_COLORS[record.investor_type] ??
                            'border-border bg-surface-2 text-muted2'
                          }`}
                        >
                          {record.investor_type}
                        </span>
                        <span className="text-xs text-muted2">{fmt(record.created_at)}</span>
                        {record.total_value > 0 && (
                          <span className="text-xs text-muted2">{usd(record.total_value)}</span>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted2">{record.recommendation}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      <Link
                        href={`/share/${record.share_token}`}
                        className="text-xs text-primary transition-colors hover:text-primary-dark"
                      >
                        View ↗
                      </Link>
                      <Link
                        href={`/upload?rerun=${record.share_token}`}
                        className="text-xs text-muted2 transition-colors hover:text-navy"
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
          <motion.div
            variants={fadeUp}
            className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted2"
          >
            <div className="flex gap-4">
              <Link href="/advisor/settings" className="transition-colors hover:text-primary-dark">
                Advisor Settings
              </Link>
              <Link href="/advisor/dashboard" className="transition-colors hover:text-primary-dark">
                Dashboard
              </Link>
              <Link href="/market" className="transition-colors hover:text-primary-dark">
                Market DNA
              </Link>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="transition-colors hover:text-red-600"
            >
              Sign out
            </button>
          </motion.div>

        </motion.div>
      </main>
    </div>
  )
}
