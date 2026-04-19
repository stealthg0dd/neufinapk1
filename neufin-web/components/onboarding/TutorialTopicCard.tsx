"use client";

import Link from "next/link";
import { useNeufinAnalytics } from "@/lib/analytics";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-events";
import type { TutorialEntry } from "@/lib/onboarding-catalog";

export function TutorialTopicCard({ t }: { t: TutorialEntry }) {
  const { capture } = useNeufinAnalytics();
  return (
    <Link
      href={`/help/tutorials#${t.slug}`}
      id={t.slug}
      className="block scroll-mt-24 rounded-lg border border-border bg-white px-4 py-3 transition-colors hover:border-primary/40"
      onClick={() =>
        capture(ONBOARDING_EVENTS.tutorialViewed, {
          slug: t.slug,
          category: t.category,
        })
      }
    >
      <span className="font-semibold text-navy">{t.title}</span>
      <p className="mt-1 text-sm text-readable">{t.summary}</p>
    </Link>
  );
}
