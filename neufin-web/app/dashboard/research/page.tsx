import Link from 'next/link'
import { cookies } from 'next/headers'

type NoteRow = {
  id: string
  title: string
  executive_summary: string
  note_type: string
  regime?: string | null
  generated_at?: string
  is_public?: boolean
}

type RegimePayload = {
  current?: { regime?: string; confidence?: number; started_at?: string | null }
  recent_history?: Array<{ regime?: string; started_at?: string; confidence?: number | null }>
  generated_at?: string
}

function resolveAppUrl() {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (app) return app.startsWith('http') ? app : `https://${app}`
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return 'https://neufin-web.vercel.app'
}

function regimeLabel(r: string | null | undefined) {
  if (!r) return 'Neutral'
  const k = r.toLowerCase()
  const m: Record<string, string> = {
    risk_on: 'Risk-On',
    risk_off: 'Risk-Off',
    neutral: 'Neutral',
    stagflation: 'Stagflation',
    recovery: 'Recovery',
    recession: 'Recession',
    recession_risk: 'Recession risk',
  }
  return m[k] || r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function DashboardResearchPage() {
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ')
  const appUrl = resolveAppUrl().replace(/\/$/, '')
  const headers = cookieHeader ? { cookie: cookieHeader } : undefined

  let notes: NoteRow[] = []
  let regime: RegimePayload | null = null

  try {
    const [nRes, rRes] = await Promise.all([
      fetch(`${appUrl}/api/research/notes?per_page=10&page=1`, { cache: 'no-store', headers }),
      fetch(`${appUrl}/api/research/regime`, { cache: 'no-store', headers }),
    ])
    if (nRes.ok) {
      const j = (await nRes.json()) as { notes?: NoteRow[] }
      notes = Array.isArray(j.notes) ? j.notes : []
    }
    if (rRes.ok) {
      regime = (await rRes.json()) as RegimePayload
    }
  } catch {
    notes = []
  }

  const cur = regime?.current
  const hist = regime?.recent_history || []

  return (
    <div className="rounded-xl border border-border/50 bg-surface p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Research</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Same live feed as the public hub, plus private notes (when available) for signed-in users.
          </p>
        </div>
        <Link
          href="/research"
          className="rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20"
        >
          Open public hub →
        </Link>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border border-border/40 bg-background/40 p-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Current regime</h2>
          <p className="mt-2 text-lg font-semibold capitalize text-foreground">{regimeLabel(cur?.regime)}</p>
          {typeof cur?.confidence === 'number' && (
            <p className="text-sm text-muted-foreground">
              Confidence: {cur.confidence <= 1 ? Math.round(cur.confidence * 100) : Math.round(cur.confidence)}%
            </p>
          )}
        </div>
        {hist.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-background/40 p-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Recent regime history</h2>
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs text-muted-foreground">
              {hist.map((h, i) => (
                <li key={`${h.started_at ?? i}`} className="flex justify-between gap-2 border-b border-border/30 pb-2 last:border-0">
                  <span className="capitalize text-foreground">{regimeLabel(h.regime)}</span>
                  <span className="shrink-0 font-mono text-[10px]">
                    {h.started_at
                      ? new Date(h.started_at).toLocaleDateString('en-SG', { dateStyle: 'medium' })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-foreground">Latest notes</h2>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No research notes loaded. Try again later.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-border/40 bg-background/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase text-primary">{n.note_type?.replace(/_/g, ' ')}</span>
                {n.is_public === false && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200">
                    Private — full agent reasoning
                  </span>
                )}
              </div>
              <p className="mt-1 font-medium text-foreground">{n.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.executive_summary}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {n.generated_at
                    ? new Date(n.generated_at).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'}
                </span>
                <Link href={`/research/${n.id}`} className="text-primary hover:underline">
                  Read →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
