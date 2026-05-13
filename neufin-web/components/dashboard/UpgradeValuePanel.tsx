"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import {
  hasFullAccess,
  type SubscriptionAccessInput,
} from "@/lib/subscription-access";

const ADVISOR_UNLOCKS = [
  "Unlimited Swarm IC & regime-aware briefings",
  "White-label PDFs and client-ready Vault exports",
  "Multi-portfolio workspace for IFA teams",
] as const;

const ENTERPRISE_UNLOCKS = [
  "Platform embed, SLA, and integration support",
  "Custom data residency and enterprise DPAs",
  "API quotas and webhook workflows for platforms",
] as const;

export function UpgradeValuePanel() {
  const [paid, setPaid] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiGet<SubscriptionAccessInput>(
          "/api/subscription/status",
        );
        if (!cancelled) setPaid(hasFullAccess(res ?? null));
      } catch {
        if (!cancelled) setPaid(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (paid === null || paid === true) return null;

  return (
    <section
      className="mt-6 rounded-xl border border-border bg-surface-2/80 p-5"
      aria-labelledby="upgrade-value-title"
    >
      <h2 id="upgrade-value-title" className="text-sm font-bold text-navy">
        Why paid matters
      </h2>
      <p className="mt-1 text-sm text-readable">
        Free tier proves the workflow; Advisor and Enterprise unlock the outputs
        committees and platforms run on every week.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-readable">
            Advisor
          </p>
          <ul className="mt-2 space-y-2">
            {ADVISOR_UNLOCKS.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <Link
            href="/pricing"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Compare Advisor →
          </Link>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-readable">
            Enterprise & API
          </p>
          <ul className="mt-2 space-y-2">
            {ENTERPRISE_UNLOCKS.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <Link
            href="/contact-sales"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Talk to sales →
          </Link>
        </div>
      </div>
    </section>
  );
}
