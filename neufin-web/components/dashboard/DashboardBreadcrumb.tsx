"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { getTabByPath } from "@/lib/dashboard-ia";

export function DashboardBreadcrumb() {
  const pathname = usePathname() ?? "/dashboard";
  const tab = getTabByPath(pathname);

  if (!tab || tab.path === "/dashboard") {
    return (
      <nav aria-label="Breadcrumb" className="text-xs text-readable">
        <ol className="flex flex-wrap items-center gap-1">
          <li className="font-medium text-navy">Command center</li>
        </ol>
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
    </nav>
  );
}
