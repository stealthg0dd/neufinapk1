'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type RevenuePayload = {
  configured: boolean
  mrr_usd?: number
  series_12m?: { year: number; month: number; cash_usd: number }[]
  mrr_by_price_id?: Record<string, number>
  trial_conversion?: Record<string, { rate_pct: number | null }>
  top_partners_by_mrr?: { stripe_customer_id: string; mrr_usd: number }[]
  error?: string
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenuePayload | null>(null)

  useEffect(() => {
    let c = false
    ;(async () => {
      const res = await apiFetch('/api/admin/revenue', { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!c) setData(j)
    })()
    return () => {
      c = true
    }
  }, [])

  const lineData = useMemo(() => {
    const s = data?.series_12m ?? []
    return s.map((r) => ({
      label: `${r.year}-${String(r.month).padStart(2, '0')}`,
      cash: r.cash_usd,
    }))
  }, [data])

  const pieData = useMemo(() => {
    const m = data?.mrr_by_price_id ?? {}
    return Object.entries(m).map(([name, value]) => ({ name: name.slice(0, 12), value }))
  }, [data])

  if (!data) return <div className="p-8 text-zinc-500 text-sm">Loading…</div>

  if (!data.configured) {
    return (
      <div className="p-6 max-w-xl">
        <h1 className="text-2xl font-semibold text-white">Revenue</h1>
        <p className="mt-2 text-sm text-zinc-500">Stripe is not configured on the API.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Revenue</h1>
        <p className="text-sm text-zinc-500 mt-1">Read-only Stripe aggregates (MRR estimate + cash by month).</p>
        {data.error && <p className="text-sm text-amber-400 mt-2">{data.error}</p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-500 uppercase">MRR (est.)</p>
          <p className="text-3xl font-semibold text-white mt-1">${(data.mrr_usd ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-500 uppercase">Trial → paid (30d)</p>
          <p className="text-3xl font-semibold text-white mt-1">
            {data.trial_conversion?.['30d']?.rate_pct ?? '—'}%
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-500 uppercase">Trial → paid (90d)</p>
          <p className="text-3xl font-semibold text-white mt-1">
            {data.trial_conversion?.['90d']?.rate_pct ?? '—'}%
          </p>
        </div>
      </div>

      <div className="h-72 rounded-xl border border-zinc-800 p-4 bg-zinc-900/20">
        <p className="text-xs text-zinc-500 mb-2">Succeeded PaymentIntents by month (cash, not MRR)</p>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={lineData}>
            <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
            <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a' }} />
            <Line type="monotone" dataKey="cash" stroke="#38bdf8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-64 rounded-xl border border-zinc-800 p-4 bg-zinc-900/20">
          <p className="text-xs text-zinc-500 mb-2">MRR by price id (top slices)</p>
          {pieData.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center">No subscription price breakdown.</p>
          ) : (
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  fill="#a78bfa"
                  label
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'][i % 5]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/20">
          <p className="text-xs text-zinc-500 mb-3">Top Stripe customers by MRR estimate</p>
          <ul className="text-sm space-y-2 text-zinc-300">
            {(data.top_partners_by_mrr ?? []).map((t) => (
              <li key={t.stripe_customer_id} className="flex justify-between gap-2">
                <code className="text-xs text-zinc-500 truncate">{t.stripe_customer_id}</code>
                <span className="tabular-nums">${t.mrr_usd.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
