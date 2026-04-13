import type { Metadata } from 'next'
import Link from 'next/link'
import { LineChart } from 'lucide-react'
import LeaderboardClient from './LeaderboardClient'
import type { LeaderboardEntry } from './LeaderboardClient'

export const metadata: Metadata = {
  title: 'Leaderboard — Top Investor DNA Scores | Neufin',
  description: 'See the highest-scoring investor portfolios on Neufin. Where do you rank?',
}

const API = process.env.NEXT_PUBLIC_API_URL || ''

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API}/api/dna/leaderboard?limit=25`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.leaderboard ?? []
  } catch {
    return []
  }
}

export default async function LeaderboardPage() {
  const entries = await getLeaderboard()

  return (
    <div className="min-h-screen flex flex-col bg-shell-deep">
      {/* Nav */}
      <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <div className="flex items-center gap-3">
            <Link
              href="/market"
              className="inline-flex items-center gap-1.5 text-shell-muted transition-colors hover:text-white text-sm"
            >
              <LineChart className="h-4 w-4 shrink-0" aria-hidden />
              Market DNA
            </Link>
            <Link href="/upload" className="btn-primary py-2 text-sm">
              Test Your Portfolio →
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-section">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <h1 className="text-3xl font-bold">Global Leaderboard</h1>
            {/* Live pulse */}
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 bg-green-400/10 border border-green-400/25 rounded-full px-2.5 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              Live
            </span>
          </div>
          <p className="text-shell-muted text-sm">
            Top Investor DNA scores — refreshes every 5 minutes.
          </p>
          {entries.length > 0 && (
            <p className="text-xs text-shell-subtle mt-1">
              {entries.length} scores ranked
            </p>
          )}
        </div>

        <LeaderboardClient entries={entries} />
      </main>
    </div>
  )
}
