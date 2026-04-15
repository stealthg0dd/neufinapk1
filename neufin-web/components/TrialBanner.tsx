import React from "react";
import Link from "next/link";

interface TrialBannerProps {
  status: "trial" | "active" | "expired";
  daysRemaining?: number;
}

export default function TrialBanner({
  status,
  daysRemaining,
}: TrialBannerProps) {
  if (status === "active") return null;
  if (status === "expired") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="max-w-md rounded-xl border border-[var(--border)] bg-white px-8 py-8 text-center shadow-lg">
          <h2 className="mb-4 text-2xl font-bold text-navy">
            Your 14-day trial has ended
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-[var(--slate)]">
            Upgrade to NeuFin Advisor to keep accessing reports and Swarm
            analysis.
          </p>
          <Link href="/upgrade" className="btn-primary text-base px-8 py-3">
            Upgrade Now
          </Link>
        </div>
      </div>
    );
  }
  if (status === "trial" && daysRemaining !== undefined && daysRemaining <= 3) {
    return (
      <div className="flex max-h-10 min-h-10 w-full items-center justify-center border-b border-primary/25 bg-[#E0F7FA] px-4 text-sm text-[#0F172A]">
        <span className="font-medium">Trial active</span>
        <span className="mx-1 text-[var(--muted)]">—</span>
        <span>
          {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining ·{" "}
        </span>
        <Link
          href="/upgrade"
          className="ml-1 font-semibold text-primary hover:underline"
        >
          Upgrade to Advisor
        </Link>
      </div>
    );
  }
  return null;
}
