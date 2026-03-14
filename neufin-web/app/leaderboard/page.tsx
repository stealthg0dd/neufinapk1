import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Leaderboard — Top Investor DNA Scores | Neufin',
  description: 'See the highest-scoring investor portfolios on Neufin. Where do you rank?',
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface LeaderboardEntry {
  dna_score: number
  investor_type: string
  share_token: string
  created_at: string
}

const TYPE_CONFIG: Record<string, { emoji: string; color: string }> = {
  'Diversified Strategist': { emoji: '⚖️',  color: '#3b82f6' },
  'Conviction Growth':      { emoji: '🚀',  color: '#8b5cf6' },
  'Momentum Trader':        { emoji: '⚡',  color: '#f59e0b' },
  'Defensive Allocator':    { emoji: '🛡️', color: '#22c55e' },
  'Speculative Investor':   { emoji: '🎯',  color: '#ef4444' },
}

const MEDAL = ['🥇', '🥈', '🥉']

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API}/api/dna/leaderboard?limit=25`, {
      next: { revalidate: 300 }, // revalidate every 5 minutes
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
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <Link href="/upload" className="btn-primary py-2 text-sm">
            Get My Score →
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">🏆 Investor DNA Leaderboard</h1>
          <p className="text-gray-400 text-sm">
            Top-scoring portfolios. Scores update as new analyses come in.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-gray-500 mb-4">No scores yet — be the first!</p>
            <Link href="/upload" className="btn-primary inline-block">
              Analyze My Portfolio →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => {
              const cfg = TYPE_CONFIG[entry.investor_type] ?? { emoji: '🧬', color: '#6b7280' }
              const scoreColor =
                entry.dna_score >= 70 ? '#22c55e'
                : entry.dna_score >= 40 ? '#f59e0b'
                : '#ef4444'

              return (
                <Link
                  key={entry.share_token}
                  href={`/share/${entry.share_token}`}
                  className="card flex items-center gap-4 hover:border-gray-600 transition-colors group"
                >
                  {/* Rank */}
                  <div className="w-9 text-center shrink-0">
                    {i < 3 ? (
                      <span className="text-2xl">{MEDAL[i]}</span>
                    ) : (
                      <span className="text-lg font-bold text-gray-600">#{i + 1}</span>
                    )}
                  </div>

                  {/* Type icon + name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xl shrink-0">{cfg.emoji}</span>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: cfg.color }}
                      >
                        {entry.investor_type}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <span
                      className="text-2xl font-extrabold"
                      style={{ color: scoreColor }}
                    >
                      {entry.dna_score}
                    </span>
                    <span className="text-xs text-gray-600">/100</span>
                  </div>

                  {/* Arrow */}
                  <span className="text-gray-700 group-hover:text-gray-400 transition-colors text-sm shrink-0">
                    →
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        <div className="mt-10 card text-center border-blue-800/30 bg-gradient-to-br from-blue-950/40 to-purple-950/30">
          <p className="text-gray-200 font-semibold mb-1">Think you can beat the top score?</p>
          <p className="text-gray-500 text-sm mb-4">
            Upload your portfolio CSV and get your Investor DNA Score in seconds.
          </p>
          <Link href="/upload" className="btn-primary inline-block px-10 py-3">
            Analyze My Portfolio →
          </Link>
        </div>
      </main>
    </div>
  )
}
