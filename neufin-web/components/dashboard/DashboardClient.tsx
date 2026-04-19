"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  LayoutDashboard,
  PieChart,
  BookOpen,
  FileText,
  Users,
  Settings,
  ChevronDown,
  ArrowUpDown,
  Dna,
  Bot,
  FolderUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiPost } from "@/lib/api-client";
import {
  authFetch,
  getPortfolioHistory,
  getResearchNotes,
  type ResearchNote,
} from "@/lib/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { TickerNumber } from "@/components/ui/TickerNumber";
import {
  FINANCIAL_EM_DASH,
  formatNativePrice,
  formatNativeValue,
} from "@/lib/finance-content";
import clsx from "clsx";

type PortfolioRow = {
  portfolio_id: string;
  portfolio_name: string;
  total_value: number;
  dna_score: number | null;
  positions_count: number;
  created_at: string;
};

type MetricPosition = {
  symbol: string;
  shares: number;
  current_price: number | null;
  current_value: number | null;
  weight: number;
  native_currency?: string | null;
};

type PortfolioMetrics = {
  total_value: number;
  base_currency?: string;
  dna_score: number;
  weighted_beta: number;
  annualized_volatility?: number;
  pnl_pct?: number | null;
  max_position_pct?: number;
  positions: MetricPosition[];
};

function sharpeFromHistory(points: { value: number }[]): number | null {
  if (points.length < 4) return null;
  const rets: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].value;
    const b = points[i].value;
    if (a > 0) rets.push((b - a) / a);
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  if (std < 1e-9) return null;
  return (mean / std) * Math.sqrt(252);
}

function maxDrawdownPct(points: { value: number }[]): number | null {
  if (!points.length) return null;
  let peak = points[0].value;
  let maxDD = 0;
  for (const p of points) {
    if (p.value > peak) peak = p.value;
    if (peak > 0) maxDD = Math.max(maxDD, (peak - p.value) / peak);
  }
  return maxDD * 100;
}

