"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { useNeufinAnalytics } from "@/lib/analytics";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-events";

export function HelpHubLink({
  href = "/help/tutorials",
  label = "Help",
  context,
}: {
  href?: string;
  label?: string;
  /** e.g. dashboard_overview — passed to analytics */
  context?: string;
}) {
  const { capture } = useNeufinAnalytics();
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-readable transition-colors hover:text-primary-dark"
      onClick={() =>
        capture(ONBOARDING_EVENTS.helpCenterOpened, { context: context ?? "inline" })
      }
    >
      <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
