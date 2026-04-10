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
  return <div className={`animate-pulse rounded bg-gray-800 ${className}`} />
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
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/developer" className="text-gray-500 hover:text-gray-300 text-sm">← API Portal</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-2">API Keys</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage your NeuFin Enterprise API keys</p>
          </div>
        </div>

        {/* New raw key banner */}
        {newKey && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <p className="text-sm font-semibold text-emerald-400">✓ API Key Created — Copy it now, it won&apos;t be shown again</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm font-mono text-emerald-300 overflow-x-auto">
                {newKey}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(newKey)}
                className="flex-shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                Copy
              </button>
            </div>
            <button onClick={() => setNewKey(null)} className="text-xs text-gray-500 hover:text-gray-300">Dismiss</button>
          </div>
        )}

        {/* Create new key form */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
          <h2 className="text-base font-semibold">Create New Key</h2>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Create New Key
          </button>
          <p className="text-xs text-gray-500">
            Rate limit: 10,000 requests/day per key. Keys are stored as hashes — copy your key immediately after creation.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-400">{error}</p>
            {error.includes('Enterprise') && (
              <Link href="/pricing" className="mt-2 inline-block text-sm text-blue-400 hover:underline">
                Upgrade to Enterprise →
              </Link>
            )}
          </div>
        )}

        {/* Keys list */}
        <div className="rounded-2xl border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 border-b border-gray-800 px-5 py-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your API Keys</p>
            <button onClick={load} className="text-xs text-gray-500 hover:text-gray-300">Refresh</button>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1,2].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : mergedKeys.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">
              No API keys yet. Create one above.
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60 bg-gray-950">
              {mergedKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-900/40">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-100">{k.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${k.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {k.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Created {fmt(k.created_at)} · Last used {fmt(k.last_used_at)} · Usage this month {k.usage_this_month?.toLocaleString() || 0} calls · Rate limit {k.rate_limit_per_day.toLocaleString()} calls/day
                    </p>
                    {k.key_prefix && (
                      <code className="text-xs font-mono text-gray-600">{k.key_prefix}…</code>
                    )}
                  </div>
                  {k.is_active && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      disabled={revoking === k.id}
                      className="flex-shrink-0 ml-4 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                    >
                      {revoking === k.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-3 text-base font-semibold">Usage (last 7 days)</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-gray-500">No API calls recorded yet.</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="day" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Usage info */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Using Your API Key</h3>
          <pre className="text-xs font-mono text-gray-400 overflow-x-auto leading-relaxed">
{`# Authenticate all requests with:
curl -H "X-NeuFin-API-Key: YOUR_KEY" \\
     https://neufin-backend-production.up.railway.app/api/research/regime`}
          </pre>
          <Link href="/developer/docs" className="text-sm text-blue-400 hover:text-blue-300">
            View full API reference →
          </Link>
        </div>

      </div>
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-lg font-semibold">Create API key</h3>
            <p className="mt-1 text-sm text-gray-400">Example: Production - MYTHEO Integration</p>
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Key name"
                required
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={creating || !newName.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create New Key'}
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-amber-300">Save this key — it won&apos;t be shown again.</p>
          </div>
        </div>
      )}
    </div>
  )
}
