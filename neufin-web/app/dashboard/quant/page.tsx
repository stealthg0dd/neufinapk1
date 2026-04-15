"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
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

  const monteCarloRows = useMemo(() => {
    const paths = data?.charts.monte_carlo_paths ?? [];
    const map = new Map<number, Record<string, number>>();
    for (const path of paths) {
      for (const p of path.points) {
        if (!map.has(p.day)) map.set(p.day, { day: p.day });
        map.get(p.day)![path.path_id] = p.value;
      }
    }
    return [...map.values()].sort((a, b) => (a.day as number) - (b.day as number));
  }, [data]);

  const varRows = useMemo(() => {
    const rows = data?.charts.var_cvar ?? [];
    return rows.filter((r) => r.confidence === 0.95);
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {metricCards.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3"
              >
                <p className="text-xs uppercase tracking-wider text-[#64748B]">
                  {m.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-[#0F172A]">{m.value}</p>
              </div>
            ))}
          </div>

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

          {tab === "Overview" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Factor Decomposition">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.charts.factor_decomposition}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="factor" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="weight_pct" fill="#1EB8CC" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="VaR / CVaR (95%)">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={varRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="horizon_days" />
                    <YAxis tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="var_pct" stroke="#0EA5E9" strokeWidth={2} />
                    <Line type="monotone" dataKey="cvar_pct" stroke="#EF4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          ) : null}

          {tab === "Factor Analysis" ? (
            <ChartCard title="Factor Decomposition">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={data.charts.factor_decomposition}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="factor" />
                  <YAxis tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="weight_pct" radius={[8, 8, 0, 0]}>
                    {data.charts.factor_decomposition.map((entry, idx) => (
                      <Cell
                        key={`${entry.factor}-${idx}`}
                        fill={idx % 2 === 0 ? "#1EB8CC" : "#0EA5E9"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          {tab === "Risk Surface" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="VaR / CVaR Surface">
                <ResponsiveContainer width="100%" height={330}>
                  <BarChart data={data.charts.var_cvar}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="horizon_days"
                      tickFormatter={(v) => `${v}d`}
                    />
                    <YAxis tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      formatter={(value: number) => `${value}%`}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload as { confidence?: number };
                        return `${label}d @ ${(row?.confidence ?? 0) * 100}%`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="var_pct" fill="#38BDF8" />
                    <Bar dataKey="cvar_pct" fill="#F97316" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Correlation Network">
                <CorrelationNetwork
                  nodes={network?.nodes ?? []}
                  edges={network?.edges ?? []}
                  activeNode={activeNode}
                  onActiveNode={setActiveNode}
                />
              </ChartCard>
            </div>
          ) : null}

          {tab === "Simulation" ? (
            <ChartCard title="Monte Carlo Paths">
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={monteCarloRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  {(data.charts.monte_carlo_paths ?? []).slice(0, 12).map((p, idx) => (
                    <Line
                      key={p.path_id}
                      type="monotone"
                      dataKey={p.path_id}
                      dot={false}
                      stroke={idx === 0 ? "#0EA5E9" : "#94A3B8"}
                      strokeWidth={idx === 0 ? 2 : 1}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          {tab === "Macro" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                <p className="text-xs uppercase tracking-wider text-[#64748B]">Regime Context</p>
                <p className="mt-2 text-2xl font-semibold text-[#0F172A]">
                  {data.quant_model.regime_context?.label || "Neutral"}
                </p>
                <p className="mt-2 text-sm text-[#475569]">
                  Confidence: {Math.round((data.quant_model.regime_context?.confidence || 0) * 100)}%
                </p>
                <p className="mt-4 text-sm text-[#475569]">
                  {data.context.recommendation_summary ||
                    "Macro positioning summary will appear after latest Swarm synthesis."}
                </p>
              </div>
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                <p className="text-xs uppercase tracking-wider text-[#64748B]">Active Quant Modes</p>
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
                  Forecast horizon: {data.quant_model.forecast?.horizon_days ?? "—"} days.
                  Volatility shift: {data.quant_model.forecast?.volatility_shift_pct_vs_baseline ?? "—"}%.
                </p>
              </div>
            </div>
          ) : null}

          {tab === "Alpha" ? (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Alpha Opportunity Feed
                </h3>
                <Link href="/dashboard/swarm" className="text-xs text-[#0EA5E9] hover:underline">
                  Run full swarm
                </Link>
              </div>
              <div className="space-y-2">
                {alphaFeed.length ? (
                  alphaFeed.map((row, idx) => (
                    <div
                      key={`${row.symbol}-${idx}`}
                      className="rounded-lg border border-[#E2E8F0] bg-[#FAFCFE] px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#0F172A]">{row.symbol}</p>
                        <p className="text-xs font-medium text-[#0C4A6E]">{row.confidence.toFixed(1)}% confidence</p>
                      </div>
                      <p className="mt-1 text-sm text-[#475569]">{row.reason}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#64748B]">No alpha opportunities available.</p>
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
  onActiveNode,
}: {
  nodes: Array<{ id: string; label: string; weight_pct: number }>;
  edges: Array<{ source: string; target: string; correlation: number }>;
  activeNode: string | null;
  onActiveNode: (id: string | null) => void;
}) {
  const graph = useMemo(() => {
    const cx = 180;
    const cy = 160;
    const radius = 110;
    const nodePos = nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      return {
        ...n,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      };
    });
    return { nodePos };
  }, [nodes]);

  const connected = useMemo(() => {
    if (!activeNode) return edges;
    return edges.filter((e) => e.source === activeNode || e.target === activeNode);
  }, [edges, activeNode]);

  const findNode = (id: string) => graph.nodePos.find((n) => n.id === id);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
      <svg viewBox="0 0 360 320" className="h-[320px] w-full rounded-md bg-[#F8FAFC]">
        {connected.map((e, idx) => {
          const src = findNode(e.source);
          const dst = findNode(e.target);
          if (!src || !dst) return null;
          const strong = Math.abs(e.correlation) > 0.7;
          return (
            <line
              key={`${e.source}-${e.target}-${idx}`}
              x1={src.x}
              y1={src.y}
              x2={dst.x}
              y2={dst.y}
              stroke={strong ? "#EF4444" : "#94A3B8"}
              strokeWidth={Math.max(1, Math.abs(e.correlation) * 3)}
              opacity={0.75}
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
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={active ? 16 : 12}
                fill={active ? "#0EA5E9" : "#1E293B"}
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize="9"
                fill="#FFFFFF"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="rounded-md border border-[#E2E8F0] bg-[#FAFCFE] p-3">
        {activeNode ? (
          <>
            <p className="text-xs uppercase tracking-wider text-[#64748B]">Hovered Symbol</p>
            <p className="mt-1 text-base font-semibold text-[#0F172A]">{activeNode}</p>
            <p className="mt-2 text-xs text-[#475569]">
              {connected.length} active correlation links visible.
            </p>
          </>
        ) : (
          <p className="text-xs text-[#64748B]">
            Hover a node to inspect connected correlation edges and cluster pressure.
          </p>
        )}
      </div>
    </div>
  );
}
