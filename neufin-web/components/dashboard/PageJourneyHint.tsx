"use client";

import type { ReactNode } from "react";

/**
 * Lightweight “why this page matters” — keep copy short to avoid noise.
 */
export function PageJourneyHint({
  title = "Why this page",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="rounded-lg border border-border/80 bg-surface-2/60 px-3 py-2 text-xs leading-relaxed text-readable">
      <span className="font-semibold text-navy">{title}: </span>
      {children}
    </aside>
  );
}
