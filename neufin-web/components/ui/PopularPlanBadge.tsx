"use client";

import clsx from "clsx";

export type PopularPlanBadgeVariant = "strip" | "pill";

/**
 * Shared “Most popular” treatment for pricing cards (landing, /pricing, partners).
 * Uses the canonical teal gradient so the badge reads consistently everywhere.
 */
export function PopularPlanBadge({
  variant = "strip",
  children = "Most popular",
  className,
}: {
  variant?: PopularPlanBadgeVariant;
  children?: React.ReactNode;
  className?: string;
}) {
  const label = (
    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white drop-shadow-sm">
      {children}
    </span>
  );

  if (variant === "pill") {
    return (
      <div
        className={clsx(
          "absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-primary to-primary-dark px-3.5 py-1 shadow-md",
          className,
        )}
        role="status"
      >
        {label}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "shrink-0 bg-gradient-to-r from-primary to-primary-dark px-3 py-2 text-center sm:py-2.5",
        className,
      )}
    >
      {label}
    </div>
  );
}
