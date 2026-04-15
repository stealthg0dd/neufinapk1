"use client"

import type { AgentCallLog } from "@/lib/dashboard-types"

// ── Label helpers ──────────────────────────────────────────────────────────────

const VENTURE_LABELS: Record<string, string> = {
  neufin:          "NeuFin",
  arisole:         "Arisole",
  neumas:          "Neumas",
  apex_golf:       "Apex Golf",
  defquant:        "DefQuant",
  ctech_corporate: "CTech",
}

const BH_NAMES: Record<string, string> = {
  neufin:          "TW",
  arisole:         "JT",
  neumas:          "Brooksie",
  apex_golf:       "Fred",
  defquant:        "VS",
  ctech_corporate: "Corp",
}

const VENTURE_DOT: Record<string, string> = {
  neufin:          "bg-primary",
  arisole:         "bg-emerald-400",
  neumas:          "bg-purple-400",
  apex_golf:       "bg-amber-400",
  defquant:        "bg-rose-400",
  ctech_corporate: "bg-shell-muted",
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return "—"
  }
}

function providerShort(name: string): string {
  if (!name) return "—"
  const parts = name.split("_")
  // "anthropic_sonnet_0" → "Anthropic"
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
}

function roleLabel(role: string): string {
  return role.replace(/_/g, " ")
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg bg-shell-raised/40 px-3 py-2.5 animate-pulse">
          <div className="h-2 w-2 rounded-full bg-shell-raised flex-shrink-0" />
          <div className="h-3 w-12 rounded bg-shell-raised" />
          <div className="h-3 w-16 rounded bg-shell-raised" />
          <div className="h-3 flex-1 rounded bg-shell-raised" />
          <div className="h-3 w-12 rounded bg-shell-raised" />
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AgentActivityFeedProps {
  logs: AgentCallLog[]
  loading?: boolean
}

export default function AgentActivityFeed({ logs, loading }: AgentActivityFeedProps) {
  if (loading) return <FeedSkeleton />

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 rounded-xl border border-shell-border bg-shell/40">
        <p className="text-sm text-shell-subtle">No agent activity in the last 2 hours.</p>
      </div>
    )
  }

  // Filter to last 2 hours and show last 20
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  const visible = logs
    .filter((l) => new Date(l.timestamp).getTime() > cutoff)
    .slice(0, 20)

  return (
    <div className="space-y-1">
      {visible.map((log, i) => {
        const dot = VENTURE_DOT[log.company] ?? "bg-shell-subtle"
        const venture = VENTURE_LABELS[log.company] ?? log.company
        const bh = BH_NAMES[log.company] ?? ""
        const provider = providerShort(log.provider_used)
        const cost = log.cost_usd != null ? `$${log.cost_usd.toFixed(4)}` : "—"
        const latency = log.latency_ms != null ? `${Math.round(log.latency_ms)}ms` : ""

        return (
          <div
            key={i}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors ${
              log.success === false
                ? "bg-red-500/5 border border-red-500/15 hover:bg-red-500/10"
                : log.success === true
                ? "bg-shell/50 border border-shell-border/50 hover:bg-shell-raised/50"
                : "bg-shell-raised/20 border border-shell-border/30"
            }`}
          >
            {/* Status dot */}
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
              log.success === false ? "bg-red-400" : log.success === true ? "bg-emerald-400" : "bg-shell-subtle"
            }`} />

            {/* Time */}
            <span className="text-shell-subtle tabular-nums flex-shrink-0 w-16">
              {formatTime(log.timestamp)}
            </span>

            {/* Venture + BH */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`} />
              <span className="text-shell-fg/90 font-medium">{venture}</span>
              {bh && <span className="text-shell-subtle">·</span>}
              {bh && <span className="text-shell-muted">{bh}</span>}
            </div>

            {/* Role */}
            <span className="text-shell-subtle flex-shrink-0 hidden sm:block">
              {roleLabel(log.agent_role)}
            </span>

            {/* Spacer */}
            <span className="flex-1" />

            {/* Cost */}
            <span className="text-shell-subtle tabular-nums flex-shrink-0">{cost}</span>

            {/* Latency */}
            {latency && (
              <span className="text-shell-subtle tabular-nums flex-shrink-0 hidden md:block">{latency}</span>
            )}

            {/* Provider */}
            <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-sm font-medium ${
              log.success === false ? "bg-red-500/20 text-red-400" : "bg-shell-raised text-shell-muted"
            }`}>
              {provider}
            </span>
          </div>
        )
      })}

      {visible.length === 0 && (
        <div className="flex items-center justify-center h-16 rounded-lg border border-shell-border bg-shell/30">
          <p className="text-xs text-shell-subtle">No calls in the last 2 hours.</p>
        </div>
      )}
    </div>
  )
}
