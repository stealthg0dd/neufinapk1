// SEA-NATIVE-CURRENCY-FIX: renders a human-readable benchmark label (VN-Index, FTSE 100, etc.)
"use client";

import { BENCHMARK_LABELS } from "@/lib/finance-content";

interface BenchmarkLabelProps {
  benchmark?: string | null;
  /** If true, also show the raw ticker symbol in muted text */
  showTicker?: boolean;
  className?: string;
}

export function BenchmarkLabel({ benchmark, showTicker = false, className = "" }: BenchmarkLabelProps) {
  if (!benchmark) return null;
  const label = BENCHMARK_LABELS[benchmark] ?? benchmark;
  return (
    <span className={className}>
      {label}
      {showTicker && label !== benchmark && (
        <span className="ml-1 text-xs text-muted-foreground">({benchmark})</span>
      )}
    </span>
  );
}
