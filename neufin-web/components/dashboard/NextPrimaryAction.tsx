"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { usePortfolioIntelligence } from "@/components/dashboard/PortfolioIntelligenceContext";

type SubStatus = {
  plan?: string;
  subscription_tier?: string;
  status?: string;
  trial_days_remaining?: number;
  days_remaining?: number;
};

function planLabel(s: SubStatus): {
  isPaid: boolean;
  trialDays: number | null;
  isExpired: boolean;
} {
  const plan = (s.plan ?? s.subscription_tier ?? "free").toString().toLowerCase();
  const isPaid = plan === "advisor" || plan === "enterprise";
  const trialDays =
    s.trial_days_remaining ?? s.days_remaining ?? null;
  const isExpired =
    !isPaid && trialDays !== null && trialDays <= 0;
  return { isPaid, trialDays, isExpired };
}

export function NextPrimaryAction() {
  const { hasPortfolio, swarmReport } = usePortfolioIntelligence();
  const [sub, setSub] = useState<SubStatus | null>(null);

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

  const { isPaid, trialDays, isExpired } = planLabel(sub ?? {});

  let title: string;
  let body: string;
  let href: string;
  let cta: string;
  let variant: "primary" | "neutral" = "primary";

  if (!hasPortfolio) {
    title = "Upload a portfolio to unlock your DNA score";
    body =
      "We’ll map holdings to regime context, behavioral DNA, and IC-ready outputs — starting with a CSV.";
    href = "/dashboard/portfolio";
    cta = "Go to Portfolio upload";
  } else if (isExpired) {
    title = "Your trial has ended — keep your intelligence layer";
    body =
      "Upgrade to Advisor to continue Swarm IC, reports, and research workflows without interruption.";
    href = "/dashboard/billing";
    cta = "View billing & upgrade";
    variant = "neutral";
  } else if (!isPaid && trialDays !== null && trialDays <= 7) {
    title = `Trial: ${trialDays} day${trialDays === 1 ? "" : "s"} left`;
    body =
      "Make the most of NeuFin: run Swarm IC, export reports, and align your book to the current regime.";
    href = "/pricing";
    cta = "Compare plans";
  } else if (!swarmReport) {
    title = "Next: run Swarm IC on your portfolio";
    body =
      "Seven agents produce a regime-aware Investment Committee briefing — the bridge from DNA to decisions.";
    href = "/dashboard/swarm";
    cta = "Open Swarm IC";
  } else {
    title = "Next: export or share your latest intelligence";
    body =
      "Vault holds PDFs and advisor-ready exports. Share with clients or your team from Reports.";
    href = "/dashboard/reports";
    cta = "Open Reports";
  }

  const btnClass =
    variant === "primary"
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
        {title}
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-readable">
        {body}
      </p>
      <div className="mt-4">
        <Link href={href} className={btnClass}>
          {cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
