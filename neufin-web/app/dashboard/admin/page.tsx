"use client"

/**
 * /dashboard/admin
 *
 * Internal ops admin panel — advisor role only.
 * Displays all NeuFin user profiles with actions for trial extension
 * and onboarding email resend.
 *
 * Not linked from public navigation. Access via direct URL.
 */

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import type { UserAdminRow } from "@/app/api/admin/users/route"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type PlanFilter = "all" | "active" | "trial" | "expired"

function planBadgeClass(status: string): string {
  switch (status) {
    case "active":  return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
    case "trial":   return "bg-blue-500/15 text-blue-400 border border-blue-500/30"
    case "expired": return "bg-red-500/15 text-red-400 border border-red-500/30"
    default:        return "bg-gray-700 text-gray-400"
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
  return <div className={`animate-pulse rounded-md bg-gray-800 ${className}`} />
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Extend Trial modal
// ─────────────────────────────────────────────────────────────────────────────

function ExtendTrialModal({
  user,
  token,
  onClose,
  onSuccess,
}: {
  user: UserAdminRow
  token: string
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
      const res = await fetch(`/api/admin/users/${user.id}/extend-trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4">
        <h3 className="font-semibold text-gray-100">Extend Trial</h3>
        <p className="text-sm text-gray-400">{user.email || user.id}</p>
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">Days to add</label>
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
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
  const { user, getAccessToken } = useAuth()
  const [rows, setRows]         = useState<UserAdminRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState<PlanFilter>("all")
  const [search, setSearch]     = useState("")
  const [toast, setToast]       = useState<string | null>(null)
  const [extending, setExtending] = useState<UserAdminRow | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [token, setToken]       = useState<string | null>(null)

  // Resolve token once
  useEffect(() => {
    getAccessToken().then(setToken)
  }, [getAccessToken])

  const load = useCallback(async (plan: PlanFilter) => {
    const t = await getAccessToken()
    setToken(t)
    if (!t) { setError("Not authenticated"); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const url = plan === "all" ? "/api/admin/users" : `/api/admin/users?plan=${plan}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } })
      if (res.status === 403) { setError("Advisor role required to access admin panel."); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRows(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => { load(filter) }, [filter, load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function resendOnboarding(row: UserAdminRow) {
    const t = token
    if (!t) return
    setResending(row.id)
    try {
      const res = await fetch(`/api/admin/users/${row.id}/resend-onboarding`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Admin</h1>
            <p className="text-sm text-gray-400 mt-0.5">Internal ops panel · advisor only</p>
          </div>
          <div className="text-xs text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 bg-amber-500/10">
            ⚠ Internal use only — not visible to regular users
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
          <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs">
            {(["all", "active", "trial", "expired"] as PlanFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  filter === p
                    ? "bg-gray-700 text-gray-100"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
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
            className="flex-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-600">{displayed.length} users</span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 border-b border-gray-800">
                <tr>
                  {["Email", "Plan", "Trial Ends", "Joined", "Last Login", "DNA Scores", "Reports", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
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
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-600 text-sm">
                      No users found.
                    </td>
                  </tr>
                )}

                {!loading && displayed.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-900/50 transition-colors">
                    <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate font-mono text-xs">
                      {row.email || <span className="text-gray-600">{row.id.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${planBadgeClass(row.subscription_status)}`}>
                        {row.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {row.subscription_status === "trial" ? trialEnds(row.trial_started_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(row.last_sign_in_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums text-center">
                      {row.dna_score_count}
                    </td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums text-center">
                      {row.reports_purchased}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExtending(row)}
                          className="rounded-md border border-blue-500/30 px-2 py-1 text-[11px] text-blue-400 hover:bg-blue-500/10 transition-colors whitespace-nowrap"
                        >
                          Extend Trial
                        </button>
                        <button
                          onClick={() => resendOnboarding(row)}
                          disabled={resending === row.id}
                          className="rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-50 transition-colors whitespace-nowrap"
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
      </div>

      {/* Extend trial modal */}
      {extending && token && (
        <ExtendTrialModal
          user={extending}
          token={token}
          onClose={() => setExtending(null)}
          onSuccess={showToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-500/30 bg-gray-900 px-4 py-3 text-sm text-emerald-400 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
