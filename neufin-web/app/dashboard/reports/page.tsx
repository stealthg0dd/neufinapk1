'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { apiFetch, apiGet, apiPost } from '@/lib/api-client'
import { stripeSuccessUrlReports } from '@/lib/stripe-checkout-urls'
import {
  ReportThemeModal,
  getStoredReportTheme,
  type ReportTheme,
} from '@/components/dashboard/ReportThemeModal'

interface ReportRecord {
  id: string
  portfolio_id: string | null
  portfolio_name?: string | null
  pdf_url: string | null
  is_paid: boolean
  created_at: string
  dna_score?: number | null
}

export default function DashboardReportsPage() {
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingReport, setPendingReport] = useState<ReportRecord | null>(null)

  useEffect(() => {
    void loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<ReportRecord[] | { reports?: ReportRecord[]; history?: ReportRecord[] }>(
        '/api/vault/history'
      )
      setReports(
        Array.isArray(data)
          ? data
          : Array.isArray((data as { history?: ReportRecord[] }).history)
            ? (data as { history: ReportRecord[] }).history
            : Array.isArray((data as { reports?: ReportRecord[] }).reports)
              ? (data as { reports: ReportRecord[] }).reports
              : []
      )
    } catch (err) {
      console.error('[reports] Failed to load:', err)
      setError('Failed to load reports. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function downloadReport(report: ReportRecord, theme?: ReportTheme) {
    // Already have a URL — open directly
    if (report.pdf_url) {
      window.open(report.pdf_url, '_blank')
      return
    }

    if (!report.portfolio_id) {
      alert('No portfolio linked to this report.')
      return
    }

    // Check theme preference before generating
    const resolvedTheme = theme ?? getStoredReportTheme()
    if (!resolvedTheme) {
      setPendingReport(report)
      return
    }

    setGenerating(report.id)
    try {
      // Check subscription gate first
      const statusRes = await apiGet<{ plan: string; status?: string }>('/api/subscription/status')
      const canGenerate =
        statusRes.plan === 'advisor' ||
        statusRes.plan === 'enterprise' ||
        statusRes.status === 'trial'

      if (!canGenerate) {
        const origin = window.location.origin
        const { checkout_url } = await apiPost<{ checkout_url: string }>(
          '/api/reports/checkout',
          {
            plan: 'single',
            portfolio_id: report.portfolio_id,
            success_url: stripeSuccessUrlReports(origin),
            cancel_url: `${origin}/dashboard/reports`,
          }
        )
        window.location.href = checkout_url
        return
      }

      const res = await apiFetch('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ portfolio_id: report.portfolio_id, inline_pdf: false, theme: resolvedTheme }),
      })

      const data = await res.json() as {
        pdf_url?: string | null
        pdf_base64?: string | null
        filename?: string | null
        checkout_url?: string | null
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url
        return
      }

      if (data.pdf_url) {
        window.open(data.pdf_url, '_blank')
        void loadReports() // refresh list so the new URL appears
        return
      }

      if (data.pdf_base64) {
        const bytes = Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = data.filename || `neufin-report-${report.id.slice(0, 8)}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
    } catch (err) {
      console.error('[reports] download failed:', err)
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-surface p-6">
      {pendingReport && (
        <ReportThemeModal
          onSelect={(theme) => {
            const r = pendingReport
            setPendingReport(null)
            void downloadReport(r, theme)
          }}
          onClose={() => setPendingReport(null)}
        />
      )}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">IC Reports &amp; Memos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and manage institutional-grade portfolio reports.
          </p>
        </div>
        <Link
          href="/dashboard/portfolio"
          className="rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20"
        >
          Generate New Report
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-risk/40 bg-risk/10 px-4 py-3 text-sm text-risk">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reports…
        </div>
      ) : reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="grid gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{r.portfolio_name || 'Portfolio'}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {r.portfolio_id || r.id}
                  {!r.portfolio_id && (
                    <span className="ml-1 text-amber-500/80">(link a portfolio via analysis)</span>
                  )}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.created_at
                  ? new Date(r.created_at).toLocaleDateString('en-SG', { dateStyle: 'medium' })
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground">DNA {r.dna_score ?? '—'}</div>
              <div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    r.is_paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-500/15 text-gray-300'
                  }`}
                >
                  {r.is_paid ? 'Paid' : 'Free'}
                </span>
              </div>
              <div>
                {r.pdf_url ? (
                  <a
                    href={r.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Download PDF
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={generating === r.id || !r.portfolio_id}
                    onClick={() => void downloadReport(r)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generating === r.id ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      'Generate Report'
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border/40 bg-background/40 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            No reports yet. Run your first portfolio analysis to generate an IC-grade report.
          </p>
          <Link href="/dashboard/portfolio" className="mt-3 inline-block text-xs text-primary hover:underline">
            Go to Portfolio →
          </Link>
        </div>
      )}
    </div>
  )
}
