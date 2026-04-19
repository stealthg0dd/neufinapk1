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
