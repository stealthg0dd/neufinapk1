'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiFetch, apiPost } from '@/lib/api-client'

type Partner = {
  id: string
  firm: string
  contact_email?: string
  plan?: string | null
  api_calls_30d: number
  mrr_usd?: number | null
  status?: string
  integration_health: string
  stripe_customer_id?: string | null
  active_keys: number
}

function healthDot(h: string) {
  const c =
    h === 'GREEN' ? 'bg-emerald-400' : h === 'AMBER' ? 'bg-amber-400' : 'bg-red-400'
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} title={h} />
}

export default function AdminPartnersPage() {
  const [rows, setRows] = useState<Partner[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/admin/partners', { cache: 'no-store' })
        if (!res.ok) throw new Error(`${res.status}`)
        const j = await res.json()
        if (!c) setRows(j.partners ?? [])
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      c = true
    }
  }, [])

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Partners</h1>
        <p className="text-sm text-zinc-500 mt-1">B2B accounts with API keys (usage last 30 days).</p>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Firm</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">API (30d)</th>
              <th className="px-3 py-2">MRR</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-2 text-zinc-200">{p.firm}</td>
                <td className="px-3 py-2 text-zinc-400">{p.contact_email}</td>
                <td className="px-3 py-2">{p.plan || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{p.api_calls_30d.toLocaleString()}</td>
                <td className="px-3 py-2">{p.mrr_usd != null ? `$${p.mrr_usd}` : '—'}</td>
                <td className="px-3 py-2">{p.status}</td>
                <td className="px-3 py-2 flex items-center gap-2">
                  {healthDot(p.integration_health)}
                  <span className="text-xs text-zinc-500">{p.integration_health}</span>
                </td>
                <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                  <Link href={`/admin/partners/${p.id}/usage`} className="text-sky-400 text-xs hover:underline">
                    Usage
                  </Link>
                  <a
                    className="text-zinc-400 text-xs hover:underline"
                    href={
                      p.stripe_customer_id
                        ? `https://dashboard.stripe.com/customers/${p.stripe_customer_id}`
                        : 'https://dashboard.stripe.com/'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Stripe
                  </a>
                  <button
                    type="button"
                    className="text-amber-300 text-xs hover:underline"
                    onClick={async () => {
                      if (!confirm('Rotate API key? Old keys stop working.')) return
                      try {
                        const out = await apiPost<{ key?: string }>(
                          `/api/admin/partners/${encodeURIComponent(p.id)}/rotate-key`,
                          {},
                        )
                        if (out.key) window.prompt('New key (copy now)', out.key)
                      } catch (e) {
                        alert(e instanceof Error ? e.message : String(e))
                      }
                    }}
                  >
                    Rotate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
