"use client"
export const dynamic = "force-dynamic"

/**
 * /dashboard/admin/leads
 * Kanban board for B2B lead pipeline management.
 * Admin-only (middleware enforces advisor role on /dashboard/admin).
 */

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Lead {
  id: string
  name: string
  email: string
  company?: string
  role?: string
  aum_range?: string
  source?: string
  status: string
  notes?: string
  interested_plan?: string
  created_at: string
  contacted_at?: string
  won_at?: string
}

interface LeadStats {
  total: number
  by_status: Record<string, number>
  conversion_rate: number
  this_week: number
  last_week: number
  won_this_month: number
  pipeline_mrr: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "new",            label: "New",      color: "border-t-primary" },
  { key: "contacted",      label: "Contacted", color: "border-t-yellow-500" },
  { key: "demo_scheduled", label: "Demo",      color: "border-t-purple-500" },
  { key: "proposal_sent",  label: "Proposal",  color: "border-t-orange-500" },
  { key: "won",            label: "Won ✓",     color: "border-t-emerald-500" },
  { key: "lost",           label: "Lost",      color: "border-t-red-500" },
]

const PLAN_BADGE: Record<string, string> = {
  advisor:    "bg-purple-100 text-purple-800 border border-purple-200",
  enterprise: "bg-primary-light text-primary-dark border border-primary/25",
  retail:     "bg-emerald-50 text-emerald-800 border border-emerald-200",
}

