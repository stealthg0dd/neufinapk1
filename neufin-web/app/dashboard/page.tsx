import DashboardCockpitClient from '@/components/dashboard/DashboardCockpitClient'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

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
    note_type?: string
  }>
}

const DEFAULT_REGIME: RegimeResponse = {
  current: { regime: 'unknown', confidence: 0 },
}

async function DashboardServerPage() {
  const appUrl = process.env.NEXT_PUBLIC_API_URL || 'https://neufin-web.vercel.app'

  const regime = await fetch(`${appUrl}/api/research/regime`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch((err) => {
      console.error('[dashboard] regime fetch failed:', err)
      return null
    })

  const notes = await fetch(`${appUrl}/api/research/notes?limit=5`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch((err) => {
      console.error('[dashboard] notes fetch failed:', err)
      return null
    })

  const regimeData: RegimeResponse =
    regime != null && typeof regime === 'object' ? (regime as RegimeResponse) : DEFAULT_REGIME

  const researchNotes = Array.isArray(notes)
    ? notes
    : notes != null && typeof notes === 'object' && Array.isArray((notes as NotesResponse).notes)
      ? (notes as NotesResponse).notes!
      : []

  return (
    <div>
      <DashboardCockpitClient regimeData={regimeData} researchNotes={researchNotes} />
      <div className="mt-6 flex items-center justify-between rounded-xl border border-border/50 bg-surface px-5 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            You&apos;re on NeuFin beta — your feedback shapes what we build.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Takes 5 minutes · Read personally by the founding team
          </p>
        </div>
        <Link href="/feedback" target="_blank">
          <button className="ml-4 flex-shrink-0 rounded-lg border border-primary/30 bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25">
            Share feedback →
          </button>
        </Link>
      </div>
    </div>
  )
}
