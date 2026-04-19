"use client";

import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { DashboardContextRibbon } from "@/components/dashboard/DashboardContextRibbon";
import { HelpHubLink } from "@/components/onboarding/HelpHubLink";

/**
 * Persistent command-center chrome: wayfinding + portfolio/regime context.
 */
export function DashboardWorkspaceChrome() {
  return (
    <div className="mb-2 border-b border-border/60 pb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <DashboardBreadcrumb />
        </div>
        <div className="shrink-0 sm:pt-0.5">
          <HelpHubLink context="dashboard_shell" label="Help & tutorials" />
        </div>
      </div>
      <div className="mt-3">
        <DashboardContextRibbon />
      </div>
    </div>
  );
}
