import Link from 'next/link'
import PortfolioDNAClientCard from '@/components/dashboard/PortfolioDNAClientCard'
import ResearchFeedClient from '@/components/dashboard/ResearchFeedClient'

export default function DashboardPage() {
  return <DashboardServerPage />
}

type RegimeResponse = {
  current?: { regime?: string; confidence?: number }
}

type NotesResponse = {
  notes?: Array<{
    id: string
    title: string
    executive_summary: string
    confidence_score?: number
    generated_at: string
  }>
}

async function DashboardServerPage() {
  const appUrl = process.env.NEXT_PUBLIC_API_URL || 'https://neufin-web.vercel.app'
  const [regimeRes, notesRes] = await Promise.all([
    fetch(`${appUrl}/api/research/regime`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    fetch(`${appUrl}/api/research/notes?limit=5`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
  ])

  const regimeData = regimeRes as RegimeResponse
  const notesData = notesRes as NotesResponse
  const regimeLabel = regimeData.current?.regime ?? 'Unknown'
  const confidence = Math.max(0, Math.min(1, regimeData.current?.confidence ?? 0))
  const notes = notesData.notes ?? []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="text-sm text-[var(--text-2)] mb-2">Market Regime</p>
          <p className="text-[var(--amber)] text-3xl font-semibold capitalize">{regimeLabel.replace('_', ' ')}</p>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[var(--amber)]" style={{ width: `${Math.round(confidence * 100)}%` }} />
          </div>
        </div>
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="text-sm text-[var(--text-2)] mb-2">Portfolio DNA</p>
          <PortfolioDNAClientCard />
        </div>
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="text-sm text-[var(--text-2)] mb-2">Research Notes</p>
          <p className="font-mono text-4xl text-[var(--text)]">{notes.length}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">Research Feed</h2>
        <ResearchFeedClient notes={notes.slice(0, 5)} />
      </section>

      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 border-dashed border-[var(--amber)]/60">
        <h3 className="text-xl font-semibold mb-2">Analyze your portfolio</h3>
        <p className="text-sm text-[var(--text-2)] mb-4">
          Upload a CSV of your holdings to get your Portfolio DNA Score, risk analysis, and AI-generated insights.
        </p>
        <Link
          href="/dashboard/portfolio"
          className="inline-flex px-5 py-2.5 rounded-xl bg-[var(--amber)] text-[#111] font-semibold text-sm"
        >
          Upload Portfolio
        </Link>
      </div>
    </div>
  )
}
