'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const API = process.env.NEXT_PUBLIC_API_URL

interface ApiKey {
  id: string
  name: string
  key_prefix?: string
  created_at: string
  last_used_at?: string
  is_active: boolean
  rate_limit_per_day: number
  usage_this_month?: number
}

type UsageResponse = {
  monthly_calls_by_key?: Record<string, number>
  last_7_days?: Array<{ date: string; calls: number }>
}

function fmt(iso: string | undefined) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-3 ${className}`} />
}

export default function DeveloperKeysPage() {
  const { token } = useAuth()
  const [keys, setKeys]         = useState<ApiKey[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [newName, setNewName]   = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey]     = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [usage, setUsage]       = useState<UsageResponse>({})
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/developer/keys`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (res.status === 403) { setError('Enterprise plan required for API access.'); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setKeys(data.keys ?? data ?? [])

      const usageRes = await fetch(`${API}/api/developer/keys/usage`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (usageRes.ok) {
        const u = (await usageRes.json()) as UsageResponse
        setUsage(u)
      } else {
        setUsage({})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !newName.trim()) return
    setCreating(true)
    setNewKey(null)
    try {
      const res = await fetch(`${API}/api/developer/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Could not create key')
      }
      const data = await res.json()
      const raw = data.key ?? data.raw_key ?? ''
      setNewKey(raw)
      if (raw) localStorage.setItem('neufin-api-key', raw)
      setNewName('')
      setShowModal(false)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!token || !confirm('Revoke this API key? This cannot be undone.')) return
    setRevoking(id)
    try {
      const res = await fetch(`${API}/api/developer/keys/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) throw new Error('Could not revoke key')
      setKeys(prev => prev.filter(k => k.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key')
    } finally {
      setRevoking(null)
    }
  }

  const mergedKeys = useMemo(() => {
    const monthly = usage.monthly_calls_by_key || {}
    return keys.map((k) => ({ ...k, usage_this_month: monthly[k.id] || 0 }))
  }, [keys, usage.monthly_calls_by_key])

  const chartData = (usage.last_7_days || []).map((d) => ({
    day: new Date(d.date).toLocaleDateString('en-SG', { weekday: 'short' }),
    calls: d.calls,
  }))

  return (
    <div className="min-h-screen bg-app px-4 py-6 text-navy">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/developer" className="text-sm text-muted2 transition-colors hover:text-navy">
                ← API Portal
              </Link>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy">API Keys</h1>
            <p className="mt-0.5 text-sm text-muted2">Manage your NeuFin Enterprise API keys</p>
          </div>
        </div>

        {newKey && (
          <div className="space-y-3 rounded-xl border border-success2/30 bg-success2/5 p-5">
            <p className="text-sm font-semibold text-emerald-800">
              API key created — copy it now; it will not be shown again.
            </p>
            <div className="flex items-center gap-3">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-surface-2 px-4 py-2.5 font-mono text-sm text-emerald-900">
                {newKey}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(newKey)}
                className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-100"
              >
                Copy
              </button>
            </div>
            <button type="button" onClick={() => setNewKey(null)} className="text-xs text-muted2 hover:text-navy">
              Dismiss
            </button>
          </div>
        )}

        <div className="space-y-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-navy">Create new key</h2>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Create New Key
          </button>
          <p className="text-sm text-muted2">
            Rate limit: 10,000 requests/day per key. Keys are stored as hashes — copy your key immediately after
            creation.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
            {error.includes('Enterprise') && (
              <Link href="/pricing" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                Upgrade to Enterprise →
              </Link>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-border-light bg-surface-2 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted2">Your API Keys</p>
            <button type="button" onClick={load} className="text-xs text-muted2 hover:text-navy">
              Refresh
            </button>
          </div>
          {loading ? (
            <div className="space-y-3 p-5">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : mergedKeys.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted2">No API keys yet. Create one above.</div>
          ) : (
            <div className="divide-y divide-border-light bg-white">
              {mergedKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-2/60">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-navy">{k.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          k.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {k.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </div>
                    <p className="text-sm text-muted2">
                      Created {fmt(k.created_at)} · Last used {fmt(k.last_used_at)} · Usage this month{' '}
                      {k.usage_this_month?.toLocaleString() || 0} calls · Rate limit{' '}
                      {k.rate_limit_per_day.toLocaleString()} calls/day
                    </p>
                    {k.key_prefix && <code className="font-mono text-xs text-slate2">{k.key_prefix}…</code>}
                  </div>
                  {k.is_active && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(k.id)}
                      disabled={revoking === k.id}
                      className="ml-4 shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {revoking === k.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-navy">Usage (last 7 days)</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted2">No API calls recorded yet.</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="calls" fill="#1EB8CC" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-navy">Using your API key</h3>
          <pre className="overflow-x-auto font-mono text-sm leading-relaxed text-slate2">
            {`# Authenticate all requests with:
curl -H "X-NeuFin-API-Key: YOUR_KEY" \\
     https://neufin-backend-production.up.railway.app/api/research/regime`}
          </pre>
          <Link href="/developer/docs" className="text-sm font-medium text-primary hover:underline">
            View full API reference →
          </Link>
        </div>
      </div>
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-navy">Create API key</h3>
            <p className="mt-1 text-sm text-muted2">Example: Production — MYTHEO Integration</p>
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Key name"
                required
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-navy placeholder:text-muted2 focus:border-primary focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-slate2 hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-primary-dark"
                >
                  {creating ? 'Creating…' : 'Create New Key'}
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-warning2">Save this key — it will not be shown again.</p>
          </div>
        </div>
      )}
    </div>
  )
}
