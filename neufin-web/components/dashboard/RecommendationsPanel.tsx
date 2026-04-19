"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import {
  groupByBucket,
  type JourneyRecommendation,
} from "@/lib/journey-recommendations";
import { JOURNEY_EVENTS } from "@/lib/journey-analytics";
import { useNeufinAnalytics } from "@/lib/analytics";

const IMPACT_STYLES = {
  high: "border-primary/40 bg-primary-light/40 text-primary-dark",
  medium: "border-amber-200 bg-amber-50 text-amber-950",
  low: "border-border bg-surface-2 text-readable",
} as const;

function BucketSection({
  title,
  subtitle,
  items,
  onView,
  onClick,
}: {
  title: string;
  subtitle: string;
  items: JourneyRecommendation[];
  onView: (id: string, bucket: JourneyRecommendation["bucket"]) => void;
  onClick: (
    id: string,
    bucket: JourneyRecommendation["bucket"],
    href: string,
  ) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          items.forEach((it) => onView(it.id, it.bucket));
        });
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [items, onView]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="space-y-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-navy">
          {title}
        </h2>
        <p className="text-xs text-readable">{subtitle}</p>
      </div>
      <ol className="space-y-4">
        {items.map((r, i) => (
          <li
            key={r.id}
            className="rounded-xl border border-border bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="text-label text-readable">
                  #{i + 1} · {r.source.replace(/_/g, " ")}
                </span>
                <h3 className="mt-1 text-base font-bold text-navy">{r.title}</h3>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${IMPACT_STYLES[r.impact]}`}
              >
                {r.impact} impact
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-readable">
              {r.rationale}
            </p>
            <p className="mt-2 border-l-2 border-primary/25 pl-3 text-sm text-navy">
              <span className="font-semibold">Why it matters: </span>
              {r.whyItMatters}
            </p>
            {r.evidence.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-readable">
                {r.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-readable">
              <span>Score · {r.rankScore}</span>
              <span>Confidence · {r.confidence}%</span>
              <span>Horizon · {r.timeHorizon}</span>
              {r.subscriptionHint && (
                <span className="text-amber-900/90">{r.subscriptionHint}</span>
              )}
            </div>
            <div className="mt-4">
              <Link
                href={r.destinationHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                onClick={() => onClick(r.id, r.bucket, r.destinationHref)}
              >
                {r.ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RecommendationsPanel({
  items,
}: {
  items: JourneyRecommendation[];
}) {
  const { capture } = useNeufinAnalytics();
  const viewed = useRef(new Set<string>());

  const { now, soon, watch } = groupByBucket(items);

  const onView = (id: string, bucket: JourneyRecommendation["bucket"]) => {
    if (viewed.current.has(id)) return;
    viewed.current.add(id);
    capture(JOURNEY_EVENTS.recommendationViewed, {
      recommendation_id: id,
      bucket,
    });
  };

  const onClick = (
    id: string,
    bucket: JourneyRecommendation["bucket"],
    href: string,
  ) => {
    capture(JOURNEY_EVENTS.recommendationClicked, {
      recommendation_id: id,
      bucket,
      destination: href,
    });
    capture(JOURNEY_EVENTS.recommendationCompleted, {
      recommendation_id: id,
      bucket,
      phase: "navigate",
    });
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-readable">
        Recommendations will appear once your portfolio and subscription state load.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <BucketSection
        title="Now"
        subtitle="Do these first — highest urgency and leverage."
        items={now}
        onView={onView}
        onClick={onClick}
      />
      <BucketSection
        title="Soon"
        subtitle="Queued follow-through this week."
        items={soon}
        onView={onView}
        onClick={onClick}
      />
      <BucketSection
        title="Watch"
        subtitle="Background continuity — pick up when the book or regime shifts."
        items={watch}
        onView={onView}
        onClick={onClick}
      />
    </div>
  );
}