function makeFmtMoney(currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}
const fmtMoneyUSD = makeFmtMoney("USD");

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Portfolio", icon: PieChart },
  { href: "/research", label: "Research", icon: BookOpen },
  { href: "/vault", label: "Reports", icon: FileText },
  { href: "/advisor/dashboard", label: "Advisor", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardClient() {
  const pathname = usePathname();
  const {
    loading: authLoading,
    token,
    user,
    signOut,
    getAccessToken,
  } = useAuth();
  const [portfolios, setPortfolios] = useState<PortfolioRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const fmtMoney = metrics?.base_currency
    ? makeFmtMoney(metrics.base_currency)
    : fmtMoneyUSD;
  const [history, setHistory] = useState<{ time: string; value: number }[]>([]);
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [loadMain, setLoadMain] = useState(true);
  const [loadChart, setLoadChart] = useState(false);
  const [loadNotes, setLoadNotes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiQ, setAiQ] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const hasPatchedVisit = useRef(false);

  const [sortKey, setSortKey] = useState<
    "symbol" | "weight" | "price" | "value"
  >("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (
      !authLoading &&
      user &&
      user.user_metadata &&
      !user.user_metadata.onboarding_complete
    ) {
      window.location.replace("/onboarding");
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (
      user?.user_metadata?.first_dashboard_visit === undefined ||
      user?.user_metadata?.first_dashboard_visit === null
    ) {
      if (token && !hasPatchedVisit.current) {
        hasPatchedVisit.current = true;
        authFetch(
          "/api/auth/profile",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_dashboard_visit: true }),
          },
          token,
        ).catch(() => {});
      }
    }
  }, [user, token]);

  useEffect(() => {
    if (!token) return;
    setLoadMain(true);
    setError(null);
    authFetch("/api/portfolio/list", {}, token)
      .then(async (r) => {
        if (!r) {
          setPortfolios([]);
          return;
        }
        const data = await r.json();
        const list = Array.isArray(data) ? data : [];
        setPortfolios(list);
        if (list.length && !selectedId) setSelectedId(list[0].portfolio_id);
      })
      .catch(() => setError("Could not load portfolios"))
      .finally(() => setLoadMain(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) return;
    setLoadChart(true);
    setError(null);
    authFetch(`/api/portfolio/${selectedId}/metrics`, {}, token)
      .then(async (r) => {
        if (!r) {
          setMetrics(null);
          return;
        }
        const m = (await r.json()) as PortfolioMetrics;
        setMetrics(m);
        const syms = m.positions?.map((p) => p.symbol) ?? [];
        const shares = m.positions?.map((p) => p.shares) ?? [];
        if (syms.length) {
          try {
            const h = await getPortfolioHistory(syms, shares, "1mo", token);
            setHistory(h.history ?? []);
          } catch {
            setHistory([]);
          }
        } else setHistory([]);
      })
      .catch(() => {
        setMetrics(null);
        setHistory([]);
        setError("Could not load portfolio metrics");
      })
      .finally(() => setLoadChart(false));
  }, [token, selectedId]);

  useEffect(() => {
    if (!token) return;
    setLoadNotes(true);
    getResearchNotes(token, 1)
      .then((n) => setNotes(n.slice(0, 8)))
      .finally(() => setLoadNotes(false));
  }, [token]);

  const dayChangePct = useMemo(() => {
    if (history.length < 2) return null;
    const a = history[0].value;
    const b = history[history.length - 1].value;
    if (!a) return null;
    return ((b - a) / a) * 100;
  }, [history]);

  const sharpe = useMemo(() => sharpeFromHistory(history), [history]);
  const maxDd = useMemo(() => maxDrawdownPct(history), [history]);

  const sortedPositions = useMemo(() => {
    const rows = metrics?.positions ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((x, y) => {
      let vx = 0;
      let vy = 0;
      if (sortKey === "symbol") return mul * x.symbol.localeCompare(y.symbol);
      if (sortKey === "weight") {
        vx = x.weight;
        vy = y.weight;
      } else if (sortKey === "price") {
        vx = x.current_price ?? 0;
        vy = y.current_price ?? 0;
      } else {
        vx = x.current_value ?? 0;
        vy = y.current_value ?? 0;
      }
      return mul * (vx - vy);
    });
  }, [metrics?.positions, sortKey, sortDir]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const onAskAi = async () => {
    if (!aiQ.trim() || !metrics) return;
    const t = await getAccessToken();
    if (!t) return;
    setAiBusy(true);
    setAiReply(null);
    try {
      const data = await apiPost<{
        reply?: string;
        response?: { answer?: string };
        answer?: string;
        message?: string;
        content?: string;
      }>("/api/swarm/chat", {
        message: aiQ.slice(0, 500),
        total_value: metrics.total_value,
        positions: (metrics.positions ?? []).map((p) => ({
          symbol: p.symbol,
          shares: p.shares,
          price: p.current_price,
          value: p.current_value,
          weight: p.weight,
        })),
      });
      const reply =
        data?.reply ||
        data?.response?.answer ||
        data?.answer ||
        data?.message ||
        data?.content ||
        "No response received";
      setAiReply(reply);
    } catch {
      setAiReply("Request failed. Try again.");
    } finally {
      setAiBusy(false);
    }
  };

  const initials = user?.email?.split("@")[0].slice(0, 2).toUpperCase() ?? "?";

  if (authLoading || (loadMain && portfolios === null)) {
    return (
      <div className="flex min-h-screen bg-[var(--canvas)]">
        <aside className="hidden md:block w-[240px] border-r border-[var(--border)] p-4 space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 rounded-lg shimmer" />
          ))}
        </aside>
        <div className="flex-1 p-6 space-y-4">
          <div className="h-12 rounded-xl shimmer max-w-md" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl shimmer" />
            ))}
          </div>
          <div className="h-64 rounded-2xl shimmer" />
          <div className="h-48 rounded-2xl shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] flex flex-col md:flex-row pb-section md:pb-0">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-[240px] shrink-0 border-r border-[var(--border)] flex-col bg-[var(--surface-1)]/50 backdrop-blur-xl">
        <div className="p-5 border-b border-[var(--border)]">
          <Link href="/" className="font-sans text-xl text-primary">
            NeuFin
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border-l-2",
                  active
                    ? "border-primary bg-[var(--surface-2)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-2)]/60",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-[var(--border)] space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-xs font-mono text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ui-muted truncate">
                {user?.email}
              </p>
              <span className="text-sm uppercase tracking-wider text-[var(--text-secondary)]">
                Plan · Trial
              </span>
            </div>
          </div>
          <Link
            href="/pricing"
            className="text-xs text-primary font-medium hover:underline block"
          >
            Upgrade
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-ui-muted hover:text-[var(--text-secondary)]"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 p-4 md:p-6 lg:pr-2 space-y-6">
        {error && (
          <GlassCard className="p-4 border-[var(--red)]/40 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-[var(--red)]">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]"
            >
              Retry
            </button>
          </GlassCard>
        )}

        {!portfolios?.length ? (
          <div className="space-y-6">
            {/* Welcome hero */}
            <GlassCard className="p-8 text-center border-[var(--border-accent)]">
              <div className="mb-4 flex justify-center">
                <Dna className="h-12 w-12 text-primary" aria-hidden />
              </div>
              <h2 className="font-sans text-2xl text-[var(--text-primary)] mb-2">
                Welcome to NeuFin
              </h2>
              <p className="text-[var(--text-secondary)] mb-1">
                You have{" "}
                <span className="text-primary font-semibold">
                  14 days full access
                </span>{" "}
                — no credit card required.
              </p>
              <p className="text-sm text-ui-muted mb-8">
                Upload a portfolio CSV to generate your Investor DNA Score and
                unlock AI swarm analysis.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  <FolderUp className="h-4 w-4 shrink-0" aria-hidden />
                  Upload Portfolio CSV
                </Link>
                <Link
                  href="/dashboard/swarm"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--glass-border)] text-[var(--text-primary)] font-semibold text-sm hover:border-[var(--border-accent)] transition-colors"
                >
                  <Bot className="h-4 w-4 shrink-0" aria-hidden />
                  Try Swarm Analysis
                </Link>
              </div>
            </GlassCard>

            {/* What you get */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(
                [
                  {
                    Icon: Dna,
                    title: "DNA Score",
                    desc: "Behavioral bias detection across your portfolio",
                  },
                  {
                    Icon: Bot,
                    title: "AI Swarm",
                    desc: "Multi-model analysis: Claude, GPT-4, Gemini",
                  },
                  {
                    Icon: FileText,
                    title: "PDF Report",
                    desc: "Professional advisor-ready report download",
                  },
                ] as const
              ).map(({ Icon, title, desc }) => (
                <GlassCard key={title} className="p-5">
                  <Icon className="mb-2 h-8 w-8 text-primary" aria-hidden />
                  <p className="font-semibold text-[var(--text-primary)] text-sm mb-1">
                    {title}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">{desc}</p>
                </GlassCard>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <label className="text-xs text-ui-muted block mb-1">
                  Portfolio
                </label>
                <div className="relative inline-block">
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="appearance-none font-mono text-sm bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-lg pl-3 pr-9 py-2 text-[var(--text-primary)] focus-amber"
                  >
                    {(portfolios ?? []).map((p) => (
                      <option key={p.portfolio_id} value={p.portfolio_id}>
                        {p.portfolio_name || p.portfolio_id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-ui-muted pointer-events-none" />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-ui-muted mb-1">
                  Total value
                </p>
                <p className="font-mono text-3xl md:text-[40px] leading-none text-[var(--text-primary)] tabular-nums">
                  {metrics ? fmtMoney.format(metrics.total_value) : FINANCIAL_EM_DASH}
                </p>
                <div className="mt-2 flex items-center justify-end gap-2 text-sm font-mono flex-wrap">
                  {dayChangePct != null ? (
                    <>
                      <TickerNumber
                        value={dayChangePct}
                        format="percent"
                        showArrow
                      />
                      <span className="text-ui-muted text-xs">
                        30d Δ
                      </span>
                    </>
                  ) : (
                    <span className="text-ui-muted">{FINANCIAL_EM_DASH}</span>
                  )}
                  <span className="text-ui-muted text-xs">
                    As of{" "}
                    {new Date().toLocaleTimeString("en-SG", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {[
                {
                  label: "DNA Score",
                  v: metrics?.dna_score ?? FINANCIAL_EM_DASH,
                },
                {
                  label: "Sharpe (est.)",
                  v:
                    sharpe != null ? sharpe.toFixed(2) : FINANCIAL_EM_DASH,
                },
                {
                  label: "Portfolio Beta",
                  v: metrics?.weighted_beta ?? FINANCIAL_EM_DASH,
                },
                {
                  label: "Max Drawdown",
                  v:
                    maxDd != null
                      ? `${maxDd.toFixed(1)}%`
                      : FINANCIAL_EM_DASH,
                },
              ].map((k) => (
                <div
                  key={k.label}
                  className="card-elevated rounded-2xl p-4 md:p-5"
                >
                  <p className="mb-2 text-xs text-slate-600">{k.label}</p>
                  <p className="font-mono text-2xl text-slate-900 tabular-nums md:text-[28px]">
                    {k.v}
                  </p>
                </div>
              ))}
            </div>

            <GlassCard className="p-4 md:p-5">
              <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                Portfolio value
              </h3>
              {loadChart ? (
                <div className="h-64 shimmer rounded-xl" />
              ) : history.length === 0 ? (
                <p className="text-sm text-readable py-section text-center">
                  No history for this range.
                </p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={history}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="amberFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="rgba(245,166,35,0.25)" />
                          <stop offset="100%" stopColor="rgba(245,166,35,0)" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.04)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="time"
                        tick={{
                          fontSize: 10,
                          fill: "#4A5568",
                          fontFamily: "var(--font-jetbrains)",
                        }}
                        tickFormatter={(v) => String(v).slice(5, 10)}
                      />
                      <YAxis
                        tick={{
                          fontSize: 10,
                          fill: "#4A5568",
                          fontFamily: "var(--font-jetbrains)",
                        }}
                        tickFormatter={(v) =>
                          `$${(Number(v) / 1000).toFixed(0)}k`
                        }
                        width={52}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--glass-bg)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: 12,
                          fontFamily: "var(--font-jetbrains)",
                          fontSize: 12,
                          color: "var(--text-primary)",
                        }}
                        formatter={(v: number) => [fmtMoney.format(v), "Value"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#F5A623"
                        strokeWidth={2}
                        fill="url(#amberFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-readable">
                      <th className="p-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("symbol")}
                          className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                        >
                          Ticker
                          <motion.span layout>
                            <ArrowUpDown className="w-3 h-3 opacity-60" />
                          </motion.span>
                        </button>
                      </th>
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("weight")}
                          className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                        >
                          Weight %
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </button>
                      </th>
                      <th className="p-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("price")}
                          className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                        >
                          Price
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </button>
                      </th>
                      <th className="p-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("value")}
                          className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                        >
                          Position value
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {(sortedPositions ?? []).map((p) => (
                        <motion.tr
                          key={p.symbol}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="border-b border-[var(--border)] hover:bg-[var(--surface-3)]/50 transition-colors"
                        >
                          <td className="p-3 font-mono font-semibold text-[var(--text-primary)]">
                            {p.symbol}
                          </td>
                          <td className="p-3 text-[var(--text-secondary)] text-xs">
                            {p.symbol}
                          </td>
                          <td className="p-3 font-mono text-[var(--text-secondary)]">
                            {(p.weight * 100).toFixed(1)}%
                          </td>
                          <td className="p-3 font-mono text-[var(--text-primary)]">
                            {formatNativePrice(
                              p.current_price,
                              p.native_currency ?? metrics?.base_currency ?? "USD",
                            )}
                          </td>
                          <td className="p-3 font-mono text-[var(--text-primary)]">
                            {formatNativeValue(
                              p.current_value,
                              p.native_currency ?? metrics?.base_currency ?? "USD",
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </>
        )}
      </main>

      {/* Right panel */}
      <aside className="hidden lg:block w-[300px] shrink-0 border-l border-[var(--border)] p-4 bg-[var(--surface-1)]/40">
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            AI Intelligence
          </h2>
        </div>
        <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1 mb-4">
          {loadNotes
            ? [1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl shimmer" />
              ))
            : (notes ?? []).map((n) => (
                <GlassCard
                  key={n.id}
                  className="p-3 border-l-2 border-l-primary"
                >
                  <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
                    {n.title}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1">
                    {n.executive_summary}
                  </p>
                  <p className="text-sm font-mono text-ui-muted mt-2">
                    {new Date(n.generated_at).toLocaleString("en-SG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </GlassCard>
              ))}
        </div>
        {!notes.length && !loadNotes && (
          <p className="text-xs text-ui-muted mb-4">
            No research notes yet.
          </p>
        )}
        <div className="space-y-2">
          <textarea
            value={aiQ}
            onChange={(e) => setAiQ(e.target.value)}
            placeholder="Ask AI about this portfolio…"
            rows={3}
            className="w-full rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)] px-3 py-2 text-xs font-sans text-[var(--text-primary)] placeholder:text-ui-muted focus-amber resize-none"
          />
          <button
            type="button"
            disabled={aiBusy || !metrics}
            onClick={onAskAi}
            className="w-full py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
          >
            {aiBusy ? "Thinking…" : "Ask AI"}
          </button>
          {aiReply && (
            <GlassCard className="p-3 mt-2">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {aiReply}
              </p>
            </GlassCard>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--border)] bg-[var(--surface-1)]/95 backdrop-blur-xl flex justify-around py-2 px-1 safe-area-pb">
        {NAV.slice(0, 5).map(({ href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 p-2 text-[var(--text-secondary)]"
          >
            <Icon className="w-5 h-5" aria-hidden />
            <span className="text-sm">{href.split("/").pop() || "home"}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
