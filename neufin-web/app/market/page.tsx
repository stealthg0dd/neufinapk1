import Link from "next/link";
import type { Metadata } from "next";
import MarketClient from "./MarketClient";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StrategyEntry {
  type: string;
  count: number;
  pct: number;
  color: string;
  sector: string;
}
interface ScoreBand {
  range: string;
  label: string;
  count: number;
  pct: number;
}
interface MarketHealth {
  total_portfolios: number;
  avg_dna_score: number;
  median_dna_score: number;
  avg_concentration: number;
  score_distribution: ScoreBand[];
  strategy_mix: StrategyEntry[];
}
interface TrendPoint {
  date: string;
  avg_score: number;
  count: number;
}
interface GlobalMapRow {
  region: string;
  sentiment: number;
  volatility: number;
  regime: string;
  latest_signal?: {
    title?: string;
    signal_type?: string;
    value?: number;
    date?: string;
  };
}
interface RegimeCell {
  time: string;
  region: string;
  regime_state: string;
  intensity: number;
}

// Avoid static generation at build time (heavy upstream / DB); safe for Vercel CI.
export const dynamic = "force-dynamic";

// ── Metadata ───────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Global Market DNA | Neufin",
  description: `Live platform-wide portfolio intelligence. See how thousands of investors are positioned, the average DNA Score, and strategy concentration heatmap.`,
  openGraph: {
    title: "Global Market DNA | Neufin",
    description:
      "Live aggregated investment intelligence across all Neufin portfolios.",
    type: "website",
  },
};

// ── Data fetching ──────────────────────────────────────────────────────────────

/** Server-only: prefer public URL; fall back to RAILWAY_API_URL (set on Vercel for rewrites parity). */
function marketApiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL || process.env.RAILWAY_API_URL || "";
  return raw.replace(/\/$/, "");
}

const FETCH_MS = 25_000;

const EMPTY_HEALTH: MarketHealth = {
  total_portfolios: 0,
  avg_dna_score: 0,
  median_dna_score: 0,
  avg_concentration: 0,
  score_distribution: [],
  strategy_mix: [],
};

async function getMarketHealth(): Promise<MarketHealth> {
  try {
    const base = marketApiBase();
    const url = base ? `${base}/api/market/health` : "/api/market/health";
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return EMPTY_HEALTH;
    return res.json();
  } catch {
    return EMPTY_HEALTH;
  }
}

async function getScoreTrend(): Promise<TrendPoint[]> {
  try {
    const base = marketApiBase();
    const url = base
      ? `${base}/api/market/score-trend`
      : "/api/market/score-trend";
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.trend ?? [];
  } catch {
    return [];
  }
}

async function getGlobalMap(): Promise<GlobalMapRow[]> {
  try {
    const base = marketApiBase();
    const url = base
      ? `${base}/api/research/global-map?days=30`
      : "/api/research/global-map?days=30";
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.regions) ? data.regions : [];
  } catch {
    return [];
  }
}

async function getRegimeHeatmap(): Promise<{
  timeline: string[];
  regions: string[];
  cells: RegimeCell[];
}> {
  try {
    const base = marketApiBase();
    const url = base
      ? `${base}/api/research/regime-heatmap?days=60`
      : "/api/research/regime-heatmap?days=60";
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return { timeline: [], regions: [], cells: [] };
    const data = await res.json();
    return {
      timeline: Array.isArray(data.timeline) ? data.timeline : [],
      regions: Array.isArray(data.regions) ? data.regions : [],
      cells: Array.isArray(data.cells) ? data.cells : [],
    };
  } catch {
    return { timeline: [], regions: [], cells: [] };
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function MarketPage() {
  const [health, trend, globalMap, regimeHeatmap] = await Promise.all([
    getMarketHealth(),
    getScoreTrend(),
    getGlobalMap(),
    getRegimeHeatmap(),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-shell-deep">
      {/* Nav */}
      <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">
            Neufin
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/leaderboard"
              className="text-shell-muted hover:text-white text-sm transition-colors"
            >
              Leaderboard
            </Link>
            <Link href="/upload" className="btn-primary text-sm px-4 py-2">
              Analyze Portfolio
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-section w-full">
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
          <p className="text-shell-subtle text-sm">
            Aggregated, anonymised intelligence across{" "}
            <span className="text-shell-fg/90 font-medium">
              {health.total_portfolios.toLocaleString()}
            </span>{" "}
            portfolios. Updated every 5 minutes.
          </p>
        </div>

        <MarketClient
          health={health}
          trend={trend}
          globalMap={globalMap}
          regimeHeatmap={regimeHeatmap}
        />
      </main>
    </div>
  );
}
