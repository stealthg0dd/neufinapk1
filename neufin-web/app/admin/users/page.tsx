'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { UserAdminRow } from '@/app/api/admin/users/route'

type StatusFilter = 'all' | 'trial' | 'active' | 'expired' | 'suspended'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function trialEnds(startedAt: string | null) {
  if (!startedAt) return '—'
  const ends = new Date(new Date(startedAt).getTime() + 14 * 86400_000)
  const daysLeft = Math.ceil((ends.getTime() - Date.now()) / 86400_000)
  if (daysLeft <= 0) return 'Expired'
  return `${daysLeft}d (${formatDate(ends.toISOString())})`
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const qs = new URLSearchParams()
      qs.set('limit', '100')
      qs.set('offset', '0')
      if (filter !== 'all') qs.set('plan', filter)
      if (search.trim()) qs.set('search', search.trim())
      const res = await apiFetch(`/api/admin/users?${qs.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRows(await res.json())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (a.email || '').localeCompare(b.email || ''))
  }, [rows])

  return (
    <div className="p-6 max-w-[1200px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Users</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Search, filter, and manage NeuFin accounts.</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="text-sm rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-900"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email, name, firm…"
          className="flex-1 min-w-[200px] rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
        />
        {(['all', 'trial', 'active', 'expired', 'suspended'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`text-xs rounded-full px-3 py-1 capitalize border ${
              filter === f
                ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Trial ends</th>
              <th className="px-3 py-2">Analyses</th>
              <th className="px-3 py-2">Last active</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-2 text-zinc-200">{r.email}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.name || '—'}</td>
                  <td className="px-3 py-2 text-zinc-300">{r.subscription_tier || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs">{r.subscription_status}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{trialEnds(r.trial_started_at)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.dna_score_count}</td>
                  <td className="px-3 py-2 text-zinc-500">{formatDate(r.last_sign_in_at)}</td>
                  <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                    <Link href={`/admin/users/${r.id}`} className="text-sky-400 hover:underline text-xs">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
