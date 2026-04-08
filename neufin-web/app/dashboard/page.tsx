import DashboardCockpitClient from '@/components/dashboard/DashboardCockpitClient'

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

  return <DashboardCockpitClient regimeData={regimeData} notes={notes} />
}
