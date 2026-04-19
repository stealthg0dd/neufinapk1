import { DASHBOARD_TABS, type DashboardTabId } from "@/lib/dashboard-ia";
import type { NextPrimaryActionPayload } from "@/lib/next-primary-action-engine";

export type JourneyRecommendation = {
  id: string;
  title: string;
  impact: "high" | "medium" | "low";
  confidence: number;
  timeHorizon: string;
  rationale: string;
  destinationHref: string;
  ctaLabel: string;
};

/** Ranked recommendations for `/dashboard/actions` — ties to same logic as NextPrimaryAction + IA. */
export function buildJourneyRecommendations(
  next: NextPrimaryActionPayload,
): JourneyRecommendation[] {
  const primary: JourneyRecommendation = {
    id: `primary_${next.key}`,
    title: next.title,
    impact: "high",
    confidence: 88,
    timeHorizon: "Now",
    rationale: next.body,
    destinationHref: next.href,
    ctaLabel: next.cta,
  };

  const chain: JourneyRecommendation[] = [];

  const addTab = (tabId: DashboardTabId, impact: JourneyRecommendation["impact"]) => {
    const t = DASHBOARD_TABS[tabId];
    chain.push({
      id: `chain_${tabId}`,
      title: `Continue: ${t.label}`,
      impact,
      confidence: 72,
      timeHorizon: "This week",
      rationale: t.jobToBeDone,
      destinationHref: t.path,
      ctaLabel: `Open ${t.label}`,
    });
  };

  if (next.key === "upload_portfolio") {
    addTab("portfolio", "high");
    addTab("swarm", "medium");
  } else if (next.key === "run_swarm") {
    addTab("reports", "high");
    addTab("research", "medium");
  } else if (next.key === "open_reports") {
    addTab("research", "medium");
    addTab("billing", "low");
  } else if (next.key === "trial_ending" || next.key === "billing_expired") {
    addTab("billing", "high");
  } else {
    addTab("research", "medium");
  }

  return [primary, ...chain];
}
