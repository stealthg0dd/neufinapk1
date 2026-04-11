'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

type Card = {
  value: number
  delta_pct: number | null
  sparkline: number[]
  subtitle?: string
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return <div className="h-8" />
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const w = 120
  const h = 32
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w
      const y = h - ((v - min) / range) * h
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="opacity-90" viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  )
}

function MetricCard({
  title,
  card,
  color,
}: {
  title: string
  card: Card
  color: string
}) {
  const d = card.delta_pct
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-2">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{title}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-3xl font-semibold tabular-nums text-white">{card.value.toLocaleString()}</p>
        <Sparkline values={card.sparkline} color={color} />
      </div>
      {card.subtitle && <p className="text-[11px] text-zinc-500">{card.subtitle}</p>}
      <p className="text-xs text-zinc-400">
        {d === null || d === undefined ? 'Δ vs prior window: —' : `Δ vs prior window: ${d > 0 ? '+' : ''}${d}%`}
      </p>
    </div>
  )
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<{
    cards: Record<string, Card & { subtitle?: string }>
  } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/admin/dashboard', { cache: 'no-store' })
        if (!res.ok) throw new Error(`${res.status}`)
        const j = await res.json()
        if (!cancelled) setData(j)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (err) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-xl font-semibold text-white">Overview</h1>
        <p className="mt-2 text-sm text-red-400">{err}</p>
        <p className="mt-2 text-sm text-zinc-500">
          Ensure NEXT_PUBLIC_API_URL points at the API and you are signed in as an admin.
        </p>
      </div>
    )
  }

  if (!data?.cards) {
    return <div className="p-8 text-sm text-zinc-500">Loading metrics…</div>
  }

  const c = data.cards

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">Live metrics from Supabase via the API (admin only).</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <MetricCard title="Total Users" card={c.total_users} color="#60a5fa" />
        <MetricCard title="Active Trials" card={c.active_trials} color="#a78bfa" />
        <MetricCard title="Paying (count)" card={c.paying_mrr_proxy} color="#34d399" />
        <MetricCard title="API Partners" card={c.api_partners} color="#fbbf24" />
        <MetricCard title="Analyses (this month)" card={c.analyses_this_month} color="#f472b6" />
        <MetricCard title="Reports (this month)" card={c.reports_generated_this_month} color="#94a3b8" />
      </div>
    </div>
  )
}
