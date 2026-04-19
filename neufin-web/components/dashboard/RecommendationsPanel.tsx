"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { JourneyRecommendation } from "@/lib/journey-recommendations";

const IMPACT_STYLES = {
  high: "border-primary/40 bg-primary-light/40 text-primary-dark",
  medium: "border-amber-200 bg-amber-50 text-amber-950",
  low: "border-border bg-surface-2 text-readable",
} as const;

export function RecommendationsPanel({
  items,
}: {
  items: JourneyRecommendation[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-readable">
        Recommendations will appear once your portfolio and subscription state load.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {items.map((r, i) => (
        <li
          key={r.id}
          className="rounded-xl border border-border bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className="text-label text-readable">#{i + 1}</span>
              <h3 className="mt-1 text-base font-bold text-navy">{r.title}</h3>
            </div>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${IMPACT_STYLES[r.impact]}`}
            >
              {r.impact} impact
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-readable">{r.rationale}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-readable">
            <span>Confidence · {r.confidence}%</span>
            <span>Horizon · {r.timeHorizon}</span>
          </div>
          <div className="mt-4">
            <Link
              href={r.destinationHref}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              {r.ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
