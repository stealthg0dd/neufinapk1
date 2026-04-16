"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { useDashboardPowerMode } from "@/hooks/useDashboardPowerMode";
import { GraphicPlaceholder } from "@/components/GraphicPlaceholder";
import type { RegimeData } from "@/hooks/usePortfolioData";
import { SwarmBriefingPreview } from "@/components/dashboard/SwarmBriefingPreview";
import DashboardModeControls from "@/components/dashboard/DashboardModeControls";
import ResearchFeedClient from "@/components/dashboard/ResearchFeedClient";

export const dynamic = "force-dynamic";

function formatRegimeLabel(regime: RegimeData | null): string {
  const raw = regime?.regime ?? regime?.label;
  if (!raw || raw === "unknown") return "Macro regime pending";
  return String(raw)
    .replace(/_/g, " ")
    .replace(/-/g, "-")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function regimePillClass(regime: RegimeData | null): string {
  const u = (regime?.regime ?? regime?.label ?? "").toLowerCase();
  if (u.includes("inflation")) {
    return "inline-block rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-800";
  }
  if (u.includes("stagflation")) {
    return "inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900";
  }
  if (
    u.includes("risk_off") ||
    u.includes("risk-off") ||
    u.includes("recession") ||
    u.includes("crisis")
  ) {
    return "inline-block rounded-md border border-primary/25 bg-primary-light px-2 py-0.5 text-sm font-semibold text-primary-dark";
  }
  if (
    u.includes("risk_on") ||
    u.includes("risk-on") ||
    u.includes("recovery") ||
    u.includes("growth")
  ) {
    return "inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-semibold text-emerald-900";
  }
  return "inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900";
}

function fmtMetric(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toFixed(digits);
}

export default function DashboardPage() {
  const {
    advancedQuantMode,
    setAdvancedQuantMode,
    dashboardMode,
    setDashboardMode,
  } = useDashboardPowerMode();
  const {
    portfolios,
    latestPortfolio,
    hasPortfolio,
    latestDna,
    swarmReport,
    regime,
    loading,
  } = usePortfolioData();

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-2.5 text-sm text-[#64748B]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your portfolio intelligence…
      </div>
    );
  }

  const lastAnalyzed =
    latestPortfolio?.analyzed_at ??
    latestPortfolio?.updated_at ??
    latestPortfolio?.created_at ??
    null;

  const portfolioTitle =
    latestPortfolio?.portfolio_name ??
    latestPortfolio?.name ??
    (hasPortfolio ? "Primary portfolio" : "No portfolio uploaded");

  const dnaScore = latestDna?.dna_score ?? latestPortfolio?.dna_score ?? null;

  const positionsCount =
    (latestPortfolio as { positions_count?: number } | null)?.positions_count ??
    latestDna?.tax_analysis?.positions?.length ??
    null;

  const modeWidgets =
    dashboardMode === "cio"
      ? [
          {
            label: "Strategic Risk Budget",
            value:
              latestDna?.weighted_beta != null
                ? `${latestDna.weighted_beta.toFixed(2)} β vs SPY 1.00`
                : "Awaiting beta",
            tone: "text-[#0F172A]",
            sub: "Weighted portfolio beta",
          },
          {
            label: "Regime Priority",
            value: formatRegimeLabel(regime),
            tone: "text-[#0B5561]",
            sub:
              (regime as { confidence?: number } | null)?.confidence != null
                ? `${Math.round(((regime as { confidence?: number }).confidence ?? 0) * 100)}% confidence`
                : "Portfolio-derived classification",
          },
          {
            label: "Capital at Review",
            value: positionsCount != null ? `${positionsCount} positions` : "—",
            tone: "text-[#0F172A]",
            sub:
              latestPortfolio?.total_value != null
                ? `$${Number(latestPortfolio.total_value).toLocaleString()} AUM`
                : "Upload portfolio for AUM",
          },
        ]
      : dashboardMode === "trader"
        ? [
            {
              label: "Signal Priority",
              value: swarmReport?.headline ?? "Awaiting quant signal",
              tone: "text-[#0F172A]",
              sub: "Latest Swarm IC headline",
            },
            {
              label: "Execution Focus",
              value:
                latestDna?.weighted_beta != null
                  ? `Beta ${latestDna.weighted_beta.toFixed(2)} — intraday risk`
                  : "Run analysis for beta",
              tone: "text-[#7C2D12]",
              sub: "Monitor correlation shocks",
            },
            {
              label: "Quant Console",
              value: "Open Quant Dashboard →",
              tone: "text-[#0B5561]",
              sub: "Live paths, factor decomp, VaR",
            },
          ]
        : [
            {
              label: "Client Narrative",
              value:
                latestDna?.recommendation ??
                "Portfolio recommendation pending",
              tone: "text-[#0F172A]",
              sub: "From Behavioral DNA analysis",
            },
            {
              label: "Harvest Opportunity",
              value:
                (latestDna as { tax_analysis?: { total_harvest_opp?: number } } | null)
                  ?.tax_analysis?.total_harvest_opp != null
                  ? `$${Number(
                      (latestDna as { tax_analysis?: { total_harvest_opp?: number } })
                        .tax_analysis!.total_harvest_opp!,
                    ).toLocaleString()} harvestable`
                  : "Upload cost basis",
              tone: "text-[#0B5561]",
              sub: "Tax-loss harvesting estimate",
            },
            {
              label: "Memo Readiness",
              value: swarmReport ? "Swarm insights available" : "Run swarm for memo",
              tone: swarmReport ? "text-emerald-700" : "text-[#7C2D12]",
              sub: "IC report generation ready",
            },
          ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="section-header">
        <div>
          <h1>Dashboard</h1>
          <p>Portfolio intelligence, DNA score, and research in one place.</p>
        </div>
      </div>

      <DashboardModeControls
        advancedQuantMode={advancedQuantMode}
        dashboardMode={dashboardMode}
        onToggleAdvanced={setAdvancedQuantMode}
        onModeChange={setDashboardMode}
      />

      {advancedQuantMode && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {modeWidgets.map((w) => (
            <div
              key={w.label}
              className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-xs uppercase tracking-wider text-[#64748B]">
                {w.label}
              </p>
              <p className={`mt-1 text-sm font-semibold ${w.tone}`}>{w.value}</p>
              {w.sub && (
                <p className="mt-0.5 text-xs text-[#94A3B8]">{w.sub}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {!hasPortfolio && (
        <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
          <div className="grid min-h-[280px] grid-cols-1 gap-0 lg:grid-cols-2">
            <div className="flex flex-col justify-center p-8">
              <div className="badge badge-info mb-4">Get Started</div>
              <h2 className="mb-3 text-[22px] font-bold tracking-tight text-[#0F172A]">
                Analyze your first portfolio
              </h2>
              <p className="mb-6 text-[15px] leading-relaxed text-[#475569]">
                Upload a CSV with your holdings. Seven AI agents will deliver a
                complete Investment Committee briefing in under 60 seconds.
              </p>
              <Link
                href="/dashboard/portfolio"
                className="btn-primary self-start"
              >
                Upload Portfolio
              </Link>
            </div>
            <div className="relative hidden min-h-[280px] overflow-hidden bg-gradient-to-br from-[#E0F7FA] to-[#F0FDF4] lg:block">
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              >
                <GraphicPlaceholder
                  src="/graphics/ic-report-preview.png"
                  alt="IC Report Preview"
                  fill
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="opacity-90"
                  label="IC Report — Add ic-report-preview.png to public/graphics/"
                />
              </motion.div>
            </div>
          </div>
        </div>
      )}

      {/* Hero summary */}
      <section className="card-elevated grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <p className="text-label">Portfolio intelligence</p>
          <h2 className="text-section-title mt-2">{portfolioTitle}</h2>
          {lastAnalyzed && (
            <p className="mt-1 text-sm text-slate-500">
              Last analysed{" "}
              {new Date(lastAnalyzed).toLocaleDateString("en-SG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-end gap-4">
            {dnaScore != null && hasPortfolio ? (
              <div>
                <div className="text-metric tabular-nums">{dnaScore}</div>
                <div className="text-muted-marketing mt-1">
                  Portfolio health score
                </div>
              </div>
            ) : (
              <div>
                <div className="text-metric text-slate-300">—</div>
                <div className="text-muted-marketing mt-1">
                  Portfolio health score
                </div>
              </div>
            )}
            <div className="pb-1">
              <span className={regimePillClass(regime)}>
                {formatRegimeLabel(regime)}
              </span>
            </div>
          </div>
          {!hasPortfolio && (
            <p className="mt-4 text-sm text-slate-600">
              Welcome to NeuFin.{" "}
              <Link
                href="/dashboard/portfolio"
                className="font-medium text-primary-dark hover:underline"
              >
                Upload a portfolio
              </Link>{" "}
              to see your DNA score and regime context.
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-6 border-t border-[#E5E7EB] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div>
              <p className="text-label">Beta</p>
              <p className="mt-1 text-sm font-semibold text-[#0F172A] tabular-nums">
                {fmtMetric(latestDna?.weighted_beta ?? null, 2)}
              </p>
            </div>
            <div>
              <p className="text-label">Sharpe</p>
              <p className="mt-1 text-sm font-semibold text-[#0F172A] tabular-nums">
                —
              </p>
            </div>
            <div>
              <p className="text-label">Positions</p>
              <p className="mt-1 text-sm font-semibold text-[#0F172A] tabular-nums">
                {positionsCount != null ? positionsCount : "—"}
              </p>
            </div>
          </div>
          <div>
            <Link
              href={hasPortfolio ? "/swarm" : "/dashboard/portfolio"}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Generate IC report
            </Link>
          </div>
        </div>
      </section>

      {/* Secondary insight cards */}
      {hasPortfolio && latestDna && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(latestDna.strengths ?? []).length > 0 && (
            <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary-dark">
                Top strengths
              </p>
              {latestDna.strengths.slice(0, 2).map((s, i) => (
                <div
                  key={i}
                  className="mb-2 border-l-2 border-[#16A34A] pl-2.5 last:mb-0"
                >
                  <p className="text-xs text-slate-800">{s.split(".")[0]}.</p>
                </div>
              ))}
            </div>
          )}

          {latestDna.recommendation && (
            <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary-dark">
                Recommended action
              </p>
              <div className="border-l-2 border-amber-400 pl-2.5">
                <p className="text-xs text-slate-800">
                  {latestDna.recommendation}
                </p>
              </div>
            </div>
          )}

          {(latestDna.weaknesses ?? []).length > 0 && (
            <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary-dark">
                Key risks
              </p>
              {latestDna.weaknesses.slice(0, 2).map((w, i) => (
                <div
                  key={i}
                  className="mb-2 border-l-2 border-[#DC2626] pl-2.5 last:mb-0"
                >
                  <p className="text-xs text-slate-800">{w.split(".")[0]}.</p>
                </div>
              ))}
            </div>
          )}

          {latestDna.tax_analysis &&
            ((latestDna.tax_analysis.total_liability ?? 0) > 0 ||
              (latestDna.tax_analysis.total_harvest_opp ?? 0) > 0) && (
              <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm md:col-span-2 xl:col-span-1">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary-dark">
                  Tax snapshot
                </p>
                {(latestDna.tax_analysis?.total_liability ?? 0) > 0 && (
                  <div className="mb-2 border-l-2 border-amber-400 pl-2.5">
                    <p className="text-xs text-slate-500">CGT exposure</p>
                    <p className="text-sm font-semibold text-slate-900">
                      $
                      {latestDna.tax_analysis!.total_liability!.toLocaleString()}
                    </p>
                  </div>
                )}
                {(latestDna.tax_analysis?.total_harvest_opp ?? 0) > 0 && (
                  <div className="border-l-2 border-[#16A34A] pl-2.5">
                    <p className="text-xs text-slate-500">
                      Harvest opportunity
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      $
                      {latestDna.tax_analysis!.total_harvest_opp!.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
        </section>
      )}

      {swarmReport && <SwarmBriefingPreview swarmReport={swarmReport} />}

      {hasPortfolio && !swarmReport && (
        <section className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-dark">
            Swarm IC analysis
          </p>
          <p className="mb-3 text-xs text-slate-600">
            Run the 7-agent swarm on your portfolio for regime-adjusted signals,
            tax context, and an IC-grade memo.
          </p>
          <Link
            href="/dashboard/swarm"
            className="inline-block rounded-lg border border-primary/30 bg-primary-light px-3 py-2 text-xs font-semibold text-primary-dark hover:bg-primary/15"
          >
            Run Swarm IC →
          </Link>
        </section>
      )}

      <section className="min-w-0">
        <ResearchFeedClient limit={5} />
      </section>

      <section className="flex flex-col flex-wrap justify-between gap-4 rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-900">
            You&apos;re on NeuFin beta — your feedback shapes what we build.
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            Takes about five minutes · Read by the founding team
          </p>
        </div>
        <Link href="/feedback" target="_blank" className="shrink-0">
          <button
            type="button"
            className="rounded-lg border border-primary/30 bg-primary-light px-4 py-2 text-xs font-semibold text-primary-dark hover:bg-primary/15"
          >
            Share feedback →
          </button>
        </Link>
      </section>
    </div>
  );
}
