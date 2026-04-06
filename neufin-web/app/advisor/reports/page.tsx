'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

const API = process.env.NEXT_PUBLIC_API_URL

interface ClientReport {
  id: string
  client_id?: string
  client_name?: string
  portfolio_id: string
  pdf_url: string | null
  is_paid: boolean
  created_at: string
  plan_type?: string
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-800 ${className}`} />
}

export default function AdvisorReportsPage() {
  const { user, token } = useAuth()
  const [reports, setReports]   = useState<ClientReport[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [usedThisMonth, setUsedThisMonth] = useState(0)
  const REPORT_LIMIT = 10

  const load = useCallback(async () => {
    if (!user || !token) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/reports/advisor/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const allReports: ClientReport[] = data.reports ?? []
      setReports(allReports)
      // Count reports generated this calendar month
      const thisMonth = new Date().toISOString().slice(0, 7)
      setUsedThisMonth(allReports.filter(r => r.created_at.startsWith(thisMonth)).length)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [user, token])

  useEffect(() => { load() }, [load])

  const usagePct = Math.min(100, (usedThisMonth / REPORT_LIMIT) * 100)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16" />
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Client Reports</h1>
            <p className="text-sm text-gray-400 mt-0.5">White-label PDF reports for all clients</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/advisor/dashboard" className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
              Dashboard
            </Link>
            <button onClick={load} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
              Refresh
            </button>
          </div>
        </div>

        {/* Usage meter */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-200">Reports This Month</p>
            <p className="text-sm font-bold">
              <span className={usedThisMonth >= REPORT_LIMIT ? 'text-red-400' : 'text-gray-100'}>
                {usedThisMonth}
              </span>
              <span className="text-gray-500">/{REPORT_LIMIT}</span>
            </p>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-800">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${usagePct >= 100 ? 'bg-red-500' : usagePct >= 80 ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {usedThisMonth >= REPORT_LIMIT && (
            <p className="text-xs text-red-400 mt-2">
              Monthly limit reached. <Link href="/pricing" className="underline">Upgrade to Enterprise</Link> for unlimited reports.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Reports table */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              All Reports ({reports.length})
            </p>
          </div>
          {reports.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-sm">No reports generated yet.</p>
              <Link href="/advisor/dashboard" className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300">
                Go to dashboard to generate your first report →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60 bg-gray-950">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-900/40 transition-colors">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-gray-200">
                      {r.client_name ?? `Portfolio ${r.portfolio_id.slice(0, 8)}…`}
                    </p>
                    <p className="text-xs text-gray-500">{fmt(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.is_paid ? (
                      <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-xs">
                        Paid
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-700 text-gray-400 px-2 py-0.5 text-xs">
                        Free
                      </span>
                    )}
                    {r.pdf_url ? (
                      <a
                        href={r.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                      >
                        Download PDF
                      </a>
                    ) : (
                      <span className="text-xs text-gray-600">Generating…</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
