"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { getJourneyHintForPath, getTabByPath } from "@/lib/dashboard-ia";

export function DashboardBreadcrumb() {
  const pathname = usePathname() ?? "/dashboard";
  const tab = getTabByPath(pathname);
  const hint = getJourneyHintForPath(pathname);

  if (!tab || tab.path === "/dashboard") {
    return (
      <nav aria-label="Breadcrumb" className="text-xs text-readable">
        <ol className="flex flex-wrap items-center gap-1">
          <li className="font-medium text-navy">Command center</li>
        </ol>
        {hint && (
          <p className="mt-1 max-w-xl text-[11px] leading-snug text-readable/90">
            {hint}
          </p>
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="text-xs text-readable">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            href="/dashboard"
            className="font-medium text-primary-dark hover:underline"
          >
            Command center
          </Link>
        </li>
        <li className="flex items-center gap-1 text-readable">
          <ChevronRight className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span className="font-semibold text-navy">{tab.label}</span>
        </li>
      </ol>
      {hint && (
        <p className="mt-1 max-w-xl text-[11px] leading-snug text-readable/90">
          {hint}
        </p>
      )}
    </nav>
  );
}
