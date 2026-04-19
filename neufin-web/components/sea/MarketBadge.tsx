// SEA-NATIVE-CURRENCY-FIX: market exchange badge for holdings table
"use client";

import { MARKET_BADGE_META } from "@/lib/finance-content";

interface MarketBadgeProps {
  marketCode?: string | null;
  className?: string;
}

export function MarketBadge({ marketCode, className = "" }: MarketBadgeProps) {
  if (!marketCode) return null;
  const meta = MARKET_BADGE_META[marketCode.toUpperCase()];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${meta.color} ${className}`}
    >
      {meta.label}
    </span>
  );
}