const AUM_COLORS: Record<string, string> = {
  ">200M":    "text-amber-700",
  "50-200M":  "text-primary",
  "10-50M":   "text-navy",
  "<10M":     "text-muted2",
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", { month: "short", day: "numeric" })
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead Detail Modal
// ─────────────────────────────────────────────────────────────────────────────

function LeadModal({
  lead,
  onClose,
  onStatusChange,
}: {
  lead: Lead
  onClose: () => void
  onStatusChange: (id: string, status: string, notes?: string) => Promise<void>
}) {
  const [status, setStatus]   = useState(lead.status)
  const [notes, setNotes]     = useState(lead.notes ?? "")
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onStatusChange(lead.id, status, notes)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-5 rounded-2xl border border-border bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">{lead.name}</h2>
            <p className="text-sm text-muted2">{lead.company ?? "—"} · {lead.role ?? "—"}</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-muted2 hover:text-navy">
            ×
          </button>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="mb-0.5 text-xs text-muted2">Email</p>
            <a href={`mailto:${lead.email}`} className="text-primary hover:underline truncate block">{lead.email}</a>
          </div>
          <div>
            <p className="mb-0.5 text-xs text-muted2">AUM</p>
            <p className={`font-medium ${AUM_COLORS[lead.aum_range ?? ""] ?? "text-navy"}`}>{lead.aum_range ?? "—"}</p>
          </div>
          <div>
            <p className="mb-0.5 text-xs text-muted2">Source</p>
            <p className="text-navy">{lead.source ?? "—"}</p>
          </div>
          <div>
            <p className="mb-0.5 text-xs text-muted2">Interested Plan</p>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_BADGE[lead.interested_plan ?? ""] ?? "border border-border bg-surface-2 text-navy"}`}
            >
              {lead.interested_plan ?? "—"}
            </span>
          </div>
          <div>
            <p className="mb-0.5 text-xs text-muted2">Created</p>
            <p className="text-navy">{fmt(lead.created_at)}</p>
          </div>
          {lead.contacted_at && (
            <div>
              <p className="mb-0.5 text-xs text-muted2">Contacted</p>
              <p className="text-navy">{fmt(lead.contacted_at)}</p>
            </div>
          )}
        </div>

        {/* Status selector */}
        <div>
          <p className="mb-1.5 text-xs text-muted2">Status</p>
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map((col) => (
              <button
                key={col.key}
                onClick={() => setStatus(col.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  status === col.key
                    ? "border-primary bg-primary text-white"
                    : "border-border text-muted2 hover:border-primary/40"
                }`}
              >
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="mb-1.5 text-xs text-muted2">Notes</p>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-base resize-none text-sm"
            placeholder="Internal notes..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <a
            href={`mailto:${lead.email}`}
            className="rounded-lg border border-border px-4 py-2 text-sm text-navy transition-colors hover:border-primary/40"
          >
            Send Email
          </a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary hover:bg-primary disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-colors"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function LeadsAdminPage() {
  const { getAccessToken } = useAuth()
  const [leads, setLeads]     = useState<Lead[]>([])
  const [stats, setStats]     = useState<LeadStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [selected, setSelected] = useState<Lead | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) { setError("Not authenticated"); return }
      const [leadsRes, statsRes] = await Promise.all([
        apiFetch("/api/admin/leads?per_page=200", { cache: "no-store" }),
        apiFetch("/api/admin/leads/stats", { cache: "no-store" }),
      ])
      if (leadsRes.status === 403) { setError("Admin access required."); return }
      if (!leadsRes.ok) throw new Error(`HTTP ${leadsRes.status}`)
      const leadsData = await leadsRes.json()
      setLeads(leadsData.leads ?? leadsData ?? [])
      if (statsRes.ok) setStats(await statsRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => { load() }, [load])

  const handleStatusChange = useCallback(async (id: string, status: string, notes?: string) => {
    const res = await apiFetch(`/api/admin/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, notes }),
    })
    if (!res.ok) throw new Error("Could not update lead")
    const updated = await res.json()
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)))
    setSelected((prev) => (prev?.id === id ? { ...prev, ...updated } : prev))
  }, [])

  const byStatus = (status: string) => leads.filter((l) => l.status === status)

  if (loading) {
    return (
      <div className="min-h-screen max-w-full space-y-6 bg-transparent p-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((c) => (
            <div key={c.key} className="min-w-[240px] space-y-3">
              <Skeleton className="h-6 w-24" />
              {[1,2,3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto min-h-screen max-w-7xl bg-transparent p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-red-800">Could not load leads</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-800 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent text-navy">
      <div className="space-y-6 px-4 py-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Lead Pipeline</h1>
            <p className="mt-0.5 text-sm text-muted2">B2B sales management</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-navy hover:border-primary/40"
          >
            Refresh
          </button>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="data-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-navy">{stats.total}</p>
              <p className="mt-0.5 text-xs text-muted2">Total Leads</p>
            </div>
            <div className="data-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-primary">{stats.this_week}</p>
              <p className="mt-0.5 text-xs text-muted2">This Week</p>
            </div>
            <div className="data-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">
                {stats.conversion_rate?.toFixed(1) ?? "0"}%
              </p>
              <p className="mt-0.5 text-xs text-muted2">Conversion Rate</p>
            </div>
            <div className="data-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{stats.won_this_month ?? 0}</p>
              <p className="mt-0.5 text-xs text-muted2">Won This Month</p>
            </div>
          </div>
        )}

        {/* Kanban board */}
        <div className="flex gap-4 overflow-x-auto pb-6">
          {COLUMNS.map((col) => {
            const colLeads = byStatus(col.key)
            return (
              <div
                key={col.key}
                className={`min-w-[240px] max-w-[280px] flex-shrink-0 rounded-xl border border-border border-t-2 bg-white ${col.color}`}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-4 pb-2 pt-4">
                  <h3 className="text-sm font-semibold text-navy">{col.label}</h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted2">
                    {colLeads.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="px-3 pb-3 space-y-2">
                  {colLeads.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted2">
                      No leads
                    </div>
                  )}
                  {colLeads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelected(lead)}
                      className="w-full space-y-2 rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors hover:border-primary/30 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight text-navy">{lead.name}</p>
                        {lead.aum_range && (
                          <span
                            className={`flex-shrink-0 whitespace-nowrap text-xs font-medium ${AUM_COLORS[lead.aum_range] ?? "text-muted2"}`}
                          >
                            {lead.aum_range}
                          </span>
                        )}
                      </div>
                      {lead.company && <p className="truncate text-xs text-muted2">{lead.company}</p>}
                      <div className="flex items-center justify-between">
                        {lead.interested_plan ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-sm font-medium ${PLAN_BADGE[lead.interested_plan] ?? "bg-surface-2 text-muted2"}`}
                          >
                            {lead.interested_plan}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="text-sm text-muted2">{fmt(lead.created_at)}</span>
                      </div>
                      {lead.source && <p className="text-sm text-muted2">via {lead.source.replace(/_/g, " ")}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

      </div>

      {/* Detail modal */}
      {selected && (
        <LeadModal
          lead={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
