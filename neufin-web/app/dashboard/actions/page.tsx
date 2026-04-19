"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api-client";
import { usePortfolioIntelligence } from "@/components/dashboard/PortfolioIntelligenceContext";
import { RecommendationsPanel } from "@/components/dashboard/RecommendationsPanel";
import { PageJourneyHint } from "@/components/dashboard/PageJourneyHint";
import { computeNextPrimaryAction } from "@/lib/next-primary-action-engine";
import { buildJourneyRecommendations } from "@/lib/journey-recommendations";
import { JOURNEY_EVENTS } from "@/lib/journey-analytics";
import { useNeufinAnalytics } from "@/lib/analytics";

type SubStatus = {
  plan?: string;
  subscription_tier?: string;
  trial_days_remaining?: number;
  days_remaining?: number;
};

export default function DashboardActionsPage() {
  const { hasPortfolio, swarmReport, loading } = usePortfolioIntelligence();
  const [sub, setSub] = useState<SubStatus | null>(null);
  const { capture } = useNeufinAnalytics();

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const res = await apiGet<SubStatus>("/api/subscription/status");
        if (!c) setSub(res ?? {});
      } catch {
        if (!c) setSub({});
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    capture(JOURNEY_EVENTS.stepViewed, {
      surface: "actions_page",
      path: "/dashboard/actions",
    });
  }, [capture]);

  const recs = useMemo(() => {
    const next = computeNextPrimaryAction({
      hasPortfolio,
      swarmReport,
      subscription: sub,
    });
    return buildJourneyRecommendations(next);
  }, [hasPortfolio, swarmReport, sub]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-readable">
        Loading recommendations…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="section-header">
        <div>
          <p className="text-label text-primary">Journey</p>
          <h1>Recommended actions</h1>
          <p className="mt-1 max-w-2xl text-sm text-readable">
            Ranked next steps from your subscription state, portfolio, Swarm IC,
            and the standard NeuFin workflow — same logic as the command center
            card, expanded for planning.
          </p>
        </div>
      </header>

      <PageJourneyHint>
        This page answers &quot;what should we do next?&quot; without hunting
        through each tab — destinations are deep-linked into Portfolio, Swarm,
        Research, Reports, or Billing.
      </PageJourneyHint>

      <RecommendationsPanel items={recs} />
    </div>
  );
}
