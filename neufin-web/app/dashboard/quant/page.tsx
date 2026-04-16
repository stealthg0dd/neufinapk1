"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import DashboardModeControls from "@/components/dashboard/DashboardModeControls";
import {
  type DashboardMode,
  useDashboardPowerMode,
} from "@/hooks/useDashboardPowerMode";

type QuantDashboardResponse = {
  portfolio: { id: string; name: string; total_value: number };
  modes: string[];
  quant_model: {
    alpha_score?: number;
    risk_adjusted_metrics?: {
      sharpe_proxy?: number;
      volatility_annualized_proxy?: number;
      max_drawdown_proxy?: number;
    };
    regime_context?: { label?: string; confidence?: number };
    forecast?: { horizon_days?: number; volatility_shift_pct_vs_baseline?: number };
  };
  charts: {
    factor_decomposition: Array<{ factor: string; weight_pct: number }>;
    monte_carlo_paths: Array<{
      path_id: string;
      points: Array<{ day: number; value: number }>;
    }>;
    var_cvar: Array<{
      confidence: number;
      horizon_days: number;
      var_pct: number;
      cvar_pct: number;
    }>;
    correlation_network: {
      nodes: Array<{ id: string; label: string; weight_pct: number }>;
      edges: Array<{ source: string; target: string; correlation: number }>;
    };
    alpha_feed: Array<{ symbol: string; confidence: number; reason: string }>;
  };
  context: {
    regime?: string | { label?: string; confidence?: number };
    recommendation_summary?: string;
    generated_at?: string;
  };
};

type QuantTab =
  | "Overview"
  | "Factor Analysis"
  | "Risk Surface"
  | "Simulation"
  | "Macro"
  | "Alpha";

const TABS: QuantTab[] = [
  "Overview",
  "Factor Analysis",
  "Risk Surface",
  "Simulation",
  "Macro",
  "Alpha",
];

const MODES_BY_DASHBOARD: Record<DashboardMode, string[]> = {
  cio: ["institutional", "macro", "allocation", "risk"],
  trader: ["trading", "alpha", "forecast", "risk"],
  advisor: ["institutional", "alpha", "risk", "macro"],
};

const FACTOR_COLORS = [
  "#1EB8CC", "#0EA5E9", "#6366F1", "#8B5CF6",
  "#10B981", "#F59E0B", "#EF4444", "#EC4899",
];

function metricColor(label: string, value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "#0F172A";
  if (label === "Sharpe Proxy") {
    if (num >= 1.0) return "#16A34A";
    if (num >= 0.5) return "#D97706";
    return "#DC2626";
  }
  if (label === "Alpha Score") {
    if (num >= 70) return "#16A34A";
    if (num >= 40) return "#D97706";
    return "#DC2626";
  }
  if (label === "Volatility") {
    const raw = num; // already in %
    if (raw <= 10) return "#16A34A";
    if (raw <= 20) return "#D97706";
    return "#DC2626";
  }
  if (label === "Max Drawdown") {
    if (num >= -10) return "#16A34A";
    if (num >= -20) return "#D97706";
    return "#DC2626";
  }
  return "#0F172A";
}

function alphaConfidenceColors(conf: number): { text: string; bar: string; border: string } {
  const pct = conf <= 1 ? conf * 100 : conf;
  if (pct >= 75) return { text: "#16A34A", bar: "#22C55E", border: "#BBF7D0" };
  if (pct >= 60) return { text: "#D97706", bar: "#F59E0B", border: "#FDE68A" };
  return { text: "#64748B", bar: "#94A3B8", border: "#E2E8F0" };
}

function edgeStroke(corr: number): string {
  const abs = Math.abs(corr);
  if (abs > 0.7) return "#EF4444";
  if (abs > 0.4) return "#F59E0B";
  return "#94A3B8";
}

