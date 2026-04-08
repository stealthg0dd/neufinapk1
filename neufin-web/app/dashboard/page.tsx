import DashboardCockpitClient from '@/components/dashboard/DashboardCockpitClient'
import Link from 'next/link'

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

async function DashboardServerPage() {
  const appUrl = process.env.NEXT_PUBLIC_API_URL || 'https://neufin-web.vercel.app'
  const [regimeRes, notesRes] = await Promise.all([
    fetch(`${appUrl}/api/research/regime`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    fetch(`${appUrl}/api/research/notes?limit=5`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
  ])

  const regimeData = regimeRes as RegimeResponse
  const notesData = notesRes as NotesResponse
  const notes = notesData.notes ?? []

  return (
    <div>
      <DashboardCockpitClient regimeData={regimeData} notes={notes} />
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
