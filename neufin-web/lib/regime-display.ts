import type { RegimeData } from "@/hooks/usePortfolioData";

/** Human-readable macro regime for UI (dashboard ribbon, breadcrumbs). */
export function formatRegimeLabel(regime: RegimeData | null): string {
  const raw = regime?.regime ?? regime?.label;
  if (!raw || raw === "unknown") return "Macro regime pending";
  return String(raw)
    .replace(/_/g, " ")
    .replace(/-/g, "-")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Tailwind class string for regime pill (hero, cards). */
export function regimePillClass(regime: RegimeData | null): string {
  const u = (regime?.regime ?? regime?.label ?? "").toLowerCase();
  if (u.includes("inflation")) {
    return "inline-block rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-800";
  }
  if (u.includes("stagflation")) {
    return "inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900";
  }
  if (
    u.includes("risk_off") ||
    u.includes("risk-off") ||
    u.includes("recession") ||
    u.includes("crisis")
  ) {
    return "inline-block rounded-md border border-primary/25 bg-primary-light px-2 py-0.5 text-sm font-semibold text-primary-dark";
  }
  if (
    u.includes("risk_on") ||
    u.includes("risk-on") ||
    u.includes("recovery") ||
    u.includes("growth")
  ) {
    return "inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-semibold text-emerald-900";
  }
  return "inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900";
}
