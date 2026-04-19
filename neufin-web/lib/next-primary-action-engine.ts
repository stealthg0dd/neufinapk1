import type { SwarmReport } from "@/hooks/usePortfolioData";

export type NextActionKey =
  | "upload_portfolio"
  | "billing_expired"
  | "trial_ending"
  | "run_swarm"
  | "open_reports";

type SubLite = {
  plan?: string;
  subscription_tier?: string;
  trial_days_remaining?: number;
  days_remaining?: number;
};

function planMeta(s: SubLite | null): {
  isPaid: boolean;
  trialDays: number | null;
  isExpired: boolean;
} {
  const plan = (s?.plan ?? s?.subscription_tier ?? "free").toString().toLowerCase();
  const isPaid = plan === "advisor" || plan === "enterprise";
  const trialDays = s?.trial_days_remaining ?? s?.days_remaining ?? null;
  const isExpired = !isPaid && trialDays !== null && trialDays <= 0;
  return { isPaid, trialDays, isExpired };
}

export type NextPrimaryActionPayload = {
  key: NextActionKey;
  title: string;
  body: string;
  href: string;
  cta: string;
  variant: "primary" | "neutral";
  /** Non-noisy continuity line (journey / related insight) */
  relatedInsight: string | null;
};

/**
 * Single source for “what should the user do next?” across dashboard surfaces.
 */
export function computeNextPrimaryAction(input: {
  hasPortfolio: boolean;
  swarmReport: SwarmReport | null;
  subscription: SubLite | null;
}): NextPrimaryActionPayload {
  const { isPaid, trialDays, isExpired } = planMeta(input.subscription);

  if (!input.hasPortfolio) {
    return {
      key: "upload_portfolio",
      title: "Upload a portfolio to unlock your DNA score",
      body:
        "We’ll map holdings to regime context, behavioral DNA, and IC-ready outputs — starting with a CSV.",
      href: "/dashboard/portfolio",
      cta: "Go to Portfolio upload",
      variant: "primary",
      relatedInsight:
        "Why this step: everything downstream — DNA, Swarm, reports — needs a book on file.",
    };
  }

  if (isExpired) {
    return {
      key: "billing_expired",
      title: "Your trial has ended — keep your intelligence layer",
      body:
        "Upgrade to Advisor to continue Swarm IC, reports, and research workflows without interruption.",
      href: "/dashboard/billing",
      cta: "View billing & upgrade",
      variant: "neutral",
      relatedInsight:
        "Next in the loop: restore access, then return to the command center.",
    };
  }

  if (!isPaid && trialDays !== null && trialDays <= 7) {
    return {
      key: "trial_ending",
      title: `Trial: ${trialDays} day${trialDays === 1 ? "" : "s"} left`,
      body:
        "Make the most of NeuFin: run Swarm IC, export reports, and align your book to the current regime.",
      href: "/pricing",
      cta: "Compare plans",
      variant: "primary",
      relatedInsight:
        "Advisor unlocks unlimited IC runs and white-label PDFs for clients.",
    };
  }

  if (!input.swarmReport) {
    return {
      key: "run_swarm",
      title: "Next: run Swarm IC on your portfolio",
      body:
        "Seven agents produce a regime-aware Investment Committee briefing — the bridge from DNA to decisions.",
      href: "/dashboard/swarm",
      cta: "Open Swarm IC",
      variant: "primary",
      relatedInsight:
        "After Swarm: push outputs to Reports and tie regime notes from Research to your book.",
    };
  }

  return {
    key: "open_reports",
    title: "Next: export or share your latest intelligence",
    body:
      "Vault holds PDFs and advisor-ready exports. Share with clients or your team from Reports.",
    href: "/dashboard/reports",
    cta: "Open Reports",
    variant: "primary",
    relatedInsight:
      "Keep the loop tight: refresh Research when the macro desk publishes, then re-run Swarm if the book shifts.",
  };
}
