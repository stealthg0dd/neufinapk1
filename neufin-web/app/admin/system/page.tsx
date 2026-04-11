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
  agent_success_rate_7d: number | null
  error_rate_24h: number | null
  active_swarm_jobs: number | null
  latency_p50_ms: number | null
  latency_p95_ms: number | null
  latency_p99_ms: number | null
  note?: string
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
    <div className="p-6 max-w-3xl space-y-6">
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-400 space-y-2">
        <p className="text-white font-medium text-base">Metrics placeholders</p>
        <p>Agent success, 24h error rate, active swarm jobs, and latency percentiles are not yet wired to a metrics backend.</p>
        {sys?.note && <p className="text-xs text-zinc-500">{sys.note}</p>}
      </div>
    </div>
  )
}
