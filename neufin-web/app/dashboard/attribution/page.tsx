"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/api";
import Link from "next/link";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";

// Sector classification matching SECTOR_MAP in pdf_generator.py
const SECTOR_MAP: Record<string, string> = {
  "VCI.VN": "Securities",
  "SSI.VN": "Securities",
  "VPB.VN": "Banking",
  "MBB.VN": "Banking",
  "BID.VN": "Banking",
  "VCB.VN": "Banking",
  "HPG.VN": "Materials",
  AAPL: "Technology",
  MSFT: "Technology",
  GOOGL: "Technology",
  NVDA: "Technology",
  AMZN: "Consumer Discretionary",
  TSLA: "Consumer Discretionary",
  JNJ: "Healthcare",
  PFE: "Healthcare",
  XOM: "Energy",
  CVX: "Energy",
  JPM: "Financials",
  BAC: "Financials",
  GS: "Financials",
};

function classifySector(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (SECTOR_MAP[upper]) return SECTOR_MAP[upper];
  if (upper.endsWith(".VN")) return "Vietnam Equity";
  if (upper.endsWith(".L")) return "UK Equity";
  if (upper.endsWith(".SI")) return "Singapore Equity";
  return "Other";
}

type Position = {
  symbol: string;
  weight: number;
  current_value?: number;
  current_price?: number;
  beta?: number;
  market_code?: string;
};

type Metrics = {
  hhi?: number;
  weighted_beta?: number;
  dna_score?: number;
  score_breakdown?: {
    hhi_concentration?: number;
    beta_risk?: number;
    tax_alpha?: number;
    correlation?: number;
  };
  positions?: Position[];
  total_value?: number;
  annualized_volatility?: number;
};

type Portfolio = {
  id: string;
  name: string;
  metrics?: Metrics;
  positions?: Position[];
};

type RiskSlice = { label: string; pct: number; color: string };

const RISK_COLORS = [
  "#1EB8CC",
  "#F5A623",
  "#22C55E",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
];

function PieChart({ slices }: { slices: RiskSlice[] }) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 48;
  const hole = 28;

  let cumAngle = -Math.PI / 2;
  const paths: { d: string; color: string; label: string; pct: number }[] = [];

  slices.forEach((slice) => {
    const angle = (slice.pct / 100) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(cumAngle + angle);
    const y2 = cy + r * Math.sin(cumAngle + angle);
    const xi1 = cx + hole * Math.cos(cumAngle);
    const yi1 = cy + hole * Math.sin(cumAngle);
    const xi2 = cx + hole * Math.cos(cumAngle + angle);
    const yi2 = cy + hole * Math.sin(cumAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    paths.push({
      d: `M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${hole} ${hole} 0 ${large} 0 ${xi1} ${yi1} Z`,
      color: slice.color,
      label: slice.label,
      pct: slice.pct,
    });
    cumAngle += angle;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label="Risk attribution donut chart"
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} />
      ))}
    </svg>
  );
}

function FactorTilt({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-white p-4 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
          {label}
        </p>
        <p className="mt-0.5 text-base font-bold text-navy">{value}</p>
        <p className="mt-0.5 text-xs text-slate2">{description}</p>
      </div>
    </div>
  );
}

