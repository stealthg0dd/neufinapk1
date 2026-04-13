"use client"

/**
 * CTech Agent OS — Chief of Staff Command Centre
 * Route: /dashboard/cos
 *
 * SECTION 1 — Sticky top bar (greeting, SGT clock, budget pill + progress bar)
 * SECTION 2 — Venture cards row (5 cards, horizontal scroll on mobile)
 * SECTION 3 — Daily Brief panel (collapsible, actions-required checkboxes)
 * SECTION 4 — Live Agent Activity feed (auto-refresh 30s)
 * SECTION 5 — Provider Health Strip (hidden on mobile)
 *
 * Tailwind only — no external UI libraries.
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { apiFetch, apiPost } from "@/lib/api-client"
import VentureCard from "@/components/VentureCard"
import AgentActivityFeed from "@/components/AgentActivityFeed"
import ProviderHealthStrip from "@/components/ProviderHealthStrip"
import type {
  DashboardData,
  VentureCard as VentureCardData,
  TaskRecord,
  GitCommit,
  AgentCallLog,
} from "@/lib/dashboard-types"

// ── Venture config (static — maps venture id to metadata) ─────────────────────

const VENTURE_ORDER = ["neufin", "arisole", "neumas", "apex_golf", "defquant"] as const
type VentureId = (typeof VENTURE_ORDER)[number]

interface VentureMeta {
  name: string
  businessHead: string
  status: VentureCardData["status"]
  hasRepo: boolean
}

const VENTURE_META: Record<VentureId, VentureMeta> = {
  neufin:    { name: "NeuFin",    businessHead: "TW",       status: "active",   hasRepo: true  },
  arisole:   { name: "Arisole",   businessHead: "JT",       status: "active",   hasRepo: true  },
  neumas:    { name: "Neumas",    businessHead: "Brooksie", status: "active",   hasRepo: true  },
  apex_golf: { name: "Apex Golf", businessHead: "Fred",     status: "dormant",  hasRepo: false },
  defquant:  { name: "DefQuant",  businessHead: "VS",       status: "active",   hasRepo: false },
}

// ── Utility helpers ────────────────────────────────────────────────────────────

function sgtNow(): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date())
}

function sgtHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore", hour: "numeric", hour12: false,
    }).format(new Date()),
    10
  )
}

function greeting(): string {
  const h = sgtHour()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function pct(val: number, cap: number): number {
  if (!cap) return 0
  return Math.min(100, Math.round((val / cap) * 100))
}

function budgetBarClass(p: number): string {
  if (p >= 90) return "bg-red-500"
  if (p >= 70) return "bg-yellow-400"
  return "bg-emerald-500"
}

function budgetPillClass(p: number): string {
  if (p >= 90) return "border-red-500/40 bg-red-500/10 text-red-300"
  if (p >= 70) return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getVentureMeta(id: string): VentureMeta {
  if (Object.prototype.hasOwnProperty.call(VENTURE_META, id)) {
    return VENTURE_META[id as VentureId]
  }
  return { name: id, businessHead: "-", status: "dormant", hasRepo: false }
}

function getCommitList(commits: Record<string, GitCommit[]>, id: string): GitCommit[] {
  return Object.entries(commits).find(([key]) => key === id)?.[1] ?? []
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-shell-raised ${className}`} />
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-shell-deep">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-shell-deep/90 backdrop-blur-sm border-b border-shell-border px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
        <Skeleton className="h-0.5 w-full mt-3" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Venture cards */}
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-44 w-64 flex-shrink-0" />)}
        </div>
        {/* Brief panel */}
        <Skeleton className="h-12 w-full" />
        {/* Activity feed */}
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      </div>
    </div>
  )
}

// ── Section 3: Brief Panel ─────────────────────────────────────────────────────

