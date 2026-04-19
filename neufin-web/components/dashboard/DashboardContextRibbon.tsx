"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatRegimeLabel } from "@/lib/regime-display";
import { usePortfolioIntelligence } from "@/components/dashboard/PortfolioIntelligenceContext";
import { apiGet } from "@/lib/api-client";

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

type SubLite = {
  plan?: string;
  subscription_tier?: string;
  trial_days_remaining?: number;
  days_remaining?: number;
};

function formatPlanLine(s: SubLite | null): string | null {
  if (!s) return null;
  const plan = (s.plan ?? s.subscription_tier ?? "free").toString().toLowerCase();
  const isPaid = plan === "advisor" || plan === "enterprise";
  const days = s.trial_days_remaining ?? s.days_remaining ?? null;
  if (isPaid) return "Advisor · active";
  if (days !== null && days > 0) return `Trial · ${days} day${days === 1 ? "" : "s"} left`;
  if (days !== null && days <= 0) return "Trial ended · upgrade to continue";
  return `${plan} plan`;
}

export function DashboardContextRibbon() {
  const { latestPortfolio, hasPortfolio, regime, latestDna, loading } =
    usePortfolioIntelligence();
  const [planLine, setPlanLine] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const res = await apiGet<SubLite>("/api/subscription/status");
        if (!c) setPlanLine(formatPlanLine(res ?? null));
      } catch {
        if (!c) setPlanLine(null);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const portfolioTitle =
    latestPortfolio?.portfolio_name ??
    latestPortfolio?.name ??
    (hasPortfolio ? "Primary portfolio" : "No portfolio uploaded");

  const lastAnalyzed =
    latestPortfolio?.analyzed_at ??
    latestPortfolio?.updated_at ??
    latestPortfolio?.created_at ??
    null;

  const beta = latestDna?.weighted_beta;

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
    <div className="mb-4 rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-readable">
            Active portfolio
          </p>
          <p className="truncate text-sm font-semibold text-navy">{portfolioTitle}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-readable">
            {lastAnalyzed ? (
              <span>
                Last analysed{" "}
                {new Date(lastAnalyzed).toLocaleDateString("en-SG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            ) : (
              <span>No analysis run yet</span>
            )}
            {beta != null && (
              <span className="tabular-nums text-navy">
                β {beta.toFixed(2)} vs broad equity benchmark
              </span>
            )}
            {!hasPortfolio && (
              <span className="text-readable">Benchmark defaults apply once DNA runs.</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {planLine && (
            <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-navy">
              {planLine}
            </span>
          )}
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
    </div>
  );
}
