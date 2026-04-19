"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { usePortfolioIntelligence } from "@/components/dashboard/PortfolioIntelligenceContext";
import { computeNextPrimaryAction } from "@/lib/next-primary-action-engine";
import { JOURNEY_EVENTS } from "@/lib/journey-analytics";
import type { JourneySurface } from "@/lib/journey-analytics";
import { useNeufinAnalytics } from "@/lib/analytics";

type SubStatus = {
  plan?: string;
  subscription_tier?: string;
  status?: string;
  trial_days_remaining?: number;
  days_remaining?: number;
};

export function NextPrimaryAction({
  surface = "dashboard",
}: {
  /** Where this card is mounted — used for analytics only */
  surface?: JourneySurface;
}) {
  const { hasPortfolio, swarmReport } = usePortfolioIntelligence();
  const [sub, setSub] = useState<SubStatus | null>(null);
  const { capture } = useNeufinAnalytics();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiGet<SubStatus>("/api/subscription/status");
        if (!cancelled) setSub(res ?? {});
      } catch {
        if (!cancelled) setSub({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const payload = useMemo(
    () =>
      computeNextPrimaryAction({
        hasPortfolio,
        swarmReport,
        subscription: sub,
      }),
    [hasPortfolio, swarmReport, sub],
  );

  useEffect(() => {
    capture(JOURNEY_EVENTS.stepViewed, {
      surface,
      step: payload.key,
      path:
        typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [capture, surface, payload.key]);

  const btnClass =
    payload.variant === "primary"
      ? "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark"
      : "inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:border-primary/40 hover:bg-primary-light/30";

  return (
    <aside
      className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary-light/40 via-white to-surface-2 p-5 shadow-sm"
      aria-labelledby="next-primary-action-title"
    >
      <div className="absolute right-3 top-3 opacity-[0.12]" aria-hidden>
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <p
        id="next-primary-action-title"
        className="text-sm font-bold text-navy md:text-base"
      >
        {payload.title}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-readable">
        {payload.body}
      </p>
      {payload.relatedInsight && (
        <p className="mt-3 border-l-2 border-primary/30 pl-3 text-xs leading-relaxed text-readable">
          <span className="font-semibold text-navy">Next best action context: </span>
          {payload.relatedInsight}
        </p>
      )}
      <div className="mt-4">
        <Link
          href={payload.href}
          className={btnClass}
          onClick={() =>
            capture(JOURNEY_EVENTS.nextActionClicked, {
              surface,
              action_key: payload.key,
              destination: payload.href,
            })
          }
        >
          {payload.cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