function BriefPanel({
  briefs,
  openVentures,
  completedActions,
  onToggleVenture,
  onToggleAll,
  onActionComplete,
  onMarkActionWithRor,
}: {
  briefs: DashboardData["briefs"]
  openVentures: Set<string>
  completedActions: Set<string>
  onToggleVenture: (id: string) => void
  onToggleAll: () => void
  onActionComplete: (key: string, action: string) => void
  onMarkActionWithRor: (action: string) => void
}) {
  const [panelOpen, setPanelOpen] = useState(false)

  // Ror's triage preview — first brief's first line
  const preview = briefs[0]?.content?.split("\n").find((l) => l.trim()) ?? "No brief available yet."

  return (
    <section>
      {/* Collapsible header */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="w-full flex items-center gap-3 rounded-xl border border-shell-border bg-shell/60 px-5 py-3.5 hover:bg-shell transition-colors"
      >
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${panelOpen ? "bg-blue-400" : "bg-shell-muted"}`} />
        <div className="flex-1 text-left">
          <span className="text-xs font-semibold text-shell-fg/90">Daily Brief — Ror&apos;s Triage</span>
          {!panelOpen && (
            <span className="ml-3 text-xs text-shell-subtle truncate hidden sm:inline">
              {preview.slice(0, 120)}{preview.length > 120 ? "…" : ""}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-shell-muted flex-shrink-0 transition-transform ${panelOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Panel content */}
      {panelOpen && (
        <div className="mt-2 rounded-xl border border-shell-border bg-shell/40 p-4 space-y-2">
          {/* Toggle all */}
          <div className="flex justify-end mb-1">
            <button
              onClick={onToggleAll}
              className="text-xs text-shell-subtle hover:text-shell-fg/90 transition-colors"
            >
              {VENTURE_ORDER.every((v) => openVentures.has(v)) ? "Collapse all" : "Expand all"}
            </button>
          </div>

          {VENTURE_ORDER.map((ventureId) => {
            const brief   = briefs.find((b) => b.company_id === ventureId)
            const open    = openVentures.has(ventureId)
            const meta    = getVentureMeta(ventureId)
            const actions = brief?.actions_required ?? []

            return (
              <div key={ventureId} className="rounded-xl border border-shell-border bg-shell overflow-hidden">
                {/* Accordion header */}
                <button
                  onClick={() => onToggleVenture(ventureId)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-shell-raised/40 transition-colors"
                >
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${brief ? "bg-emerald-400" : "bg-shell-muted"}`} />
                  <span className="font-medium text-shell-fg text-sm">{meta.name}</span>
                  {brief && (
                    <span className="text-xs text-shell-subtle">{relativeTime(brief.created_at)}</span>
                  )}
                  {actions.length > 0 && (
                    <span className="ml-2 rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-sm text-amber-300">
                      {actions.length} action{actions.length > 1 ? "s" : ""}
                    </span>
                  )}
                  <svg
                    className={`ml-auto h-4 w-4 text-shell-subtle transition-transform ${open ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  >
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Accordion content */}
                {open && (
                  <div className="border-t border-shell-border px-4 py-4 space-y-4">
                    {/* Brief text */}
                    {brief ? (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-shell-muted leading-relaxed max-h-72 overflow-y-auto">
                        {brief.content}
                      </pre>
                    ) : (
                      <p className="text-sm text-shell-subtle">
                        No brief generated yet. Morning Engine runs at 07:00 SGT.
                      </p>
                    )}

                    {/* Actions required */}
                    {actions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400/70">
                          Actions Required
                        </p>
                        {actions.map((action, i) => {
                          const key  = `${ventureId}::${action}`
                          const done = completedActions.has(key)
                          return (
                            <label
                              key={i}
                              className={`flex items-start gap-2.5 cursor-pointer rounded-lg p-2.5 transition-colors ${
                                done
                                  ? "bg-emerald-500/5 border border-emerald-500/20"
                                  : "bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={done}
                                onChange={() => {
                                  if (!done) {
                                    onActionComplete(key, action)
                                    onMarkActionWithRor(`[${meta.name}] ${action}`)
                                  }
                                }}
                                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-amber-400 cursor-pointer"
                              />
                              <span className={`text-xs leading-snug ${done ? "line-through text-shell-subtle" : "text-amber-200/80"}`}>
                                {action}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Section 4: Activity header ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sm font-semibold uppercase tracking-widest text-shell-subtle">
      {children}
    </span>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ChiefOfStaffDashboard() {
  const [sgtTime,         setSgtTime]         = useState("")
  const [data,            setData]            = useState<DashboardData | null>(null)
  const [tasks,           setTasks]           = useState<TaskRecord[]>([])
  const [commits,         setCommits]         = useState<Record<string, GitCommit[]>>({})
  const [activityLogs,    setActivityLogs]    = useState<AgentCallLog[]>([])
  const [loading,         setLoading]         = useState(true)
  const [activityLoading, setActivityLoading] = useState(false)
  const [fetchError,      setFetchError]      = useState<string | null>(null)
  const [lastRefreshed,   setLastRefreshed]   = useState<Date | null>(null)
  const [pulse,           setPulse]           = useState(false)
  const [expandedCard,    setExpandedCard]    = useState<string | null>(null)
  const [openBriefVentures, setOpenBriefVentures] = useState<Set<string>>(new Set())
  const [completedActions,  setCompletedActions]  = useState<Set<string>>(new Set())
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── SGT live clock ─────────────────────────────────────────────────────────
  useEffect(() => {
    setSgtTime(sgtNow())
    const id = setInterval(() => setSgtTime(sgtNow()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Fetch main dashboard data ──────────────────────────────────────────────
  const fetchMain = useCallback(async () => {
    try {
      const [dashRes, tasksRes] = await Promise.all([
        apiFetch("/api/dashboard", { cache: "no-store" }),
        apiFetch("/api/tasks", { cache: "no-store" }),
      ])

      if (dashRes.ok) {
        const d = await dashRes.json() as DashboardData
        setData(d)
        setActivityLogs(d.callLogs ?? [])
        setFetchError(null)
      } else {
        const e = await dashRes.json().catch(() => ({})) as { error?: string }
        setFetchError(e.error ?? `HTTP ${dashRes.status}`)
      }

      if (tasksRes.ok) {
        const t = await tasksRes.json() as { tasks: TaskRecord[] }
        setTasks(t.tasks ?? [])
      }

      setLastRefreshed(new Date())
      setPulse(true)
      setTimeout(() => setPulse(false), 700)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "fetch failed")
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch GitHub commits per venture with repo ─────────────────────────────
  const fetchCommits = useCallback(async () => {
    const repoVentures = VENTURE_ORDER.filter((v) => getVentureMeta(v).hasRepo)
    const results = await Promise.allSettled(
      repoVentures.map(async (v) => {
        const res = await apiFetch(`/api/github/${v}`, { cache: "no-store" })
        if (!res.ok) return { venture: v, commits: [] }
        const d = await res.json() as { commits: GitCommit[] }
        return { venture: v, commits: d.commits ?? [] }
      })
    )
    const map = new Map<string, GitCommit[]>()
    for (const r of results) {
      if (r.status === "fulfilled") {
        map.set(r.value.venture, r.value.commits)
      }
    }
    setCommits(Object.fromEntries(map))
  }, [])

  // ── Refresh activity feed independently every 30s ──────────────────────────
  const refreshActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const res = await apiFetch("/api/dashboard", { cache: "no-store" })
      if (res.ok) {
        const d = await res.json() as DashboardData
        setActivityLogs(d.callLogs ?? [])
      }
    } finally {
      setActivityLoading(false)
    }
  }, [])

  // ── On mount: initial load + schedules ────────────────────────────────────
  useEffect(() => {
    fetchMain()
    fetchCommits()

    // Main data: refresh every 60s
    const mainId = setInterval(() => {
      fetchMain()
      fetchCommits()
    }, 60_000)

    // Activity feed: refresh every 30s
    activityIntervalRef.current = setInterval(refreshActivity, 30_000)

    return () => {
      clearInterval(mainId)
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current)
    }
  }, [fetchMain, fetchCommits, refreshActivity])

  // ── Mark action complete via Ror ───────────────────────────────────────────
  const markActionWithRor = useCallback(async (action: string) => {
    try {
      await apiPost("/api/agent-os/agent/ctech_corporate/chief_of_staff", {
        message: `Mark action as complete: ${action}`,
      })
    } catch {
      // Fire-and-forget — UI already updated optimistically
    }
  }, [])

  const handleActionComplete = useCallback((key: string) => {
    setCompletedActions((prev) => new Set([...prev, key]))
  }, [])

  // ── Build venture card data ────────────────────────────────────────────────
  const buildVentureCards = (): VentureCardData[] => {
    return VENTURE_ORDER.map((id) => {
      const meta  = getVentureMeta(id)
      const brief = data?.briefs.find((b) => b.company_id === id)
      const ventureTasks = tasks.filter((t) => t.company_id === id)
      const ventureCommits = getCommitList(commits, id)
      const latestCommit = ventureCommits.at(0)

      return {
        id,
        name:           meta.name,
        businessHead:   meta.businessHead,
        status:         meta.status,
        briefExcerpt:   (brief?.content ?? "").slice(0, 120),
        briefFull:      brief?.content ?? "",
        actionsRequired: brief?.actions_required ?? [],
        lastCommit:     latestCommit
          ? {
              message: latestCommit.message,
              author:  latestCommit.author,
              timeAgo: latestCommit.date,
            }
          : null,
        taskCounts: {
          pending:    ventureTasks.filter((t) => t.status === "pending").length,
          blocked:    ventureTasks.filter((t) => t.status === "blocked").length,
          done_today: 0, // tasks endpoint only returns pending/blocked
        },
      }
    })
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading && !data) return <PageSkeleton />

  // ── Budget ─────────────────────────────────────────────────────────────────
  const budget   = data?.budget
  const dayPct   = budget ? pct(budget.daily_spend, budget.daily_cap) : 0
  const ventureCards = buildVentureCards()

  return (
    <div className="min-h-screen bg-shell-deep text-shell-fg">

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — Sticky top bar
         ════════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 bg-shell-deep/95 backdrop-blur-md border-b border-shell-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            {/* Left: greeting + clock */}
            <div className="flex items-center gap-3 min-w-0">
              <div>
                <p className="text-sm font-semibold text-shell-fg leading-none">
                  {greeting()}, Varun
                </p>
                <p
                  className="text-sm text-shell-subtle tabular-nums mt-0.5"
                  suppressHydrationWarning
                >
                  {sgtTime} SGT
                </p>
              </div>
            </div>

            {/* Center: title */}
            <div className="hidden sm:block text-center flex-shrink-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-shell-muted">
                CTech Ventures
              </p>
              <p className="text-sm text-shell-subtle tracking-widest">
                Command Centre
              </p>
            </div>

            {/* Right: budget pill + controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {budget && (
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${budgetPillClass(dayPct)}`}>
                  ${(budget.daily_spend).toFixed(2)} / ${(budget.daily_cap).toFixed(0)} today
                </span>
              )}

              {/* Pulse indicator */}
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  {pulse && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {lastRefreshed && (
                  <span className="text-sm text-shell-subtle hidden sm:block">
                    {relativeTime(lastRefreshed.toISOString())}
                  </span>
                )}
              </div>

              {/* Manual refresh */}
              <button
                onClick={() => { fetchMain(); fetchCommits() }}
                className="rounded-lg border border-shell-border px-2.5 py-1.5 text-sm text-shell-muted hover:border-shell-muted hover:text-shell-fg transition-colors"
                title="Refresh all data"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Budget progress bar — full width */}
          {budget && (
            <div className="h-0.5 w-full bg-shell-raised -mb-px">
              <div
                className={`h-0.5 transition-all duration-700 ${budgetBarClass(dayPct)}`}
                style={{ width: `${dayPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
            <p className="text-xs text-yellow-300">Stale data — {fetchError}</p>
            <button
              onClick={fetchMain}
              className="ml-auto text-xs text-yellow-400 hover:text-yellow-200 underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* ════════════════════════════════════════════════════════════════
            SECTION 2 — Venture cards
           ════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Ventures</SectionLabel>
            <span className="text-sm text-shell-subtle">
              {tasks.filter((t) => t.status === "blocked").length} blocked across all ventures
            </span>
          </div>

          {/* Horizontal scroll on mobile, grid on desktop */}
          <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0 snap-x snap-mandatory sm:snap-none">
            {ventureCards.map((venture) => (
              <div key={venture.id} className="snap-start">
                <VentureCard
                  venture={venture}
                  tasks={tasks.filter((t) => t.company_id === venture.id)}
                  commits={commits[venture.id] ?? []}
                  expanded={expandedCard === venture.id}
                  completedActions={completedActions}
                  onToggle={() => setExpandedCard((p) => (p === venture.id ? null : venture.id))}
                  onActionComplete={handleActionComplete}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 3 — Daily Brief Panel
           ════════════════════════════════════════════════════════════════ */}
        <BriefPanel
          briefs={data?.briefs ?? []}
          openVentures={openBriefVentures}
          completedActions={completedActions}
          onToggleVenture={(id) =>
            setOpenBriefVentures((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
          onToggleAll={() => {
            const allOpen = VENTURE_ORDER.every((v) => openBriefVentures.has(v))
            setOpenBriefVentures(allOpen ? new Set() : new Set(VENTURE_ORDER))
          }}
          onActionComplete={(key) => handleActionComplete(key)}
          onMarkActionWithRor={markActionWithRor}
        />

        {/* ════════════════════════════════════════════════════════════════
            SECTION 4 — Live Agent Activity
           ════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Live Agent Activity</SectionLabel>
            <div className="flex items-center gap-2">
              <span className="text-sm text-shell-subtle">refreshes every 30s</span>
              <button
                onClick={refreshActivity}
                className="text-sm text-shell-subtle hover:text-shell-fg/90 transition-colors"
              >
                ↻
              </button>
            </div>
          </div>
          <AgentActivityFeed logs={activityLogs} loading={activityLoading && activityLogs.length === 0} />
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 5 — Provider Health Strip
           ════════════════════════════════════════════════════════════════ */}
        {data && (
          <section className="pb-4">
            <ProviderHealthStrip
              providers={data.providers ?? {}}
              rateLimits={data.rateLimits ?? {}}
            />
          </section>
        )}

      </div>
    </div>
  )
}
