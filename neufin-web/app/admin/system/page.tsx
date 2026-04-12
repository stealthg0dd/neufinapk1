'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

type Health = {
  status?: string
  supabase_connected?: boolean
  uptime_seconds?: number
  environment?: string
}

type AdminSystem = {
  backend: { status?: string; environment?: string }
  supabase_connected: boolean
  redis: boolean | null
  last_swarm_report_at?: string | null
  agent_success_rate_7d?: number | null
  agent_success_sample_size_7d?: number | null
  analytics_error_hint_rate_24h_pct?: number | null
  analytics_events_sample_24h?: number | null
  http_error_rate_24h_pct?: number | null
  http_request_sample_count_24h?: number | null
  active_swarm_jobs?: number | null
  latency_p50_ms?: number | null
  latency_p95_ms?: number | null
  latency_p99_ms?: number | null
  note?: string
}

function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return `${v}%`
}

function fmtNum(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return String(v)
}

export default function AdminSystemPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [sys, setSys] = useState<AdminSystem | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let c = false
    ;(async () => {
      if (!API_BASE) return
      try {
        const h = await fetch(`${API_BASE.replace(/\/$/, '')}/health`, { cache: 'no-store' })
        const hj = await h.json().catch(() => ({}))
        if (!c) setHealth(hj)
      } catch {
        if (!c) setHealth({ status: 'error' })
      }
    })()
    return () => {
      c = true
    }
  }, [tick])

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/admin/system', { cache: 'no-store' })
        const j = await res.json().catch(() => ({}))
        if (!c) setSys(j)
      } catch {
        if (!c) setSys(null)
      }
    })()
    return () => {
      c = true
    }
  }, [tick])

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">System</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Railway <code className="text-zinc-400">/health</code> polled every 30s; admin snapshot on the same
          interval.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-1 text-sm">
          <p className="text-xs text-zinc-500 uppercase">Railway API</p>
          <p className="text-lg text-white">{health?.status ?? '—'}</p>
          <p className="text-zinc-500">Env: {health?.environment ?? '—'}</p>
          <p className="text-zinc-500">Uptime: {health?.uptime_seconds ?? '—'}s</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-1 text-sm">
          <p className="text-xs text-zinc-500 uppercase">Supabase (API /health)</p>
          <p className="text-lg text-white">
            {health?.supabase_connected == null ? '—' : health.supabase_connected ? 'Connected' : 'Down'}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-1 text-sm">
          <p className="text-xs text-zinc-500 uppercase">Redis (admin probe)</p>
          <p className="text-lg text-white">
            {sys?.redis === null ? 'Not configured' : sys.redis ? 'Up' : 'Down'}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-1 text-sm">
          <p className="text-xs text-zinc-500 uppercase">Last swarm report</p>
          <p className="text-lg text-white text-sm break-all">
            {sys?.last_swarm_report_at ?? '—'}
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-2">
          API process metrics (24h)
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
            <p className="text-xs text-zinc-500">HTTP samples</p>
            <p className="text-xl text-white tabular-nums">{fmtNum(sys?.http_request_sample_count_24h)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
            <p className="text-xs text-zinc-500">HTTP 5xx rate</p>
            <p className="text-xl text-white tabular-nums">{fmtPct(sys?.http_error_rate_24h_pct)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
            <p className="text-xs text-zinc-500">p50 / p95 / p99 latency</p>
            <p className="text-lg text-white tabular-nums">
              {fmtNum(sys?.latency_p50_ms)} / {fmtNum(sys?.latency_p95_ms)} / {fmtNum(sys?.latency_p99_ms)} ms
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
            <p className="text-xs text-zinc-500">Swarm jobs (queued+running)</p>
            <p className="text-xl text-white tabular-nums">{fmtNum(sys?.active_swarm_jobs)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
            <p className="text-xs text-zinc-500">Swarm success (7d, headline+trace)</p>
            <p className="text-xl text-white tabular-nums">{fmtPct(sys?.agent_success_rate_7d)}</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              n={sys?.agent_success_sample_size_7d ?? '—'} reports
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
            <p className="text-xs text-zinc-500">Analytics “error” hint (24h)</p>
            <p className="text-xl text-white tabular-nums">{fmtPct(sys?.analytics_error_hint_rate_24h_pct)}</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              n={sys?.analytics_events_sample_24h ?? '—'} events
            </p>
          </div>
        </div>
      </div>

      {sys?.note && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500 leading-relaxed">
          {sys.note}
        </div>
      )}
    </div>
  )
}
