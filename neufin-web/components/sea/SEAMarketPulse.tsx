// SEA-NATIVE-CURRENCY-FIX: Regional market pulse widget — VNIndex, JCI, SET, KLCI, STI
"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import type { SEAIndexPulse, SEAPulseResponse } from "@/lib/api";
import { getSEAPulse } from "@/lib/api";

type Period = "1d" | "1w" | "1m";

function changePct(index: SEAIndexPulse, period: Period): number | null {
  if (period === "1d") return index.change_1d;
  if (period === "1w") return index.change_1w;
  return index.change_1m;
}

function ChangeChip({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pos = value >= 0;
  const Icon = value > 0.1 ? TrendingUp : value < -0.1 ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        pos ? "text-emerald-600" : "text-red-500"
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {pos ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function RegimePill({ regime, cls }: { regime: string; cls: string }) {
  const color =
    cls === "bullish"
      ? "bg-emerald-50 text-emerald-700"
      : cls === "bearish"
        ? "bg-red-50 text-red-600"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${color}`}>
      {regime}
    </span>
  );
}

function VolatilityDot({ vol }: { vol: string }) {
  const color =
    vol === "Low" ? "bg-emerald-400" : vol === "High" ? "bg-red-400" : "bg-amber-400";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {vol} vol
    </span>
  );
}

interface SEAMarketPulseProps {
  className?: string;
}

export function SEAMarketPulse({ className = "" }: SEAMarketPulseProps) {
  const [data, setData] = useState<SEAPulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>("1d");

  useEffect(() => {
    getSEAPulse()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={`rounded-xl border border-border bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-navy">🌏 SEA Market Pulse</h3>
          <p className="text-xs text-muted-foreground">Live Southeast Asia index snapshot</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
          {(["1d", "1w", "1m"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2 py-1 font-medium transition-colors ${
                period === p ? "bg-white text-navy shadow-sm" : "text-muted-foreground hover:text-navy"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Fetching live data…
        </div>
      )}

      {error && !loading && (
        <p className="py-4 text-xs text-muted-foreground">Market data unavailable. Check back shortly.</p>
      )}

      {data && !loading && (
        <div className="space-y-2">
          {data.indices.map((idx) => (
            <div
              key={idx.symbol}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base leading-none">{idx.flag}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-navy truncate">{idx.label}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <RegimePill regime={idx.regime} cls={idx.regime_class} />
                    <VolatilityDot vol={idx.volatility} />
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums text-navy">
                  {idx.price != null
                    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(idx.price)
                    : "—"}
                </p>
                <ChangeChip value={changePct(idx, period)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground">
        Prices via Yahoo Finance · refreshed every 5 min
      </p>
    </div>
  );
}