export default function QuantDashboardPage() {
  const {
    advancedQuantMode,
    setAdvancedQuantMode,
    dashboardMode,
    setDashboardMode,
  } = useDashboardPowerMode();
  const [tab, setTab] = useState<QuantTab>("Overview");
  const [data, setData] = useState<QuantDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [activeEdge, setActiveEdge] = useState<{
    source: string; target: string; correlation: number;
  } | null>(null);
  const [confLevel, setConfLevel] = useState<0.9 | 0.95 | 0.99>(0.95);

  const selectedModes = useMemo(
    () => MODES_BY_DASHBOARD[dashboardMode],
    [dashboardMode],
  );

  useEffect(() => {
    if (!advancedQuantMode) return;
    setLoading(true);
    setError(null);
    void apiGet<QuantDashboardResponse>(
      `/api/research/quant-dashboard?modes=${encodeURIComponent(selectedModes.join(","))}`,
    )
      .then((res) => setData(res))
      .catch((err) => {
        console.error("[quant-dashboard] failed", err);
        setError("Unable to load quant dashboard data.");
      })
      .finally(() => setLoading(false));
  }, [advancedQuantMode, selectedModes]);

  // Compute p5 / p50 / p95 percentile bands from all Monte Carlo paths
  const monteCarloPercentiles = useMemo(() => {
    const paths = data?.charts.monte_carlo_paths ?? [];
    if (paths.length === 0) return [];
    const dayMap = new Map<number, number[]>();
    for (const path of paths) {
      for (const pt of path.points) {
        if (!dayMap.has(pt.day)) dayMap.set(pt.day, []);
        dayMap.get(pt.day)!.push(pt.value);
      }
    }
    return [...dayMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, vals]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        const n = sorted.length;
        return {
          day,
          p5: sorted[Math.floor(n * 0.05)] ?? sorted[0],
          p50: sorted[Math.floor(n * 0.5)] ?? sorted[0],
          p95: sorted[Math.floor(n * 0.95)] ?? sorted[n - 1],
        };
      });
  }, [data]);

  const varRows = useMemo(() => {
    const rows = data?.charts.var_cvar ?? [];
    const filtered = rows.filter((r) => Math.abs(r.confidence - confLevel) < 0.01);
    return filtered.length ? filtered : rows;
  }, [data, confLevel]);

  const sortedFactors = useMemo(() => {
    const factors = data?.charts.factor_decomposition ?? [];
    return [...factors].sort((a, b) => Math.abs(b.weight_pct) - Math.abs(a.weight_pct));
  }, [data]);

  const metricCards = useMemo(() => {
    const qm = data?.quant_model;
    const metrics = qm?.risk_adjusted_metrics;
    return [
      {
        label: "Alpha Score",
        value:
          typeof qm?.alpha_score === "number"
            ? qm.alpha_score.toFixed(1)
            : "—",
      },
      {
        label: "Sharpe Proxy",
        value:
          typeof metrics?.sharpe_proxy === "number"
            ? metrics.sharpe_proxy.toFixed(2)
            : "—",
      },
      {
        label: "Volatility",
        value:
          typeof metrics?.volatility_annualized_proxy === "number"
            ? `${(metrics.volatility_annualized_proxy * 100).toFixed(1)}%`
            : "—",
      },
      {
        label: "Max Drawdown",
        value:
          typeof metrics?.max_drawdown_proxy === "number"
            ? `${(metrics.max_drawdown_proxy * 100).toFixed(1)}%`
            : "—",
      },
    ];
  }, [data]);

  const regimeLabel = useMemo(() => {
    const r = data?.quant_model?.regime_context ?? data?.context?.regime;
    if (!r) return null;
    if (typeof r === "string") return r;
    return r.label ?? null;
  }, [data]);

  const alphaFeed = data?.charts.alpha_feed ?? [];
  const network = data?.charts.correlation_network;

  return (
    <div className="space-y-5">
      <div className="section-header">
        <div>
          <h1>Quant Dashboard</h1>
          <p>Interactive institutional analytics powered by quant model outputs.</p>
        </div>
      </div>

      <DashboardModeControls
        advancedQuantMode={advancedQuantMode}
        dashboardMode={dashboardMode}
        onToggleAdvanced={setAdvancedQuantMode}
        onModeChange={setDashboardMode}
      />

      {!advancedQuantMode ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white px-5 py-8 text-center">
          <p className="text-sm text-[#64748B]">
            Advanced quant controls are currently disabled. Enable Advanced Quant
            Mode to access the full quant dashboard.
          </p>
        </div>
      ) : loading ? (
        <div className="flex min-h-[180px] items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#64748B]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading quant analytics…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white px-5 py-8 text-center text-sm text-[#64748B]">
          No quant payload available.
        </div>
      ) : (
        <>
          {/* Metric cards — color-coded by threshold */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {metricCards.map((m) => {
              const color = metricColor(m.label, m.value);
              return (
                <div
                  key={m.label}
                  className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wider text-[#64748B]">
                    {m.label}
                  </p>
                  <p
                    className="mt-1 text-lg font-semibold tabular-nums"
                    style={{ color }}
                  >
                    {m.value}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Tab bar */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => {
                const active = t === tab;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={[
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                      active
                        ? "bg-[#0F172A] text-white"
                        : "border border-[#E2E8F0] bg-white text-[#334155]",
                    ].join(" ")}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Overview ─────────────────────────────────────────────── */}
          {tab === "Overview" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Factor Decomposition (Top Weights)">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sortedFactors}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="factor" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip
                      formatter={(v: number) => [`${(v as number).toFixed(2)}%`, "Weight"]}
                    />
                    <Bar dataKey="weight_pct" radius={[6, 6, 0, 0]}>
                      {sortedFactors.map((_, idx) => (
                        <Cell key={idx} fill={FACTOR_COLORS[idx % FACTOR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {regimeLabel ? (
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                  <p className="text-xs uppercase tracking-wider text-[#64748B]">
                    Regime Context
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[#0F172A]">{regimeLabel}</p>
                  <p className="mt-1 text-sm text-[#475569]">
                    Confidence:{" "}
                    {Math.round(
                      (data.quant_model.regime_context?.confidence ?? 0) * 100,
                    )}
                    %
                  </p>
                  {data.context.recommendation_summary && (
                    <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                      {data.context.recommendation_summary}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {data.modes.map((m) => (
                      <span
                        key={m}
                        className="rounded-full border border-[#BAE6FD] bg-[#F0F9FF] px-2.5 py-0.5 text-xs font-semibold text-[#0C4A6E]"
                      >
                        {m.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <ChartCard title="VaR / CVaR (95%)">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={varRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="horizon_days" tickFormatter={(v) => `${v}d`} />
                      <YAxis tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`]} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="var_pct"
                        name="VaR"
                        stroke="#0EA5E9"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="cvar_pct"
                        name="CVaR"
                        stroke="#EF4444"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          ) : null}

          {/* ── Factor Analysis ───────────────────────────────────────── */}
          {tab === "Factor Analysis" ? (
            <ChartCard title="Factor Decomposition — Sorted by Magnitude">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart
                  data={sortedFactors}
                  layout="vertical"
                  margin={{ left: 80, right: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => `${v}%`} />
                  <YAxis
                    type="category"
                    dataKey="factor"
                    tick={{ fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as {
                        factor: string;
                        weight_pct: number;
                      };
                      const rank =
                        sortedFactors.findIndex((f) => f.factor === d.factor) + 1;
                      return (
                        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 shadow-lg text-xs">
                          <p className="font-semibold text-[#0F172A]">{d.factor}</p>
                          <p className="mt-1 text-[#475569]">
                            Weight:{" "}
                            <span className="font-semibold text-[#1EB8CC]">
                              {d.weight_pct.toFixed(2)}%
                            </span>
                          </p>
                          <p className="mt-1 text-[#94A3B8]">
                            Rank: #{rank} of {sortedFactors.length}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="weight_pct" radius={[0, 6, 6, 0]}>
                    {sortedFactors.map((_, idx) => (
                      <Cell key={idx} fill={FACTOR_COLORS[idx % FACTOR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          {/* ── Risk Surface ──────────────────────────────────────────── */}
          {tab === "Risk Surface" ? (
            <div className="space-y-4">
              {/* Confidence level selector */}
              <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Confidence Level
                </span>
                <div className="flex gap-2">
                  {([0.9, 0.95, 0.99] as const).map((cl) => (
                    <button
                      key={cl}
                      type="button"
                      onClick={() => setConfLevel(cl)}
                      className={[
                        "rounded-md px-3 py-1 text-xs font-semibold transition",
                        confLevel === cl
                          ? "bg-[#1EB8CC] text-white"
                          : "border border-[#E2E8F0] bg-white text-[#334155] hover:border-[#1EB8CC]",
                      ].join(" ")}
                    >
                      {(cl * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title={`VaR / CVaR Surface — ${(confLevel * 100).toFixed(0)}% Confidence`}
                >
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={varRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="horizon_days" tickFormatter={(v) => `${v}d`} />
                      <YAxis tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(2)}%`,
                          name === "var_pct" ? "VaR" : "CVaR",
                        ]}
                        labelFormatter={(label) => `Horizon: ${label} days`}
                      />
                      <Legend
                        formatter={(v) => (v === "var_pct" ? "VaR" : "CVaR")}
                      />
                      <Bar dataKey="var_pct" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cvar_pct" fill="#F97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Correlation Network">
                  <CorrelationNetwork
                    nodes={network?.nodes ?? []}
                    edges={network?.edges ?? []}
                    activeNode={activeNode}
                    activeEdge={activeEdge}
                    onActiveNode={setActiveNode}
                    onActiveEdge={setActiveEdge}
                  />
                </ChartCard>
              </div>
            </div>
          ) : null}

          {/* ── Simulation ────────────────────────────────────────────── */}
          {tab === "Simulation" ? (
            <ChartCard title="Monte Carlo Simulation — P5 / Median / P95 Percentile Bands">
              <ResponsiveContainer width="100%" height={380}>
                <AreaChart
                  data={monteCarloPercentiles}
                  margin={{ top: 8, right: 24, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="mcBandFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1EB8CC" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1EB8CC" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis
                    dataKey="day"
                    label={{
                      value: "Day",
                      position: "insideBottomRight",
                      offset: -4,
                      fontSize: 11,
                    }}
                  />
                  <YAxis />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload as {
                        p5?: number;
                        p50?: number;
                        p95?: number;
                      };
                      return (
                        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 shadow-lg text-xs">
                          <p className="font-semibold text-[#0F172A]">
                            Day {label}
                          </p>
                          <p className="mt-1 text-[#EF4444]">
                            P5 (bear):{" "}
                            {d.p5 != null ? d.p5.toFixed(2) : "—"}
                          </p>
                          <p className="mt-0.5 text-[#1EB8CC]">
                            P50 (median):{" "}
                            {d.p50 != null ? d.p50.toFixed(2) : "—"}
                          </p>
                          <p className="mt-0.5 text-[#16A34A]">
                            P95 (bull):{" "}
                            {d.p95 != null ? d.p95.toFixed(2) : "—"}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="p95"
                    stroke="#16A34A"
                    strokeWidth={2}
                    fill="url(#mcBandFill)"
                    name="P95 (Bull)"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="p50"
                    stroke="#1EB8CC"
                    strokeWidth={2.5}
                    fill="transparent"
                    name="P50 (Median)"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="p5"
                    stroke="#EF4444"
                    strokeWidth={2}
                    fill="transparent"
                    name="P5 (Bear)"
                    dot={false}
                  />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          {/* ── Macro ─────────────────────────────────────────────────── */}
          {tab === "Macro" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                <p className="text-xs uppercase tracking-wider text-[#64748B]">
                  Regime Context
                </p>
                <p className="mt-2 text-2xl font-bold text-[#0F172A]">
                  {data.quant_model.regime_context?.label ?? "Neutral"}
                </p>
                <p className="mt-2 text-sm text-[#475569]">
                  Confidence:{" "}
                  {Math.round(
                    (data.quant_model.regime_context?.confidence ?? 0) * 100,
                  )}
                  %
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[#475569]">
                  {data.context.recommendation_summary ??
                    "Macro positioning summary will appear after latest Swarm synthesis."}
                </p>
              </div>
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                <p className="text-xs uppercase tracking-wider text-[#64748B]">
                  Active Quant Modes
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.modes.map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-[#BAE6FD] bg-[#F0F9FF] px-3 py-1 text-xs font-semibold text-[#0C4A6E]"
                    >
                      {m.toUpperCase()}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm text-[#475569]">
                  Forecast horizon:{" "}
                  {data.quant_model.forecast?.horizon_days ?? "—"} days. Volatility
                  shift:{" "}
                  {data.quant_model.forecast?.volatility_shift_pct_vs_baseline ?? "—"}
                  %.
                </p>
              </div>
            </div>
          ) : null}

          {/* ── Alpha ─────────────────────────────────────────────────── */}
          {tab === "Alpha" ? (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Alpha Opportunity Feed
                </h3>
                <Link
                  href="/dashboard/swarm"
                  className="text-xs text-[#0EA5E9] hover:underline"
                >
                  Run full swarm
                </Link>
              </div>
              <div className="space-y-3">
                {alphaFeed.length ? (
                  alphaFeed.map((row, idx) => {
                    const confPct =
                      row.confidence <= 1
                        ? row.confidence * 100
                        : row.confidence;
                    const { text, bar, border } = alphaConfidenceColors(
                      row.confidence,
                    );
                    return (
                      <div
                        key={`${row.symbol}-${idx}`}
                        className="rounded-lg border bg-[#FAFCFE] px-4 py-3"
                        style={{ borderColor: border }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#0F172A]">
                            {row.symbol}
                          </p>
                          <p
                            className="text-xs font-semibold tabular-nums"
                            style={{ color: text }}
                          >
                            {confPct.toFixed(0)}% confidence
                          </p>
                        </div>
                        {/* Confidence progress bar */}
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, confPct)}%`,
                              background: bar,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-sm text-[#475569]">{row.reason}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-[#64748B]">
                    No alpha opportunities available.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#0F172A]">{title}</h3>
      {children}
    </div>
  );
}

function CorrelationNetwork({
  nodes,
  edges,
  activeNode,
  activeEdge,
  onActiveNode,
  onActiveEdge,
}: {
  nodes: Array<{ id: string; label: string; weight_pct: number }>;
  edges: Array<{ source: string; target: string; correlation: number }>;
  activeNode: string | null;
  activeEdge: { source: string; target: string; correlation: number } | null;
  onActiveNode: (id: string | null) => void;
  onActiveEdge: (
    edge: { source: string; target: string; correlation: number } | null,
  ) => void;
}) {
  const graph = useMemo(() => {
    const cx = 180;
    const cy = 160;
    const radius = 110;
    const maxWeight = Math.max(...nodes.map((n) => n.weight_pct || 1), 1);
    const nodePos = nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      // Node size 8–20 proportional to portfolio weight
      const r = 8 + ((n.weight_pct || 0) / maxWeight) * 12;
      return {
        ...n,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r,
      };
    });
    return { nodePos };
  }, [nodes]);

  const visibleEdges = useMemo(() => {
    if (!activeNode) return edges;
    return edges.filter(
      (e) => e.source === activeNode || e.target === activeNode,
    );
  }, [edges, activeNode]);

  const findNode = (id: string) => graph.nodePos.find((n) => n.id === id);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
      <svg
        viewBox="0 0 360 320"
        className="h-[300px] w-full rounded-md bg-[#F8FAFC]"
      >
        {visibleEdges.map((e, idx) => {
          const src = findNode(e.source);
          const dst = findNode(e.target);
          if (!src || !dst) return null;
          const isActive =
            activeEdge?.source === e.source && activeEdge?.target === e.target;
          return (
            <line
              key={`${e.source}-${e.target}-${idx}`}
              x1={src.x}
              y1={src.y}
              x2={dst.x}
              y2={dst.y}
              stroke={edgeStroke(e.correlation)}
              strokeWidth={isActive ? 3 : Math.max(1, Math.abs(e.correlation) * 3)}
              opacity={isActive ? 1 : 0.6}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => onActiveEdge(e)}
              onMouseLeave={() => onActiveEdge(null)}
            />
          );
        })}
        {graph.nodePos.map((n) => {
          const active = activeNode === n.id;
          return (
            <g
              key={n.id}
              onMouseEnter={() => onActiveNode(n.id)}
              onMouseLeave={() => onActiveNode(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={active ? n.r + 4 : n.r}
                fill={active ? "#0EA5E9" : "#1E293B"}
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize="8"
                fill="#FFFFFF"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="rounded-md border border-[#E2E8F0] bg-[#FAFCFE] p-3 text-xs">
        {activeEdge ? (
          <>
            <p className="font-semibold uppercase tracking-wider text-[#64748B]">
              Edge Details
            </p>
            <p className="mt-1 font-semibold text-[#0F172A]">
              {activeEdge.source} ↔ {activeEdge.target}
            </p>
            <p className="mt-1 text-[#475569]">
              Correlation:{" "}
              <span
                className="font-semibold"
                style={{ color: edgeStroke(activeEdge.correlation) }}
              >
                {activeEdge.correlation.toFixed(3)}
              </span>
            </p>
            <p className="mt-1 text-[#94A3B8]">
              {Math.abs(activeEdge.correlation) > 0.7
                ? "High — cluster risk"
                : Math.abs(activeEdge.correlation) > 0.4
                  ? "Moderate correlation"
                  : "Low correlation"}
            </p>
          </>
        ) : activeNode ? (
          <>
            <p className="font-semibold uppercase tracking-wider text-[#64748B]">
              Node: {activeNode}
            </p>
            <p className="mt-1 text-[#475569]">
              {visibleEdges.length} correlation links.
            </p>
            <p className="mt-1 text-[#94A3B8]">
              Node size reflects portfolio weight.
            </p>
          </>
        ) : (
          <p className="text-[#64748B]">
            Hover a node or edge to inspect correlations and cluster pressure.
          </p>
        )}
      </div>
    </div>
  );
}
