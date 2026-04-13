"use client"

import { useState, useRef, useEffect } from "react"
import type { ProviderHealthEntry, RateLimitEntry } from "@/lib/dashboard-types"

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(val: number, cap: number): number {
  if (!cap) return 0
  return Math.min(100, Math.round((val / cap) * 100))
}

function providerLabel(name: string): string {
  // "anthropic_sonnet_0" → "Anthropic Sonnet"
  const parts = name.split("_").filter((p) => !/^\d+$/.test(p))
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function providerShort(name: string): string {
  // "anthropic_sonnet_0" → "Anthropic"
  const first = name.split("_")[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function dotClass(stats: ProviderHealthEntry): string {
  if (stats.in_cooldown) return "bg-yellow-400 animate-pulse"
  if (!stats.healthy)    return "bg-red-500"
  return "bg-emerald-400"
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

interface TooltipProps {
  name: string
  stats: ProviderHealthEntry
  rl: RateLimitEntry | undefined
  onClose: () => void
}

function ProviderTooltip({ name, stats, rl, onClose }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const costToday = rl?.cost_today_usd ?? stats.cost_today_usd ?? 0
  const rpmPct    = rl?.rpm_pct ?? pct(stats.rpm_current, stats.rpm_limit)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-48 rounded-xl border border-shell-border bg-shell p-3 shadow-2xl"
    >
      {/* Arrow */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-b border-r border-shell-border bg-shell" />

      <p className="text-xs font-semibold text-shell-fg mb-2.5">{providerLabel(name)}</p>

      {/* Status */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`h-2 w-2 rounded-full ${dotClass(stats)}`} />
        <span className="text-sm text-shell-muted">
          {stats.in_cooldown ? `Cooldown ${Math.round(stats.cooldown_remaining_s)}s` : stats.healthy ? "Healthy" : "Unhealthy"}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-sm">
        <span className="text-shell-subtle">Avg latency</span>
        <span className="text-shell-fg/90 tabular-nums text-right">
          {stats.avg_latency_ms > 0 ? `${Math.round(stats.avg_latency_ms)}ms` : "—"}
        </span>

        <span className="text-shell-subtle">Cost today</span>
        <span className="text-shell-fg/90 tabular-nums text-right">${costToday.toFixed(4)}</span>

        <span className="text-shell-subtle">Total calls</span>
        <span className="text-shell-fg/90 tabular-nums text-right">{stats.total_requests.toLocaleString()}</span>

        <span className="text-shell-subtle">Failures</span>
        <span className={`tabular-nums text-right ${stats.total_failures > 0 ? "text-red-400" : "text-shell-fg/90"}`}>
          {stats.total_failures}
        </span>

        <span className="text-shell-subtle">RPM</span>
        <span className="text-shell-fg/90 tabular-nums text-right">
          {stats.rpm_current}/{stats.rpm_limit}
        </span>
      </div>

      {/* RPM bar */}
      <div className="mt-2.5">
        <div className="h-1 w-full rounded-full bg-shell-raised">
          <div
            className={`h-1 rounded-full transition-all ${
              rpmPct > 80 ? "bg-red-500" : rpmPct > 50 ? "bg-yellow-400" : "bg-sky-500"
            }`}
            style={{ width: `${rpmPct}%` }}
          />
        </div>
      </div>

      {stats.last_failure_reason && (
        <p className="mt-2 text-sm text-red-400/70 line-clamp-2">{stats.last_failure_reason}</p>
      )}
    </div>
  )
}

// ── Provider chip ──────────────────────────────────────────────────────────────

function ProviderChip({
  name,
  stats,
  rl,
}: {
  name: string
  stats: ProviderHealthEntry
  rl: RateLimitEntry | undefined
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const rpmPct = rl?.rpm_pct ?? pct(stats.rpm_current, stats.rpm_limit)

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setShowTooltip((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
          stats.in_cooldown
            ? "border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10"
            : !stats.healthy
            ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
            : "border-shell-border/50 bg-shell/60 hover:bg-shell-raised/80"
        }`}
      >
        {/* Status dot */}
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClass(stats)}`} />

        {/* Name */}
        <span className="text-sm font-medium text-shell-fg/90 whitespace-nowrap">
          {providerShort(name)}
        </span>

        {/* Mini RPM bar */}
        <div className="h-1 w-8 rounded-full bg-shell-raised overflow-hidden">
          <div
            className={`h-1 rounded-full ${
              rpmPct > 80 ? "bg-red-500" : rpmPct > 50 ? "bg-yellow-400" : "bg-sky-500"
            }`}
            style={{ width: `${rpmPct}%` }}
          />
        </div>
      </button>

      {showTooltip && (
        <ProviderTooltip
          name={name}
          stats={stats}
          rl={rl}
          onClose={() => setShowTooltip(false)}
        />
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ProviderHealthStripProps {
  providers: Record<string, ProviderHealthEntry>
  rateLimits: Record<string, RateLimitEntry>
}

function providerRateLimit(
  rateLimits: Record<string, RateLimitEntry>,
  name: string,
): RateLimitEntry | undefined {
  return Object.entries(rateLimits).find(([key]) => key === name)?.[1]
}

export default function ProviderHealthStrip({ providers, rateLimits }: ProviderHealthStripProps) {
  const entries = Object.entries(providers).sort(([an, av], [bn, bv]) => {
    // Unhealthy first, then cooldown, then healthy
    const score = (s: ProviderHealthEntry) => (s.in_cooldown ? 1 : s.healthy ? 2 : 0)
    const diff = score(av) - score(bv)
    if (diff !== 0) return diff
    return an.localeCompare(bn)
  })

  const healthy = entries.filter(([, v]) => v.healthy && !v.in_cooldown).length
  const total   = entries.length

  if (total === 0) return null

  return (
    <>
      {/* Desktop: full strip */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold uppercase tracking-widest text-shell-subtle">
            Providers
          </span>
          <span className="text-sm text-shell-subtle tabular-nums">
            {healthy}/{total} healthy
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {entries.map(([name, stats]) => (
            <ProviderChip key={name} name={name} stats={stats} rl={providerRateLimit(rateLimits, name)} />
          ))}
        </div>
      </div>

      {/* Mobile: summary pill only */}
      <div className="md:hidden">
        <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
          healthy === total
            ? "border-emerald-500/30 bg-emerald-500/5"
            : healthy > total / 2
            ? "border-yellow-500/30 bg-yellow-500/5"
            : "border-red-500/30 bg-red-500/5"
        }`}>
          <span className={`h-2 w-2 rounded-full ${
            healthy === total ? "bg-emerald-400" : healthy > total / 2 ? "bg-yellow-400" : "bg-red-400"
          }`} />
          <span className="text-xs font-medium text-shell-fg/90">
            {healthy}/{total} providers healthy
          </span>
        </div>
      </div>
    </>
  )
}
