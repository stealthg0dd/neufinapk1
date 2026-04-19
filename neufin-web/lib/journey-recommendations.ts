import { DASHBOARD_TABS, type DashboardTabId } from "@/lib/dashboard-ia";
import type { NextPrimaryActionPayload } from "@/lib/next-primary-action-engine";

export type RecommendationBucket = "now" | "soon" | "watch";

export type RecommendationType =
  | "portfolio"
  | "billing"
  | "swarm"
  | "reports"
  | "research"
  | "navigation";

export type JourneyRecommendation = {
  id: string;
  title: string;
  type: RecommendationType;
  /** Product source for analytics / trust */
  source: "journey_engine" | "dna" | "swarm" | "regime" | "reports" | "research";
  impact: "high" | "medium" | "low";
  /** 0–100 */
  impactScore: number;
  confidence: number;
  timeHorizon: string;
  bucket: RecommendationBucket;
  rationale: string;
  /** Short “why this matters” line */
  whyItMatters: string;
  evidence: string[];
  destinationHref: string;
  ctaLabel: string;
  /** Combined ranking helper */
  rankScore: number;
  /** Paid feature gate hint (informational only) */
  subscriptionHint?: string | null;
};

function impactToScore(impact: JourneyRecommendation["impact"]): number {
  if (impact === "high") return 90;
  if (impact === "medium") return 58;
  return 32;
}

function rank(
  impactScore: number,
  confidence: number,
  bucket: RecommendationBucket,
): number {
  const urgency = bucket === "now" ? 1.15 : bucket === "soon" ? 1.0 : 0.85;
  return Math.round((impactScore * (confidence / 100) * urgency * 100) / 100);
}

/** Ranked recommendations for `/dashboard/actions` — ties to NextPrimaryAction + IA. */
export function buildJourneyRecommendations(
  next: NextPrimaryActionPayload,
): JourneyRecommendation[] {
  const primaryImpact: JourneyRecommendation["impact"] = "high";
  const primary: JourneyRecommendation = {
    id: `primary_${next.key}`,
    title: next.title,
    type:
      next.key === "upload_portfolio"
        ? "portfolio"
        : next.key === "billing_expired" || next.key === "trial_ending"
          ? "billing"
          : next.key === "run_swarm"
            ? "swarm"
            : "reports",
    source: "journey_engine",
    impact: primaryImpact,
    impactScore: impactToScore(primaryImpact),
    confidence: 88,
    timeHorizon: "Now",
    bucket: "now",
    rationale: next.body,
    whyItMatters:
      next.relatedInsight ??
      "This is the highest-leverage move given your current portfolio and subscription state.",
    evidence: [
      `Engine: next action key «${next.key}»`,
      "Matches dashboard workflow: orient → recommendations → depth → outputs.",
    ],
    destinationHref: next.href,
    ctaLabel: next.cta,
    rankScore: 0,
    subscriptionHint:
      next.key === "trial_ending" || next.key === "billing_expired"
        ? "Advisor / Enterprise unlocks full Swarm + report volume."
        : null,
  };
  primary.rankScore = rank(
    primary.impactScore,
    primary.confidence,
    primary.bucket,
  );

  const chain: JourneyRecommendation[] = [];

  const addTab = (
    tabId: DashboardTabId,
    impact: JourneyRecommendation["impact"],
    bucket: RecommendationBucket,
    source: JourneyRecommendation["source"],
  ) => {
    const t = DASHBOARD_TABS[tabId];
    const sc = impact === "high" ? 78 : impact === "medium" ? 70 : 62;
    const is = impactToScore(impact);
    const rec: JourneyRecommendation = {
      id: `chain_${tabId}_${bucket}`,
      title: `Continue: ${t.label}`,
      type: tabId === "billing" ? "billing" : "navigation",
      source,
      impact,
      impactScore: is,
      confidence: sc,
      timeHorizon: bucket === "soon" ? "This week" : "When ready",
      bucket,
      rationale: t.jobToBeDone,
      whyItMatters: t.nextInJourney.reason,
      evidence: [
        `IA next step → ${t.nextInJourney.tabId}: ${t.nextInJourney.reason}`,
      ],
      destinationHref: t.path,
      ctaLabel: `Open ${t.label}`,
      rankScore: rank(is, sc, bucket),
    };
    chain.push(rec);
  };

  if (next.key === "upload_portfolio") {
    addTab("portfolio", "high", "soon", "dna");
    addTab("swarm", "medium", "watch", "swarm");
  } else if (next.key === "run_swarm") {
    addTab("reports", "high", "soon", "reports");
    addTab("research", "medium", "watch", "research");
  } else if (next.key === "open_reports") {
    addTab("research", "medium", "soon", "research");
    addTab("billing", "low", "watch", "reports");
  } else if (next.key === "trial_ending" || next.key === "billing_expired") {
    addTab("billing", "high", "now", "regime");
  } else {
    addTab("research", "medium", "soon", "research");
  }

  const all = [primary, ...chain];
  all.sort((a, b) => b.rankScore - a.rankScore);
  return all;
}

export function groupByBucket(items: JourneyRecommendation[]) {
  const now = items.filter((i) => i.bucket === "now");
  const soon = items.filter((i) => i.bucket === "soon");
  const watch = items.filter((i) => i.bucket === "watch");
  return { now, soon, watch };
}
