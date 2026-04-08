import type { Metadata } from 'next'
import PublicResearchHubClient, { type BlogNote } from '@/components/research/PublicResearchHubClient'

export const metadata: Metadata = {
  title: 'NeuFin Research Intelligence | AI-Powered Market Analysis',
  description:
    "Daily AI-generated research reports covering market regimes, behavioral finance signals, and portfolio intelligence. Powered by NeuFin's 7-agent swarm.",
  openGraph: {
    title: 'NeuFin Research Intelligence | AI-Powered Market Analysis',
    description:
      "Daily AI-generated research reports covering market regimes, behavioral finance signals, and portfolio intelligence. Powered by NeuFin's 7-agent swarm.",
    type: 'website',
  },
}

function resolveBase() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) return raw.startsWith('http') ? raw : `https://${raw}`
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}

async function fetchBlogNotes(): Promise<BlogNote[]> {
  try {
    const base = resolveBase().replace(/\/$/, '')
    const res = await fetch(`${base}/api/research/blog?page=1&limit=60`, {
      next: { revalidate: 300 },
      cache: 'force-cache',
    })
    if (!res.ok) return []
    const data = (await res.json()) as BlogNote[] | { notes?: BlogNote[]; items?: BlogNote[] }
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.notes)) return data.notes
    if (Array.isArray(data?.items)) return data.items
    return []
  } catch {
    return []
  }
}

export default async function ResearchPage() {
  const notes = await fetchBlogNotes()
  const macro = notes.filter((n) => n.note_type?.toUpperCase().includes('MACRO')).slice(0, 3)
  const regimeChange = notes.filter((n) => n.note_type?.toUpperCase().includes('REGIME')).slice(0, 3)
  const sector = notes.filter((n) => n.note_type?.toUpperCase().includes('SECTOR')).slice(0, 3)
  const behavioral = notes.filter((n) => n.note_type?.toUpperCase().includes('BEHAVIOR')).slice(0, 3)

  const sentiment =
    notes.length === 0
      ? 'Neutral'
      : notes.some((n) => n.note_type?.toUpperCase().includes('RISK'))
        ? 'Cautious'
        : 'Constructive'

  const NewsletterBlock = ({ title, items }: { title: string; items: BlogNote[] }) => (
    <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-primary">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((n) => (
            <article key={`${title}-${n.id}`} className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
              <p className="text-sm font-semibold text-foreground">{n.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.executive_summary}</p>
            </article>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No notes available yet.</p>
        )}
      </div>
    </section>
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <header className="mb-12 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-primary">NEUFIN RESEARCH INTELLIGENCE</p>
          <h1 className="text-4xl font-bold">AI-Generated Market Analysis</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Our 7-agent swarm publishes daily research on market regimes, behavioral bias signals, and portfolio
            intelligence. Updated automatically.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono text-muted-foreground">
            <span>Updated daily at 06:00 SGT</span>
            <span>•</span>
            <span>{notes.length} notes</span>
            <span>•</span>
            <span>Free to read</span>
          </div>
        </header>

        <section className="mb-10 rounded-2xl border border-border/60 bg-surface/30 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-primary">Swarm Analytics</p>
              <p className="mt-1 text-sm text-foreground">{notes.length} total notes scanned</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-primary">Sentiment</p>
              <p className="mt-1 text-sm text-foreground">{sentiment}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-primary">Audience Focus</p>
              <p className="mt-1 text-sm text-foreground">Institutional IC + advisor workflows</p>
            </div>
          </div>
        </section>

        <section className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          <NewsletterBlock title="MACRO OUTLOOK" items={macro} />
          <NewsletterBlock title="REGIME CHANGE" items={regimeChange} />
          <NewsletterBlock title="SECTOR ANALYSIS" items={sector} />
          <NewsletterBlock title="BEHAVIORAL" items={behavioral} />
        </section>

        <PublicResearchHubClient notes={notes} />
      </div>
    </div>
  )
}
