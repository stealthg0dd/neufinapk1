"use client";

import { MethodologyDialogTrigger } from "@/components/landing/MethodologyDialog";

const TRUST_PILLS = [
  "IFA & RIA white-label PDFs",
  "Encryption in transit · access-controlled storage",
  "GDPR-ready processing · SOC 2 in progress",
  "No live broker credentials required",
] as const;

export function HeroTrustStrip() {
  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-wrap gap-2">
        {TRUST_PILLS.map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded-full border border-primary/20 bg-primary-light/60 px-3 py-1.5 text-xs font-semibold text-primary-dark"
          >
            {t}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate2">
        <span className="font-medium text-foreground">
          Built for committees that need proof, not hype.
        </span>
        <span className="hidden sm:inline text-lp-muted" aria-hidden>
          ·
        </span>
        <MethodologyDialogTrigger />
      </div>
    </div>
  );
}
