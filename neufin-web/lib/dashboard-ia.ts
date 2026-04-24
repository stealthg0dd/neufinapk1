/**
 * Canonical dashboard information architecture & journey metadata.
 * Use for breadcrumbs, “next best action,” analytics, and docs — single source of truth.
 */

export type DashboardTabId =
  | "overview"
  | "actions"
  | "portfolio"
  | "swarm"
  | "research"
  | "quant"
  | "attribution"
  | "reports"
  | "billing";

export type EntryState =
  | "empty_no_portfolio"
  | "loading"
  | "dna_pending"
  | "ready"
  | "trial"
  | "paid"
  | "error";

export type DashboardTabDefinition = {
  id: DashboardTabId;
  path: `/${string}`;
  label: string;
  section: "overview" | "insights" | "account";
  /** Job-to-be-done (one line) */
  jobToBeDone: string;
  /** Typical entry states for this surface */
  entryStates: EntryState[];
  /** Primary domain objects (API / client) */
  keyDataObjects: string[];
  /** Primary CTA intent (not copy) */
  primaryCta: string;
  /** Natural next step in the decision workflow */
  nextInJourney: { tabId: DashboardTabId; reason: string };
};

/** Ordered decision workflow: orient → recommendations → depth → outputs → monetization */
export const DASHBOARD_WORKFLOW_ORDER: DashboardTabId[] = [
  "overview",
  "actions",
  "portfolio",
  "swarm",
  "research",
  "quant",
  "attribution",
  "reports",
  "billing",
];

export const DASHBOARD_TABS: Record<DashboardTabId, DashboardTabDefinition> = {
  overview: {
    id: "overview",
    path: "/dashboard",
    label: "Dashboard",
    section: "overview",
    jobToBeDone:
      "Orient the user: regime, health, risks, and what to do next in one glance.",
    entryStates: ["empty_no_portfolio", "loading", "ready", "trial", "paid"],
    keyDataObjects: [
      "RegimeData",
      "latestDna",
      "latestPortfolio",
      "swarmReport (preview)",
      "research notes feed",
    ],
    primaryCta: "Upload portfolio OR deep-link to Portfolio / Swarm / Reports",
    nextInJourney: {
      tabId: "actions",
      reason: "See ranked recommendations for the next best moves.",
    },
  },
  actions: {
    id: "actions",
    path: "/dashboard/actions",
    label: "Actions",
    section: "overview",
    jobToBeDone:
      "Ranked next steps across portfolio, IC, research, and reports — one place to decide what to do.",
    entryStates: ["empty_no_portfolio", "ready", "trial", "paid"],
    keyDataObjects: ["subscription status", "swarm state", "DNA", "regime"],
    primaryCta: "Jump to the highest-impact destination",
    nextInJourney: {
      tabId: "portfolio",
      reason: "Execute on holdings and DNA when recommendations point there.",
    },
  },
  portfolio: {
    id: "portfolio",
    path: "/dashboard/portfolio",
    label: "Portfolio",
    section: "overview",
    jobToBeDone:
      "Run and refine DNA / holdings analysis; advisor-grade portfolio story.",
    entryStates: ["empty_no_portfolio", "dna_pending", "ready", "error"],
    keyDataObjects: [
      "DNAAnalysisResponse",
      "positions[]",
      "portfolio_id",
      "warnings / failed_tickers",
    ],
    primaryCta: "Upload CSV / re-analyze / open chart lab / buy report",
    nextInJourney: {
      tabId: "swarm",
      reason: "Turn analysis into IC narrative and committee-ready output.",
    },
  },
  swarm: {
    id: "swarm",
    path: "/dashboard/swarm",
    label: "Swarm IC",
    section: "overview",
    jobToBeDone:
      "Multi-agent IC narrative: thesis, risks, and actions from current portfolio context.",
    entryStates: ["empty_no_portfolio", "ready", "trial"],
    keyDataObjects: ["swarm job", "report text", "export PDF hooks"],
    primaryCta: "Run analysis / export / push to Vault",
    nextInJourney: {
      tabId: "reports",
      reason: "Persist and distribute advisor-ready PDFs.",
    },
  },
  research: {
    id: "research",
    path: "/dashboard/research",
    label: "Research",
    section: "insights",
    jobToBeDone:
      "Macro and research intelligence tied to user regime and portfolio relevance.",
    entryStates: ["loading", "ready", "empty_no_portfolio"],
    keyDataObjects: [
      "regime payload",
      "research notes",
      "global map / heatmap",
    ],
    primaryCta: "Read note / apply insight to portfolio / share",
    nextInJourney: {
      tabId: "portfolio",
      reason: "Translate insight into holdings review or re-upload.",
    },
  },
  quant: {
    id: "quant",
    path: "/dashboard/quant",
    label: "Quant",
    section: "insights",
    jobToBeDone:
      "Numeric validation: factors, risk, scenarios — institutional depth.",
    entryStates: ["ready", "empty_no_portfolio"],
    keyDataObjects: ["metrics", "charts", "portfolio id"],
    primaryCta: "Drill chart / export / link to report",
    nextInJourney: {
      tabId: "reports",
      reason: "Snapshot quant view into client deliverable.",
    },
  },
  attribution: {
    id: "attribution",
    path: "/dashboard/attribution",
    label: "Attribution",
    section: "insights",
    jobToBeDone:
      "Decompose portfolio risk and return into factor contributions — market beta, concentration, sector, and idiosyncratic.",
    entryStates: ["ready", "empty_no_portfolio"],
    keyDataObjects: ["metrics", "positions[]", "portfolio_id"],
    primaryCta: "Drill factor / export / link to report",
    nextInJourney: {
      tabId: "reports",
      reason: "Snapshot attribution view into client deliverable.",
    },
  },
  reports: {
    id: "reports",
    path: "/dashboard/reports",
    label: "Reports",
    section: "insights",
    jobToBeDone:
      "Vault of generated PDFs: executive summary, IC memo, advisor exports.",
    entryStates: ["loading", "ready", "trial", "paid"],
    keyDataObjects: [
      "ReportRecord[]",
      "pdf_url",
      "portfolio_id",
      "report theme / white-label",
    ],
    primaryCta: "Generate / download / share / checkout",
    nextInJourney: {
      tabId: "billing",
      reason: "Upgrade for more reports or manage plan.",
    },
  },
  billing: {
    id: "billing",
    path: "/dashboard/billing",
    label: "Billing",
    section: "account",
    jobToBeDone: "Subscription, trial, invoices, upgrade inside product.",
    entryStates: ["trial", "paid", "error"],
    keyDataObjects: ["subscription status", "Stripe portal"],
    primaryCta: "Manage plan / upgrade",
    nextInJourney: {
      tabId: "overview",
      reason: "Return to command center after plan change.",
    },
  },
};

export function getTabByPath(pathname: string): DashboardTabDefinition | null {
  const normalized = pathname.replace(/\/$/, "") || "/dashboard";
  const entries = Object.values(DASHBOARD_TABS);
  const exact = entries.find((t) => t.path === normalized);
  if (exact) return exact;
  const prefix = entries
    .filter((t) => normalized.startsWith(t.path) && t.path !== "/dashboard")
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (prefix) return prefix;
  if (normalized === "/dashboard" || normalized.startsWith("/dashboard?")) {
    return DASHBOARD_TABS.overview;
  }
  return null;
}

/** Human-readable journey line for breadcrumbs (not raw route segments). */
export function getJourneyHintForPath(pathname: string): string | null {
  const tab = getTabByPath(pathname);
  return tab?.jobToBeDone ?? null;
}
