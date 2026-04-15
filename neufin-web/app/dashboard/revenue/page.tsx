"use client"

/**
 * /dashboard/revenue
 *
 * NeuFin revenue command centre — admin only.
 * Shows MRR/ARR, subscriber plan breakdown, lead pipeline, conversion funnel, recent purchases.
 */

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"

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

interface LeadStats {
  total:           number
  by_status:       Record<string, number>
  conversion_rate: number
  this_week:       number
  last_week:       number
  won_this_month:  number
  pipeline_mrr:    number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
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
  return <div className={`animate-pulse rounded-md bg-[#F8FAFC] ${className}`} />
}

function StatCard({
  label, value, sub, delta, deltaUp, accent,
}: {
  label: string; value: string | number; sub?: string; delta?: string; deltaUp?: boolean; accent?: string
}) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${accent ?? "border-[#E2E8F0]"}`}>
      <p className="text-xs text-[#94A3B8] mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-navy">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-[#94A3B8]">{sub}</p>}
        {delta && (
          <span className={`text-xs font-medium ${deltaUp ? "text-emerald-400" : "text-red-400"}`}>{delta}</span>
        )}
      </div>
    </div>
  )
}

function FunnelBar({ label, value, max, conversion }: { label: string; value: number; max: number; conversion: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-navy/90">{label}</span>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-navy font-medium">{value.toLocaleString()}</span>
          {conversion !== "—" && <span className="text-[#94A3B8]">{conversion} CVR</span>}
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-[#F8FAFC]">
        <div className="h-2 rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  new:            "bg-primary/20 text-primary border border-primary/30",
  contacted:      "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  demo_scheduled: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  demo_done:      "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
  proposal_sent:  "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  won:            "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  lost:           "bg-red-500/20 text-red-300 border border-red-500/30",
  nurture:        "bg-[#F1F5F9] text-navy/90 border border-[#E2E8F0]",
}

const STATUS_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", demo_scheduled: "Demo Sched.",
  demo_done: "Demo Done", proposal_sent: "Proposal", won: "Won", lost: "Lost", nurture: "Nurture",
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const { getAccessToken } = useAuth()
  const [stats, setStats]       = useState<RevenueStats | null>(null)
  const [leads, setLeads]       = useState<LeadStats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) { setError("Not authenticated"); return }
      const [revRes, leadRes] = await Promise.all([
        apiFetch("/api/revenue/stats", { cache: "no-store" }),
        apiFetch("/api/admin/leads/stats", { cache: "no-store" }),
      ])
      if (revRes.status === 403) { setError("Admin role required."); return }
      if (!revRes.ok) throw new Error(`Revenue HTTP ${revRes.status}`)
      setStats(await revRes.json())
      if (leadRes.ok) setLeads(await leadRes.json())
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
      <div className="min-h-screen bg-transparent p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-transparent p-6 max-w-7xl mx-auto">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <p className="font-semibold text-red-400">Revenue data unavailable</p>
          <p className="text-sm text-red-400/70 mt-1">{error}</p>
          <button onClick={load} className="mt-4 text-xs text-red-400 border border-red-500/30 rounded-md px-3 py-1.5 hover:bg-red-500/10 transition-colors">Retry</button>
        </div>
      </div>
    )
  }

  if (!stats) return null

  const { pct: revDeltaPct, up: revDeltaUp } = revDelta(stats.revenue_this_month_usd, stats.revenue_last_month_usd)
  const mrr = stats.revenue_this_month_usd
  const arr = mrr * 12
  const totalUsers = stats.active_subscribers + stats.trial_users + stats.expired_users

  return (
    <div className="min-h-screen bg-transparent text-navy">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* Header */}
        <div className="section-header">
          <div>
            <h1>Revenue Command Centre</h1>
            <p>
              {month} · Stripe + Supabase
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/admin/leads" className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs text-navy/90 transition-colors hover:border-[#94A3B8]">
              Leads →
            </Link>
            <button type="button" onClick={load} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs text-navy/90 transition-colors hover:border-[#94A3B8]">
              Refresh
            </button>
          </div>
        </div>

        {/* ── ROW 1 — MRR / ARR / Subscribers ─────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="MRR"
            value={formatUSD(mrr)}
            sub={`vs ${formatUSD(stats.revenue_last_month_usd)} last month`}
            delta={revDeltaPct}
            deltaUp={revDeltaUp}
            accent="border-primary/30"
          />
          <StatCard label="ARR (run rate)" value={formatUSD(arr)} sub="MRR × 12" accent="border-primary/20" />
          <StatCard
            label="Active Subscribers"
            value={stats.active_subscribers}
            sub="paid plans"
          />
          <StatCard
            label="Trial / Churned"
            value={`${stats.trial_users} / ${stats.expired_users}`}
            sub={`${totalUsers ? ((stats.expired_users / totalUsers) * 100).toFixed(1) : "0"}% churn`}
          />
        </div>

        {/* ── ROW 2 — Lead Pipeline ─────────────────────────────────────── */}
        {leads && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#94A3B8]">
                B2B Lead Pipeline
              </h2>
              <Link href="/dashboard/admin/leads" className="text-xs text-primary hover:text-primary">
                Manage leads →
              </Link>
            </div>
            <div className="data-card rounded-xl">
              {/* Stats bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-navy">{leads.total}</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">Total Leads</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{leads.this_week}</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">This Week</p>
                  {leads.last_week > 0 && (
                    <p className={`text-xs mt-0.5 ${leads.this_week >= leads.last_week ? "text-emerald-400" : "text-red-400"}`}>
                      {leads.this_week >= leads.last_week ? "▲" : "▼"} vs {leads.last_week} last wk
                    </p>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">
                    {leads.conversion_rate?.toFixed(1) ?? "0"}%
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">Conversion Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-400">{formatUSD(leads.pipeline_mrr)}</p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">Pipeline MRR</p>
                </div>
              </div>
              {/* Status breakdown */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const count = leads.by_status?.[key] ?? 0
                  return (
                    <span key={key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[key] ?? "bg-[#F8FAFC] text-navy/90"}`}>
                      {label}
                      <span className="font-bold">{count}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── ROW 3 — Conversion funnel ──────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#94A3B8] mb-3">
            Conversion Funnel — {month}
          </h2>
          <div className="data-card rounded-xl space-y-4">
            <FunnelBar label="Signups" value={stats.funnel.signups} max={stats.funnel.signups} conversion="—" />
            <FunnelBar label="DNA Score Generated" value={stats.funnel.dna_scores} max={stats.funnel.signups} conversion={funnelConversion(stats.funnel.signups, stats.funnel.dna_scores)} />
            <FunnelBar label="Swarm Analysis Run" value={stats.funnel.swarm_runs} max={stats.funnel.signups} conversion={funnelConversion(stats.funnel.signups, stats.funnel.swarm_runs)} />
            <FunnelBar label="Report Purchased" value={stats.funnel.purchases} max={stats.funnel.signups} conversion={funnelConversion(stats.funnel.signups, stats.funnel.purchases)} />
          </div>
        </section>

        {/* ── ROW 4 — Recent purchases table ────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#94A3B8] mb-3">
            Recent Purchases
          </h2>
          <div className="overflow-x-auto -mx-4 rounded-xl border border-[#E2E8F0] bg-white md:mx-0">
            <table className="table-base min-w-[640px]">
                <thead>
                  <tr>
                    {["User", "Plan", "Amount", "Date"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-[#64748B]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {stats.recent_purchases.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-[#94A3B8] text-sm">No purchases this month.</td>
                    </tr>
                  )}
                  {stats.recent_purchases.map((p, i) => (
                    <tr key={i} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-4 py-3 text-navy/90 font-mono text-xs max-w-[200px] truncate">
                        {p.email || p.user_id.slice(0, 12) + "…"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-sm font-medium ${
                          p.plan_type === "advisor" ? "bg-purple-500/15 text-purple-400 border border-purple-500/30" :
                          p.plan_type === "enterprise" ? "bg-primary/15 text-primary border border-primary/30" :
                          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        }`}>
                          {p.plan_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-navy tabular-nums font-medium">{formatUSD(p.amount_usd)}</td>
                      <td className="px-4 py-3 text-[#64748B] text-xs whitespace-nowrap">{formatDate(p.purchased_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </section>

      </div>
    </div>
  )
}
