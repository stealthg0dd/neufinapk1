import DashboardCockpitClient from '@/components/dashboard/DashboardCockpitClient'
import Link from 'next/link'
import { cookies } from 'next/headers'

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

type PortfolioListItem = {
  id?: string
  portfolio_id?: string
  portfolio_name?: string
  name?: string
  dna_score?: number
  analyzed_at?: string
  updated_at?: string
  created_at?: string
  user_name?: string
  advisor_name?: string
}

type SwarmLatest = {
  id?: string
  headline?: string
  title?: string
  regime?: string
  top_risk?: string
  generated_at?: string
}

const DEFAULT_REGIME: RegimeResponse = {
  current: { regime: 'unknown', confidence: 0 },
}

async function DashboardServerPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL || 'https://neufin-web.vercel.app'
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ')

  async function safeFetchJson<T>(path: string): Promise<T | null> {
    try {
      const res = await fetch(`${appUrl}${path}`, {
        cache: 'no-store',
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      })
      if (!res.ok) return null
      return (await res.json()) as T
    } catch (err) {
      console.error('[dashboard] fetch failed:', path, err)
      return null
    }
  }

  const [regime, notes, portfolioListRaw, latestSwarm] = await Promise.all([
    safeFetchJson<RegimeResponse>('/api/research/regime'),
    safeFetchJson<NotesResponse | NotesResponse['notes']>('/api/research/notes?limit=5'),
    safeFetchJson<PortfolioListItem[]>('/api/portfolio/list'),
    safeFetchJson<SwarmLatest>('/api/swarm/report/latest'),
  ])

  const regimeData: RegimeResponse =
    regime != null && typeof regime === 'object' ? (regime as RegimeResponse) : DEFAULT_REGIME

  const researchNotes = Array.isArray(notes)
    ? notes
    : notes != null && typeof notes === 'object' && Array.isArray((notes as NotesResponse).notes)
      ? (notes as NotesResponse).notes!
      : []

  const portfolioList = Array.isArray(portfolioListRaw) ? portfolioListRaw : []
  const latestPortfolio = portfolioList[0] ?? null
  const hasPortfolio = Boolean(latestPortfolio)
  const lastAnalyzed = latestPortfolio?.analyzed_at || latestPortfolio?.updated_at || latestPortfolio?.created_at || null
  const analyzedDaysAgo =
    lastAnalyzed != null
      ? Math.max(0, Math.floor((Date.now() - new Date(lastAnalyzed).getTime()) / (1000 * 60 * 60 * 24)))
      : null
  const userName =
    latestPortfolio?.user_name ||
    latestPortfolio?.advisor_name ||
    (hasPortfolio ? 'Advisor' : 'there')

  return (
    <div>
      <div className="mb-6 rounded-xl border border-border/50 bg-surface px-5 py-4">
        <p className="text-sm text-muted-foreground">
          {hasPortfolio
            ? `Welcome back, ${userName}. Your portfolio was last analyzed ${analyzedDaysAgo ?? 0} day${(analyzedDaysAgo ?? 0) === 1 ? '' : 's'} ago.`
            : 'Welcome to NeuFin. Start with your portfolio →'}
        </p>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/50 bg-surface px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Portfolio Status</p>
          {hasPortfolio ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-foreground">
                {latestPortfolio?.portfolio_name || latestPortfolio?.name || 'Latest Portfolio'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                DNA score: {latestPortfolio?.dna_score ?? 'N/A'} · Last analyzed:{' '}
                {lastAnalyzed ? new Date(lastAnalyzed).toLocaleString('en-SG', { dateStyle: 'medium' }) : 'Unknown'}
              </p>
              <Link href="/dashboard/portfolio" className="mt-3 inline-block text-xs text-primary hover:underline">
                View Analysis →
              </Link>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">No portfolio found yet.</p>
              <Link href="/dashboard/portfolio" className="mt-3 inline-block text-xs text-primary hover:underline">
                Upload your first portfolio →
              </Link>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/50 bg-surface px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Latest Swarm IC</p>
          {latestSwarm?.id ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-foreground">
                {latestSwarm.headline || latestSwarm.title || 'Latest IC Briefing'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Regime: {latestSwarm.regime || 'N/A'} · Top risk: {latestSwarm.top_risk || 'N/A'}
              </p>
              <Link href="/swarm" className="mt-3 inline-block text-xs text-primary hover:underline">
                View full IC briefing →
              </Link>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">No swarm briefings yet.</p>
              <Link href="/swarm" className="mt-3 inline-block text-xs text-primary hover:underline">
                Run Swarm IC →
              </Link>
            </div>
          )}
        </div>
      </div>

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
