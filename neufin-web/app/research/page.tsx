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
    const data = (await res.json()) as BlogNote[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export default async function ResearchPage() {
  const notes = await fetchBlogNotes()
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

        <PublicResearchHubClient notes={notes} />
      </div>
    </div>
  )
}
