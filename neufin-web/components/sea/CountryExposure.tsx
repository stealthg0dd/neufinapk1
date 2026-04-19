// SEA-NATIVE-CURRENCY-FIX: standalone country/region exposure panel for results page
"use client";

import type { DNAAnalysisResponse } from "@/lib/api";

const REGION_COLOR: Record<string, string> = {
  "Southeast Asia":  "bg-teal-500",
  "Americas":        "bg-blue-500",
  "Europe":          "bg-indigo-500",
  "Asia Pacific":    "bg-violet-500",
  "Other":           "bg-slate-400",
};

interface CountryExposureProps {
  result: DNAAnalysisResponse;
  className?: string;
}

export function CountryExposure({ result, className = "" }: CountryExposureProps) {
  const countryExp = result.country_exposure ?? [];
  const regionExp = result.region_exposure ?? [];
  if (countryExp.length === 0) return null;

  return (
    <div className={`rounded-xl border border-border bg-white p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Geographic Exposure
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Country breakdown */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            By Country
          </p>
          <div className="space-y-1.5">
            {countryExp.slice(0, 6).map((c) => (
              <div key={c.country} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-navy truncate">{c.country}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-1.5">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-navy">
                  {c.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Region breakdown */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            By Region
          </p>
          <div className="space-y-1.5">
            {regionExp.map((r) => (
              <div key={r.region} className="flex items-center gap-2">
                <div className="flex w-28 shrink-0 items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${REGION_COLOR[r.region] ?? "bg-slate-400"}`}
                  />
                  <span className="text-xs text-navy truncate">{r.region}</span>
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-1.5">
                  <div
                    className={`h-full rounded-full ${REGION_COLOR[r.region] ?? "bg-slate-400"}`}
                    style={{ width: `${Math.min(r.pct, 100)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-navy">
                  {r.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
