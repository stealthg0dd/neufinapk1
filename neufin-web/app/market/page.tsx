import Link from 'next/link'
import type { Metadata } from 'next'
import MarketClient from './MarketClient'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StrategyEntry {
  type: string; count: number; pct: number; color: string; sector: string
}
interface ScoreBand {
  range: string; label: string; count: number; pct: number
}
interface MarketHealth {
  total_portfolios: number
  avg_dna_score: number
  median_dna_score: number
  avg_concentration: number
  score_distribution: ScoreBand[]
  strategy_mix: StrategyEntry[]
}
interface TrendPoint { date: string; avg_score: number; count: number }

// ── Metadata ───────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Global Market DNA | Neufin',
  description: `Live platform-wide portfolio intelligence. See how thousands of investors are positioned, the average DNA Score, and strategy concentration heatmap.`,
  openGraph: {
    title: 'Global Market DNA | Neufin',
    description: 'Live aggregated investment intelligence across all Neufin portfolios.',
    type: 'website',
  },
}

// ── Data fetching ──────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'https://neufin101-production.up.railway.app'

const EMPTY_HEALTH: MarketHealth = {
  total_portfolios: 0,
  avg_dna_score: 0,
  median_dna_score: 0,
  avg_concentration: 0,
  score_distribution: [],
  strategy_mix: [],
}

async function getMarketHealth(): Promise<MarketHealth> {
  try {
    const res = await fetch(`${API}/api/market/health`, {
      next: { revalidate: 300 },  // matches backend 5-min cache
    })
    if (!res.ok) return EMPTY_HEALTH
    return res.json()
  } catch {
    return EMPTY_HEALTH
  }
}

async function getScoreTrend(): Promise<TrendPoint[]> {
  try {
    const res = await fetch(`${API}/api/market/score-trend`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.trend ?? []
  } catch {
    return []
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function MarketPage() {
  const [health, trend] = await Promise.all([getMarketHealth(), getScoreTrend()])

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <div className="flex items-center gap-4">
            <Link href="/leaderboard" className="text-gray-400 hover:text-white text-sm transition-colors">
              Leaderboard
            </Link>
            <Link href="/upload" className="btn-primary text-sm px-4 py-2">
              Analyze Portfolio
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold text-white">Global Market DNA</h1>
            {/* Live pulse */}
            <span className="relative flex h-2.5 w-2.5 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            Aggregated, anonymised intelligence across{' '}
            <span className="text-gray-300 font-medium">
              {health.total_portfolios.toLocaleString()}
            </span>{' '}
            portfolios. Updated every 5 minutes.
          </p>
        </div>

        <MarketClient health={health} trend={trend} />
      </main>
    </div>
  )
}
