"use client";

import { Loader2 } from "lucide-react";
import { formatRegimeLabel } from "@/lib/regime-display";
import { usePortfolioIntelligence } from "@/components/dashboard/PortfolioIntelligenceContext";

function ribbonRegimeChipClass(regime: Parameters<typeof formatRegimeLabel>[0]): string {
  const u = (regime?.regime ?? regime?.label ?? "").toLowerCase();
  if (u.includes("inflation")) return "border-red-200 bg-red-50 text-red-800";
  if (u.includes("stagflation")) return "border-amber-200 bg-amber-50 text-amber-900";
  if (
    u.includes("risk_off") ||
    u.includes("risk-off") ||
    u.includes("recession") ||
    u.includes("crisis")
  ) {
    return "border-primary/25 bg-primary-light text-primary-dark";
  }
  if (
    u.includes("risk_on") ||
    u.includes("risk-on") ||
    u.includes("recovery") ||
    u.includes("growth")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export function DashboardContextRibbon() {
  const { latestPortfolio, hasPortfolio, regime, loading } =
    usePortfolioIntelligence();

  const portfolioTitle =
    latestPortfolio?.portfolio_name ??
    latestPortfolio?.name ??
    (hasPortfolio ? "Primary portfolio" : "No portfolio uploaded");

  const lastAnalyzed =
    latestPortfolio?.analyzed_at ??
    latestPortfolio?.updated_at ??
    latestPortfolio?.created_at ??
    null;

  if (loading) {
    return (
      <div
        className="mb-4 flex min-h-[40px] items-center gap-2 rounded-lg border border-border bg-surface-2/80 px-3 py-2 text-sm text-readable"
        aria-busy="true"
      >
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading portfolio context…
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-readable">
          Active portfolio
        </p>
        <p className="truncate text-sm font-semibold text-navy">{portfolioTitle}</p>
        {lastAnalyzed ? (
          <p className="text-xs text-readable">
            Last analysed{" "}
            {new Date(lastAnalyzed).toLocaleDateString("en-SG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        ) : (
          <p className="text-xs text-readable">No analysis run yet</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-readable">
          Regime
        </span>
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${ribbonRegimeChipClass(regime)}`}
        >
          {formatRegimeLabel(regime)}
        </span>
      </div>
    </div>
  );
}