export default function AttributionPage() {
  const { token } = useAuth();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        // Fetch the most recent portfolio
        const listRes = await authFetch("/api/portfolio/list", {}, token);
        if (!listRes?.ok) throw new Error("Failed to load portfolio list");
        const listData = await listRes.json();
        const portfolios: Portfolio[] = listData.portfolios ?? listData ?? [];
        if (!portfolios.length) {
          setError("No portfolio found. Upload one in the Portfolio tab.");
          return;
        }

        const latest = portfolios[0];
        const metricsRes = await authFetch(
          `/api/portfolio/${latest.id}/metrics`,
          {},
          token,
        );
        if (!metricsRes?.ok) throw new Error("Failed to load portfolio metrics");
        const metricsData = await metricsRes.json();

        setPortfolio({
          ...latest,
          metrics: metricsData.metrics ?? metricsData,
          positions: metricsData.positions ?? metricsData.metrics?.positions ?? [],
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted2" />
        <h2 className="mb-2 text-xl font-bold text-navy">
          {error ?? "No portfolio data"}
        </h2>
        <p className="text-slate2">
          Attribution analysis requires a portfolio with resolved positions.
        </p>
        <Link
          href="/dashboard/portfolio"
          className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Upload Portfolio
        </Link>
      </div>
    );
  }

  const metrics = portfolio.metrics ?? {};
  const positions: Position[] = portfolio.positions ?? metrics.positions ?? [];
  const hhi = metrics.hhi ?? 0;
  const beta = metrics.weighted_beta ?? 1.0;
  const breakdown = metrics.score_breakdown ?? {};
  const totalValue = metrics.total_value ?? 0;

  // ── Risk attribution slices ──────────────────────────────────────────────────
  // Derived heuristically from HHI, beta, and correlation placeholder
  const betaPct = Math.min(55, Math.round(beta * 30));
  const hHIPct = Math.min(30, Math.round(hhi * 80));
  const corrPct = 15;
  const idioRaw = Math.max(0, 100 - betaPct - hHIPct - corrPct);
  const riskSlices: RiskSlice[] = [
    { label: "Market Beta", pct: betaPct, color: RISK_COLORS[0] },
    { label: "Concentration (HHI)", pct: hHIPct, color: RISK_COLORS[1] },
    { label: "Sector Concentration", pct: corrPct, color: RISK_COLORS[2] },
    { label: "Idiosyncratic", pct: idioRaw, color: RISK_COLORS[3] },
  ];

  // ── Sector exposure ──────────────────────────────────────────────────────────
  const sectorMap: Record<string, { value: number; weight: number; beta: number; count: number }> =
    {};
  for (const pos of positions) {
    const sector = classifySector(pos.symbol);
    const w = pos.weight ?? 0;
    const b = pos.beta ?? 1.0;
    const v = pos.current_value ?? 0;
    if (!sectorMap[sector]) sectorMap[sector] = { value: 0, weight: 0, beta: 0, count: 0 };
    sectorMap[sector].value += v;
    sectorMap[sector].weight += w;
    sectorMap[sector].beta += b;
    sectorMap[sector].count += 1;
  }
  const sectorRows = Object.entries(sectorMap)
    .map(([sector, s]) => ({
      sector,
      weightPct: Math.round(s.weight * 100 * 10) / 10,
      avgBeta: Math.round((s.beta / s.count) * 100) / 100,
      hhi_contrib: Math.round(s.weight * s.weight * 100 * 100) / 100,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  // ── Active bets (top overweights vs equal-weight benchmark) ─────────────────
  const ewBenchmark = positions.length ? 1 / positions.length : 0;
  const activeBets = positions
    .map((p) => ({
      symbol: p.symbol,
      weight: p.weight ?? 0,
      activeWeight: (p.weight ?? 0) - ewBenchmark,
      beta: p.beta ?? 1.0,
    }))
    .sort((a, b) => Math.abs(b.activeWeight) - Math.abs(a.activeWeight))
    .slice(0, 10);

  // ── Factor tilts ─────────────────────────────────────────────────────────────
  const avgBeta = beta;
  const sizeTilt =
    avgBeta > 1.2 ? "Small-Cap Tilt" : avgBeta < 0.9 ? "Large-Cap Tilt" : "Neutral";
  const sizeTiltDesc =
    avgBeta > 1.2
      ? "Portfolio beta > 1.2 — skewed toward higher-volatility, growth-oriented names"
      : avgBeta < 0.9
        ? "Portfolio beta < 0.9 — defensive, large-cap weighted allocation"
        : "Beta near 1.0 — balanced size exposure";

  const topSector = sectorRows[0]?.sector ?? "Mixed";
  const valueTilt =
    topSector === "Technology" ? "Growth" : topSector === "Financials" ? "Value" : "Blend";

  const topPos = [...positions].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 3);
  const momentumLabel = topPos.map((p) => p.symbol).join(", ");

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">
            Attribution Analysis
          </h1>
          <p className="mt-1 text-slate2">
            {portfolio.name ?? "Portfolio"} ·{" "}
            {totalValue > 0 ? `$${totalValue.toLocaleString()}` : "—"}
          </p>
        </div>
        <Link
          href="/dashboard/reports"
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-slate2 hover:border-primary hover:text-primary"
        >
          Export to PDF →
        </Link>
      </div>

      {/* Risk Attribution */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-navy">Risk Attribution</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Donut chart */}
          <div className="flex items-center gap-6 rounded-2xl border border-border bg-white p-6 shadow-sm">
            <PieChart slices={riskSlices} />
            <div className="space-y-2">
              {riskSlices.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="text-sm text-navy">{s.label}</span>
                  <span className="ml-auto text-sm font-semibold text-navy">
                    {s.pct}%
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted2">
                HHI: {hhi.toFixed(3)} · Beta: {beta.toFixed(2)}
              </p>
            </div>
          </div>
          {/* Score breakdown */}
          <div className="space-y-3 rounded-2xl border border-border bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted2">
              DNA Score Components
            </p>
            {(
              [
                ["HHI Concentration", breakdown.hhi_concentration ?? 0, 25],
                ["Beta Risk", breakdown.beta_risk ?? 0, 25],
                ["Tax Alpha", breakdown.tax_alpha ?? 0, 20],
                ["Correlation", breakdown.correlation ?? 0, 15],
              ] as [string, number, number][]
            ).map(([label, pts, max]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate2">{label}</span>
                  <span className="font-medium text-navy">
                    {Math.round(pts)}/{max} pts
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((pts / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sector Exposure */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-navy">Sector Exposure</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted2">
                <th className="px-5 py-3">Sector</th>
                <th className="px-5 py-3 text-right">Weight %</th>
                <th className="px-5 py-3 text-right">Avg Beta</th>
                <th className="px-5 py-3 text-right">HHI Contrib</th>
              </tr>
            </thead>
            <tbody>
              {sectorRows.map((row) => (
                <tr
                  key={row.sector}
                  className="border-b border-border-light last:border-0 hover:bg-surface-2/50"
                >
                  <td className="px-5 py-3 font-medium text-navy">
                    {row.sector}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, row.weightPct)}%` }}
                        />
                      </div>
                      <span className="font-medium text-navy">
                        {row.weightPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-slate2">
                    {row.avgBeta.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate2">
                    {row.hhi_contrib.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Bets */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-navy">
            Active Bets vs Equal-Weight Benchmark
          </h2>
          <span className="text-xs text-muted2">
            Benchmark: equal-weight across {positions.length} positions
          </span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted2">
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3 text-right">Actual Weight</th>
                <th className="px-5 py-3 text-right">Active Weight</th>
                <th className="px-5 py-3 text-right">Beta</th>
                <th className="px-5 py-3 text-right">Tilt</th>
              </tr>
            </thead>
            <tbody>
              {activeBets.map((bet) => {
                const isOver = bet.activeWeight > 0;
                return (
                  <tr
                    key={bet.symbol}
                    className="border-b border-border-light last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="px-5 py-3 font-medium text-navy">
                      {bet.symbol}
                    </td>
                    <td className="px-5 py-3 text-right text-slate2">
                      {(bet.weight * 100).toFixed(1)}%
                    </td>
                    <td
                      className={[
                        "px-5 py-3 text-right font-medium",
                        isOver ? "text-emerald-600" : "text-red-500",
                      ].join(" ")}
                    >
                      {isOver ? "+" : ""}
                      {(bet.activeWeight * 100).toFixed(1)}%
                    </td>
                    <td className="px-5 py-3 text-right text-slate2">
                      {bet.beta.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {isOver ? (
                        <TrendingUp className="ml-auto h-4 w-4 text-emerald-500" />
                      ) : bet.activeWeight < 0 ? (
                        <TrendingDown className="ml-auto h-4 w-4 text-red-400" />
                      ) : (
                        <Minus className="ml-auto h-4 w-4 text-muted2" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Factor Tilts */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-navy">Factor Tilts</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FactorTilt
            label="Size"
            value={sizeTilt}
            description={sizeTiltDesc}
          />
          <FactorTilt
            label="Value vs Growth"
            value={valueTilt}
            description={`Top sector: ${topSector} — implies ${valueTilt.toLowerCase()} factor lean`}
          />
          <FactorTilt
            label="Momentum"
            value="Recent Leaders"
            description={`Top 3 positions: ${momentumLabel}`}
          />
          <FactorTilt
            label="Quality"
            value={avgBeta < 1.1 ? "High Quality" : "Mixed"}
            description={
              avgBeta < 1.1
                ? "Below-market beta implies lower leverage and more profitable holdings"
                : "Mixed quality profile — some speculative exposure"
            }
          />
        </div>
      </section>
    </div>
  );
}
