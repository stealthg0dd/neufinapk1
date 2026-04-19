/**
 * Canonical display helpers for portfolio / DNA financial rows.
 * Values may be in listing currency; optional `fx_indicative_sgd` comes from the API when FX display is enabled.
 */

import type { Position } from "@/lib/api";

/** Missing numeric price (per-share line) — use instead of ad-hoc dashes. */
export const FINANCIAL_EM_DASH = "—";

/** Missing or non-quotable position value — explicit, not a silent zero. */
export const FINANCIAL_QUOTE_UNAVAILABLE = "Quote unavailable";

export function formatNativePrice(
  amount: number | null | undefined,
  currency: string | undefined | null,
): string {
  if (amount == null || Number.isNaN(amount)) {
    return FINANCIAL_EM_DASH;
  }
  const c = (currency || "USD").toUpperCase();
  if (c === "VND") {
    return new Intl.NumberFormat("en-VN").format(Math.round(amount));
  }
  if (c === "GBP") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  if (c === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${c}`;
  }
}

export function formatNativeValue(
  amount: number | null | undefined,
  currency: string | undefined | null,
): string {
  if (amount == null || Number.isNaN(amount)) {
    return FINANCIAL_QUOTE_UNAVAILABLE;
  }
  const c = (currency || "USD").toUpperCase();
  if (c === "VND") {
    return `${new Intl.NumberFormat("en-VN").format(Math.round(amount))} VND`;
  }
  if (c === "GBP") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  if (c === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${c}`;
  }
}

/** Primary value line for a holding; use with optional `fx_indicative_sgd` for indicative FX. */
export function formatPositionValuePrimary(p: Pick<Position, "value" | "native_currency">): string {
  return formatNativeValue(p.value, p.native_currency);
}

export function shouldShowFxHint(p: Position): boolean {
  if (!p.fx_indicative_sgd) return false;
  const c = (p.native_currency || "USD").toUpperCase();
  return !["USD", "SGD"].includes(c);
}

// SEA-NATIVE-CURRENCY-FIX: market badge metadata ──────────────────────────────

export const MARKET_BADGE_META: Record<string, { label: string; color: string }> = {
  VN:   { label: "HOSE",  color: "bg-red-100 text-red-700" },
  LSE:  { label: "LSE",   color: "bg-blue-100 text-blue-700" },
  US:   { label: "NYSE",  color: "bg-green-100 text-green-700" },
  JK:   { label: "IDX",   color: "bg-orange-100 text-orange-700" },
  BK:   { label: "SET",   color: "bg-indigo-100 text-indigo-700" },
  KL:   { label: "KLSE",  color: "bg-violet-100 text-violet-700" },
  SG:   { label: "SGX",   color: "bg-teal-100 text-teal-700" },
  AX:   { label: "ASX",   color: "bg-yellow-100 text-yellow-700" },
  TSE:  { label: "TSE",   color: "bg-pink-100 text-pink-700" },
  HKEX: { label: "HKEX",  color: "bg-rose-100 text-rose-700" },
  NSE:  { label: "NSE",   color: "bg-amber-100 text-amber-700" },
  BSE:  { label: "BSE",   color: "bg-amber-100 text-amber-700" },
  SSE:  { label: "SSE",   color: "bg-cyan-100 text-cyan-700" },
  SZSE: { label: "SZSE",  color: "bg-cyan-100 text-cyan-700" },
};

export const BENCHMARK_LABELS: Record<string, string> = {
  "^VNINDEX": "VN-Index",
  "^VN30":    "VN30",
  "^FTSE":    "FTSE 100",
  "^JKSE":    "IDX Composite",
  "^SET.BK":  "SET Index",
  "^KLSE":    "FBM KLCI",
  "^STI":     "Straits Times Index",
  "^GSPC":    "S&P 500",
  "^N225":    "Nikkei 225",
  "^HSI":     "Hang Seng",
  "^NSEI":    "Nifty 50",
  "^AXJO":    "ASX 200",
};

/** Returns true when a position has no valid price data and should show a badge. */
export function isUnresolved(p: Pick<Position, "price" | "value" | "price_status">): boolean {
  if (p.price_status && ["unresolvable", "error"].includes(p.price_status.toLowerCase())) return true;
  return p.price == null && p.value == null;
}

/** Formats value with ISO code always appended, e.g. "28,500,000 VND", "£12,345 GBP". */
export function formatNativeValueWithISO(
  amount: number | null | undefined,
  currency: string | undefined | null,
): string {
  if (amount == null || Number.isNaN(amount)) return FINANCIAL_QUOTE_UNAVAILABLE;
  const c = (currency || "USD").toUpperCase();
  const formatted = formatNativeValue(amount, c);
  if (formatted === FINANCIAL_QUOTE_UNAVAILABLE) return formatted;
  if (formatted.includes(c)) return formatted;
  return `${formatted} ${c}`;
}

/** Headline portfolio total — matches dashboard DNA metrics copy for single- vs multi-currency. */
export function formatPortfolioTotalLine(args: {
  totalValue: number;
  multiCurrency: boolean;
  portfolioCurrencies?: string[] | null;
}): string {
  const { totalValue, multiCurrency, portfolioCurrencies } = args;
  if (Number.isNaN(totalValue)) {
    return FINANCIAL_QUOTE_UNAVAILABLE;
  }
  if (multiCurrency) {
    const cur = (portfolioCurrencies ?? []).filter(Boolean);
    const codes = cur.length ? cur.join(", ") : "…";
    return `Mixed CCY (${codes}) · raw sum ${Math.round(totalValue).toLocaleString("en-US")}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(totalValue);
}
