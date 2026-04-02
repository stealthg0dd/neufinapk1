"use client"

/**
 * /dashboard/revenue
 *
 * NeuFin revenue dashboard — advisor only.
 * Shows monthly Stripe revenue, subscriber counts, recent purchases,
 * and a conversion funnel.
 */

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RecentPurchase {
  user_id:      string
  email:        string
  plan_type:    string
  amount_usd:   number
  purchased_at: string
}

interface RevenueStats {
  revenue_this_month_usd: number
  revenue_last_month_usd: number
  active_subscribers:     number
  trial_users:            number
  expired_users:          number
  recent_purchases:       RecentPurchase[]
  funnel: {
    signups:    number
    dna_scores: number
    swarm_runs: number
    purchases:  number
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "numeric" })
}

function revDelta(current: number, prev: number): { pct: string; up: boolean } {
  if (!prev) return { pct: "—", up: true }
  const d = ((current - prev) / prev) * 100
  return { pct: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, up: d >= 0 }
}

function funnelConversion(a: number, b: number): string {
  if (!a) return "—"
  return `${((b / a) * 100).toFixed(1)}%`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-800 ${className}`} />
}

function StatCard({
  label,
  value,
  sub,
  delta,
  deltaUp,
}: {
  label:    string
  value:    string | number
  sub?:     string
  delta?:   string
  deltaUp?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-100">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub  && <p className="text-xs text-gray-500">{sub}</p>}
        {delta && (
          <span className={`text-xs font-medium ${deltaUp ? "text-emerald-400" : "text-red-400"}`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

function FunnelBar({
  label,
  value,
  max,
  conversion,
}: {
  label:      string
  value:      number
  max:        number
  conversion: string
}) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-300">{label}</span>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-gray-100 font-medium">{value.toLocaleString()}</span>
          {conversion !== "—" && (
            <span className="text-gray-500">{conversion} CVR</span>
          )}
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-800">
        <div
          className="h-2 rounded-full bg-blue-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const { getAccessToken } = useAuth()
  const [stats, setStats]   = useState<RevenueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) { setError("Not authenticated"); return }
      const res = await fetch("/api/revenue/stats", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (res.status === 403) { setError("Advisor role required."); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => { load() }, [load])

  const month = new Date().toLocaleString("en-SG", { month: "long", year: "numeric" })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 max-w-7xl mx-auto">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <p className="font-semibold text-red-400">Revenue data unavailable</p>
          <p className="text-sm text-red-400/70 mt-1">{error}</p>
          <button onClick={load} className="mt-4 text-xs text-red-400 border border-red-500/30 rounded-md px-3 py-1.5 hover:bg-red-500/10 transition-colors">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!stats) return null

  const { pct: revDeltaPct, up: revDeltaUp } = revDelta(stats.revenue_this_month_usd, stats.revenue_last_month_usd)
  const totalUsers = stats.active_subscribers + stats.trial_users + stats.expired_users

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
            <p className="text-sm text-gray-400 mt-0.5">{month} · Stripe + Supabase</p>
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* ── ROW 1 — Revenue + subscribers ─────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Revenue This Month"
            value={formatUSD(stats.revenue_this_month_usd)}
            sub={`vs ${formatUSD(stats.revenue_last_month_usd)} last month`}
            delta={revDeltaPct}
            deltaUp={revDeltaUp}
          />
          <StatCard
            label="Active Subscribers"
            value={stats.active_subscribers}
            sub="unlimited plan"
          />
          <StatCard
            label="Trial Users"
            value={stats.trial_users}
            sub="14-day free trial"
          />
          <StatCard
            label="Expired / Churned"
            value={stats.expired_users}
            sub={`${totalUsers ? ((stats.expired_users / totalUsers) * 100).toFixed(1) : "0"}% of total`}
          />
        </div>

        {/* ── ROW 2 — Conversion funnel ──────────────────────────────────── */}
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Conversion Funnel — {month}
          </h2>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <FunnelBar
              label="Signups"
              value={stats.funnel.signups}
              max={stats.funnel.signups}
              conversion="—"
            />
            <FunnelBar
              label="DNA Score Generated"
              value={stats.funnel.dna_scores}
              max={stats.funnel.signups}
              conversion={funnelConversion(stats.funnel.signups, stats.funnel.dna_scores)}
            />
            <FunnelBar
              label="Swarm Analysis Run"
              value={stats.funnel.swarm_runs}
              max={stats.funnel.signups}
              conversion={funnelConversion(stats.funnel.signups, stats.funnel.swarm_runs)}
            />
            <FunnelBar
              label="Report Purchased"
              value={stats.funnel.purchases}
              max={stats.funnel.signups}
              conversion={funnelConversion(stats.funnel.signups, stats.funnel.purchases)}
            />
          </div>
        </section>

        {/* ── ROW 3 — Recent purchases table ────────────────────────────── */}
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Recent Purchases
          </h2>
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    {["User", "Plan", "Amount", "Date"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 bg-gray-950">
                  {stats.recent_purchases.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-sm">
                        No purchases this month.
                      </td>
                    </tr>
                  )}
                  {stats.recent_purchases.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-900/40 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs max-w-[200px] truncate">
                        {p.email || p.user_id.slice(0, 12) + "…"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          p.plan_type === "unlimited"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                        }`}>
                          {p.plan_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-100 tabular-nums font-medium">
                        {formatUSD(p.amount_usd)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {formatDate(p.purchased_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
