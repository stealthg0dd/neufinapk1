"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import Image from "next/image";

export type RegimeVariant = "risk-on" | "risk-off" | "neutral";

function parseRegimeData(raw: unknown): {
  display: string;
  variant: RegimeVariant;
} {
  if (raw == null || typeof raw !== "object") {
    return { display: "UNKNOWN", variant: "neutral" };
  }
  const o = raw as Record<string, unknown>;
  let slug = "unknown";
  if (o.current && typeof o.current === "object") {
    const c = o.current as Record<string, unknown>;
    slug = String(c.regime ?? "unknown");
  } else if (typeof o.regime === "string") {
    slug = o.regime;
  }
  const u = slug.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  let variant: RegimeVariant = "neutral";
  if (u.includes("risk_off") || u.includes("recession") || u === "riskoff")
    variant = "risk-off";
  else if (u.includes("risk_on") || u === "recovery" || u.includes("growth"))
    variant = "risk-on";
  else if (u.includes("stagflation") || u.includes("neutral"))
    variant = "neutral";

  const display = slug.replace(/_/g, "-").toUpperCase();
  return { display, variant };
}

function regimeBadgeClasses(variant: RegimeVariant): string {
  switch (variant) {
    case "risk-off":
      return "text-risk bg-risk/10";
    case "risk-on":
      return "text-positive bg-positive/10";
    default:
      return "text-warning bg-warning/10";
  }
}

export function CommandBar({
  regimeData,
  onToggleCopilot,
}: {
  regimeData: unknown;
  onToggleCopilot?: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [clock, setClock] = useState("");
  const [hasAlertSignal, setHasAlertSignal] = useState(false);

  const regime = useMemo(() => parseRegimeData(regimeData), [regimeData]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const d = now.toLocaleDateString("en-GB", {
        timeZone: "Asia/Singapore",
        day: "2-digit",
        month: "short",
      });
      const t = now.toLocaleTimeString("en-GB", {
        timeZone: "Asia/Singapore",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      setClock(`${d} · ${t} SGT`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/research/signals");
        if (!res.ok) return;
        const data = (await res.json()) as { signals?: unknown[] };
        const n = Array.isArray(data.signals) ? data.signals.length : 0;
        if (!cancelled) setHasAlertSignal(n > 0);
      } catch {
        if (!cancelled) setHasAlertSignal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSearchClick = useCallback(() => setPaletteOpen(true), []);

  return (
    <>
      <header className="grid h-11 w-full shrink-0 grid-cols-1 items-center gap-2 border-b border-border bg-white px-4 sm:grid-cols-[1fr_minmax(0,28rem)_1fr] sm:gap-0">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/logo.png"
            alt="NeuFin"
            width={140}
            height={40}
            className="hidden h-9 w-auto sm:block"
          />
          <span
            className="hidden h-4 w-px shrink-0 bg-border sm:block"
            aria-hidden
          />
          <span
            className={`truncate rounded px-2 py-0.5 font-mono text-sm font-medium tracking-wide ${regimeBadgeClasses(regime.variant)}`}
          >
            REGIME: {regime.display}
          </span>
        </div>

        <div className="order-last flex justify-center px-0 sm:order-none sm:px-3">
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Search portfolios and research"
            className="w-full rounded-md border border-border bg-surface-2/90 px-3 py-1.5 text-left text-sm text-muted2 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            Search portfolios, assets, research… ⌘K
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <span className="hidden font-mono text-sm text-muted2 lg:inline">
            {clock}
          </span>
          <button
            type="button"
            className="relative rounded p-1 text-muted2 transition-colors hover:text-navy"
            aria-label="Notifications"
          >
            <Bell className="h-[14px] w-[14px]" />
            {hasAlertSignal ? (
              <span className="absolute -right-0.5 -top-0.5 h-1 w-1 rounded-full bg-danger2" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => onToggleCopilot?.()}
            className="rounded-md border border-primary/25 bg-primary-light px-2.5 py-1 text-sm font-medium text-primary-dark transition-colors hover:border-primary/40"
          >
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Copilot
            </span>
          </button>
        </div>
      </header>

      {paletteOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-section-hero">
          <button
            type="button"
            className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
            aria-label="Close command palette"
            onClick={() => setPaletteOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="text-sm text-muted2">⌘K</span>
              <input
                autoFocus
                placeholder="Search portfolios, assets, research..."
                aria-label="Search portfolios and research"
                className="flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-muted2/70"
              />
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted2">
                ESC
              </kbd>
            </div>
            <p className="px-4 py-3 text-sm text-muted2">
              Command palette: navigation and search integrations ship in the
              next release.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
