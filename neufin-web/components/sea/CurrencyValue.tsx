// SEA-NATIVE-CURRENCY-FIX: renders a native currency value with optional FX conversion hint
"use client";

import { formatNativeValue, isUnresolved } from "@/lib/finance-content";
import type { Position } from "@/lib/api";
import { QuoteUnavailableBadge } from "./QuoteUnavailableBadge";

interface CurrencyValueProps {
  position: Pick<Position, "value" | "native_currency" | "price" | "price_status" | "symbol" | "fx_indicative_sgd">;
  showFxHint?: boolean;
  className?: string;
}

export function CurrencyValue({ position, showFxHint = false, className = "" }: CurrencyValueProps) {
  if (isUnresolved(position)) {
    return <QuoteUnavailableBadge symbol={position.symbol} />;
  }

  const primary = formatNativeValue(position.value, position.native_currency);

  return (
    <span className={`tabular-nums ${className}`}>
      {primary}
      {showFxHint && position.fx_indicative_sgd && (
        <span className="ml-1 text-xs text-muted-foreground">{position.fx_indicative_sgd}</span>
      )}
    </span>
  );
}
