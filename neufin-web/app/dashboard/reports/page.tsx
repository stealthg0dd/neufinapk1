import Link from 'next/link'
import { cookies } from 'next/headers'

type VaultReport = {
  id: string
  portfolio_name?: string
  created_at?: string
  pdf_url?: string | null
  dna_score?: number | null
  is_paid?: boolean
}

function resolveAppUrl() {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (app) return app.startsWith('http') ? app : `https://${app}`
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return 'https://neufin-web.vercel.app'
}

export default async function DashboardReportsPage() {
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ')
  const appUrl = resolveAppUrl().replace(/\/$/, '')
  let reports: VaultReport[] = []
  try {
    const res = await fetch(`${appUrl}/api/vault/history`, {
      cache: 'no-store',
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    })
    if (res.ok) {
      const json = (await res.json()) as VaultReport[] | { history?: VaultReport[]; reports?: VaultReport[] }
      reports = Array.isArray(json)
        ? json
        : Array.isArray(json.history)
          ? json.history
          : Array.isArray(json.reports)
            ? json.reports
            : []
    }
  } catch {
    reports = []
  }

  return (
    <div className="rounded-xl border border-border/50 bg-surface p-6">
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

      {reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="grid gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{r.portfolio_name || 'Portfolio'}</p>
                <p className="text-xs text-muted-foreground">{r.id}</p>
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
                  <Link href="/dashboard/portfolio" className="text-xs text-primary hover:underline">
                    Generate Report
                  </Link>
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

