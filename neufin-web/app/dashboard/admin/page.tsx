"use client"

/**
 * /dashboard/admin
 *
 * Internal ops admin panel — advisor or internal admin.
 * Displays all NeuFin user profiles with actions for trial extension
 * and onboarding email resend.
 *
 * Linked from the dashboard sidebar when is_admin / admin role.
 */

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useUser } from "@/lib/store"
import { apiFetch } from "@/lib/api-client"
import type { UserAdminRow } from "@/app/api/admin/users/route"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type PlanFilter = "all" | "active" | "trial" | "expired"

function planBadgeClass(status: string): string {
  switch (status) {
    case "active":  return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
    case "trial":   return "bg-primary/15 text-primary border border-primary/30"
    case "expired": return "bg-red-500/15 text-red-400 border border-red-500/30"
    default:        return "bg-[#F8FAFC] text-[#94A3B8]"
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "numeric" })
}

function trialEnds(startedAt: string | null): string {
  if (!startedAt) return "—"
  const ends = new Date(new Date(startedAt).getTime() + 14 * 86400_000)
  const daysLeft = Math.ceil((ends.getTime() - Date.now()) / 86400_000)
  if (daysLeft <= 0) return "Expired"
  return `${daysLeft}d left (${formatDate(ends.toISOString())})`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#F8FAFC] ${className}`} />
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="data-card rounded-xl">
      <p className="text-xs text-[#94A3B8] mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-navy">{value}</p>
      {sub && <p className="text-xs text-[#94A3B8] mt-1">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Extend Trial modal
// ─────────────────────────────────────────────────────────────────────────────

function ExtendTrialModal({
  user,
  onClose,
  onSuccess,
}: {
  user: UserAdminRow
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setLoading(true)
    setErr(null)
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/extend-trial`, {
        method: "POST",
        body: JSON.stringify({ days }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message ?? "Failed")
      onSuccess(`Trial extended — new end date: ${formatDate(json.new_trial_ends)}`)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E2E8F0] bg-white p-6 space-y-4">
        <h3 className="font-semibold text-navy">Extend Trial</h3>
        <p className="text-sm text-[#64748B]">{user.email || user.id}</p>
        <div>
          <label className="text-xs text-[#94A3B8] block mb-1.5">Days to add</label>
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input-base"
          />
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#E2E8F0] px-4 py-1.5 text-sm text-[#64748B] hover:text-navy transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter()
  const { user, getAccessToken } = useAuth()
  const { isAdmin, loading: authSubscriptionLoading, subscriptionTier } = useUser()
  const [rows, setRows]         = useState<UserAdminRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState<PlanFilter>("all")
  const [search, setSearch]     = useState("")
  const [toast, setToast]       = useState<string | null>(null)
  const [extending, setExtending] = useState<UserAdminRow | null>(null)
  const [resending, setResending] = useState<string | null>(null)

  const load = useCallback(async (plan: PlanFilter) => {
    const t = await getAccessToken()
    if (!t) { setError("Not authenticated"); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const url = plan === "all" ? "/api/admin/users" : `/api/admin/users?plan=${plan}`
      const res = await apiFetch(url, { cache: "no-store" })
      if (res.status === 403) { setError("Advisor or admin access required for this panel."); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRows(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => { load(filter) }, [filter, load])

  const canAccessPanel =
    isAdmin || subscriptionTier === "advisor" || subscriptionTier === "enterprise"

  useEffect(() => {
    if (authSubscriptionLoading || !user) return
    if (!canAccessPanel) {
      router.replace("/dashboard")
    }
  }, [authSubscriptionLoading, user, canAccessPanel, router])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function resendOnboarding(row: UserAdminRow) {
    setResending(row.id)
    try {
      const res = await apiFetch(`/api/admin/users/${row.id}/resend-onboarding`, {
        method: "POST",
      })
      const json = await res.json()
      showToast(json.ok ? `Onboarding email sent to ${row.email || row.id}` : "Failed to send email")
    } catch {
      showToast("Failed to send email")
    } finally {
      setResending(null)
    }
  }

  // Filter rows by search
  const displayed = rows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.email.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
  })

  // Stats
  const active  = rows.filter((r) => r.subscription_status === "active").length
  const trial   = rows.filter((r) => r.subscription_status === "trial").length
  const expired = rows.filter((r) => r.subscription_status === "expired").length

  if (authSubscriptionLoading || !user) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (!canAccessPanel) {
    return null
  }

  return (
    <div className="min-h-screen bg-transparent text-navy">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Admin</h1>
            <p className="text-sm text-[#64748B] mt-0.5">Internal ops panel · advisor or admin</p>
          </div>
          <div className="text-xs text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 bg-amber-500/10">
            Internal use only — not visible to regular users
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Stats row */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Users"   value={rows.length} />
            <StatCard label="Active"        value={active}  sub="paid subscribers" />
            <StatCard label="Trial"         value={trial}   sub="14-day trial" />
            <StatCard label="Expired"       value={expired} sub="trial ended, no payment" />
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Plan filter */}
          <div className="flex rounded-lg border border-[#E2E8F0] overflow-hidden text-xs">
            {(["all", "active", "trial", "expired"] as PlanFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  filter === p
                    ? "bg-[#F8FAFC] text-navy"
                    : "text-[#94A3B8] hover:text-navy/90 hover:bg-[#F8FAFC]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Search */}
          <input
            type="text"
            placeholder="Search email or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base flex-1 min-w-[200px]"
          />
          <span className="text-xs text-[#94A3B8]">{displayed.length} users</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto -mx-4 rounded-xl border border-[#E2E8F0] bg-white md:mx-0">
          <table className="table-base min-w-[640px]">
              <thead>
                <tr>
                  {["Email", "Plan", "Trial Ends", "Joined", "Last Login", "DNA Scores", "Reports", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-[#64748B]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {loading && Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

                {!loading && displayed.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-[#94A3B8] text-sm">
                      No users found.
                    </td>
                  </tr>
                )}

                {!loading && displayed.map((row) => (
                  <tr key={row.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 text-navy/90 max-w-[200px] truncate font-mono text-xs">
                      {row.email || <span className="text-[#94A3B8]">{row.id.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-sm font-medium ${planBadgeClass(row.subscription_status)}`}>
                        {row.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#64748B] text-xs whitespace-nowrap">
                      {row.subscription_status === "trial" ? trialEnds(row.trial_started_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#64748B] text-xs whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-[#64748B] text-xs whitespace-nowrap">
                      {formatDate(row.last_sign_in_at)}
                    </td>
                    <td className="px-4 py-3 text-navy/90 tabular-nums text-center">
                      {row.dna_score_count}
                    </td>
                    <td className="px-4 py-3 text-navy/90 tabular-nums text-center">
                      {row.reports_purchased}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExtending(row)}
                          className="rounded-md border border-primary/30 px-2 py-1 text-sm text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                        >
                          Extend Trial
                        </button>
                        <button
                          onClick={() => resendOnboarding(row)}
                          disabled={resending === row.id}
                          className="rounded-md border border-[#E2E8F0] px-2 py-1 text-sm text-[#64748B] hover:text-navy hover:border-[#94A3B8] disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {resending === row.id ? "Sending…" : "Resend Email"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>

      {/* Extend trial modal */}
      {extending && (
        <ExtendTrialModal
          user={extending}
          onClose={() => setExtending(null)}
          onSuccess={showToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-500/30 bg-white px-4 py-3 text-sm text-emerald-600 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
