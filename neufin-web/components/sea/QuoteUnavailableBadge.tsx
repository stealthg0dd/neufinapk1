// SEA-NATIVE-CURRENCY-FIX: elegant badge for unresolved / unquotable positions
"use client";

import { AlertCircle } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

interface QuoteUnavailableBadgeProps {
  symbol?: string;
  reason?: string;
}

export function QuoteUnavailableBadge({ symbol, reason }: QuoteUnavailableBadgeProps) {
  const tip =
    reason ||
    (symbol
      ? `No live quote available for ${symbol}. This position is excluded from portfolio totals.`
      : "No live quote available. This position is excluded from portfolio totals.");

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 cursor-default select-none">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Quote unavailable
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            className="z-50 max-w-xs rounded bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          >
            {tip}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
