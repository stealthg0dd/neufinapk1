// SEA-NATIVE-CURRENCY-FIX: regional context card for SEA portfolios (shown when sea_pct > 10)
"use client";

import type { DNAAnalysisResponse } from "@/lib/api";
import { BENCHMARK_LABELS } from "@/lib/finance-content";

const SEA_INSIGHTS: Record<string, { regime: string; risk: string }> = {
  Vietnam: {
    regime: "Export-driven growth with domestic consumption recovery.",
    risk: "FX risk (VND/USD), regulatory changes, and liquidity constraints on HOSE.",
  },
  Indonesia: {
    regime: "Commodity-backed growth; sensitive to global commodity cycles.",
    risk: "IDR/USD volatility, commodity price swings, political regulatory risk.",
  },
  Thailand: {
    regime: "Tourism-recovery driven growth with manufacturing base.",
    risk: "THB/USD sensitivity, tourism dependency, political uncertainty.",
  },
  Malaysia: {
    regime: "Export and technology-led economy with strong REITs market.",
    risk: "MYR/USD pressure, palm oil commodity exposure, political cycle risk.",
  },
  Singapore: {
    regime: "Financial hub with defensive dividend plays; rate-sensitive REITs.",
    risk: "Limited domestic growth; externally driven via trade and finance.",
  },
};

interface RegionalContextProps {
  result: DNAAnalysisResponse;
  className?: string;
}

export function RegionalContext({ result, className = "" }: RegionalContextProps) {
  const seaPct = result.sea_pct ?? 0;
  if (seaPct < 10) return null;

  const countryExp = result.country_exposure ?? [];
  const benchmark = result.portfolio_benchmark;
  const benchmarkLabel = result.portfolio_benchmark_label ?? (benchmark ? (BENCHMARK_LABELS[benchmark] ?? benchmark) : null);

  // Dominant SEA country
  const SEA_COUNTRIES = new Set(["Vietnam", "Indonesia", "Thailand", "Malaysia", "Singapore"]);
  const dominantSEA = countryExp.find((c) => SEA_COUNTRIES.has(c.country));
  const insight = dominantSEA ? SEA_INSIGHTS[dominantSEA.country] : null;

  return (
    <div className={`rounded-xl border border-teal-200 bg-teal-50/60 p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-teal-900">🌏 Regional Context</h3>
        <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
          {seaPct.toFixed(0)}% SEA
        </span>
      </div>

      {insight && dominantSEA && (
        <div className="mb-3 space-y-1">
          <p className="text-xs font-medium text-teal-800">
            {dominantSEA.country} market regime:
          </p>
          <p className="text-xs text-teal-700">{insight.regime}</p>
          <p className="mt-1 text-[11px] text-teal-600">
            <span className="font-medium">Key risks: </span>
            {insight.risk}
          </p>
        </div>
      )}

      {benchmarkLabel && benchmark !== "^GSPC" && (
        <div className="mb-3 rounded-lg bg-white/70 px-3 py-2">
          <p className="text-[11px] text-teal-700">
            <span className="font-medium">Reference benchmark: </span>
            {benchmarkLabel} ({benchmark})
            {" — "}not S&P 500.
          </p>
        </div>
      )}

      {/* Country exposure bar */}
      {countryExp.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-teal-600">
            Country allocation
          </p>
          {countryExp.slice(0, 5).map((c) => (
            <div key={c.country} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-teal-800 truncate">{c.country}</span>
              <div className="flex-1 overflow-hidden rounded-full bg-teal-100 h-1.5">
                <div
                  className="h-full rounded-full bg-teal-500"
                  style={{ width: `${Math.min(c.pct, 100)}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-teal-700">
                {c.pct.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Regional risk flags */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {seaPct > 50 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            ⚠ Heavy SEA concentration
          </span>
        )}
        {dominantSEA && dominantSEA.pct > 40 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            ⚠ Single-country overexposure
          </span>
        )}
        {seaPct > 0 && seaPct < 30 && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            ✓ Balanced SEA allocation
          </span>
        )}
      </div>
    </div>
  );
}
