"use client";

import Link from "next/link";
import { useNeufinAnalytics } from "@/lib/analytics";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-events";
import {
  getAdvisorTourUrl,
  getDemoEmbedUrl,
  getDemoVideoUrl,
  getSampleIcMemoUrl,
} from "@/lib/demo-environment";

type Entry = { label: string; href: string; event: string; external?: boolean };

export function DemoEntryLinks() {
  const { capture } = useNeufinAnalytics();

  const video = getDemoVideoUrl();
  const embed = getDemoEmbedUrl();
  const sampleIc = getSampleIcMemoUrl();
  const advisorTour = getAdvisorTourUrl();

  const entries: Entry[] = [
    video
      ? {
          label: "Watch 60-second demo",
          href: video,
          event: "video_cta",
          external: true,
        }
      : {
          label: "Watch 60-second demo",
          href: "#demo",
          event: "video_scroll_demo_section",
        },
    {
      label: "Try interactive product tour",
      href: embed ?? "/help/tutorials?tour=1",
      event: "interactive_tour",
      external: Boolean(embed),
    },
    {
      label: "See sample IC memo",
      href: sampleIc ?? "/sample/ic-memo",
      event: "sample_ic",
      external: Boolean(sampleIc),
    },
    {
      label: "Explore advisor workflow",
      href: advisorTour ?? "/partners#pricing",
      event: "advisor_workflow",
      external: Boolean(advisorTour),
    },
  ];

  return (
    <div className="mb-10 flex flex-wrap justify-center gap-3 border-y border-lp-border/80 bg-lp-card/50 py-5">
      {entries.map((e) => (
        <Link
          key={e.label}
          href={e.href}
          {...(e.external
            ? { target: "_blank", rel: "noreferrer" }
            : {})}
          className="rounded-full border border-primary/25 bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary-light/80"
          onClick={() => {
            capture(ONBOARDING_EVENTS.demoStarted, {
              entry: e.event,
              href: e.href,
            });
          }}
        >
          {e.label}
        </Link>
      ))}
      <Link
        href="/help/tutorials"
        className="rounded-full border border-border px-4 py-2 text-sm font-medium text-slate2 transition-colors hover:border-primary/30 hover:text-primary"
        onClick={() => capture(ONBOARDING_EVENTS.helpCenterOpened, { from: "demo_strip" })}
      >
        Help & tutorials
      </Link>
    </div>
  );
}
