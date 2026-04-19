/**
 * Tutorial & help content taxonomy — drives /help/tutorials and in-app launchers.
 */

export type TutorialCategory =
  | "getting_started"
  | "upload"
  | "dna"
  | "regime"
  | "reports"
  | "advisor"
  | "api";

export type TutorialEntry = {
  slug: string;
  title: string;
  category: TutorialCategory;
  summary: string;
  /** Placeholder for Storylane/Guidde deep link when available */
  externalUrlEnv?: string;
};

export const TUTORIAL_CATEGORIES: {
  id: TutorialCategory;
  label: string;
}[] = [
  { id: "getting_started", label: "Getting started" },
  { id: "upload", label: "Upload a portfolio" },
  { id: "dna", label: "Interpret DNA score" },
  { id: "regime", label: "Understand market regime" },
  { id: "reports", label: "Export & share reports" },
  { id: "advisor", label: "Advisor workflow" },
  { id: "api", label: "Platform & API" },
];

export const TUTORIALS: TutorialEntry[] = [
  {
    slug: "welcome",
    title: "Welcome to NeuFin",
    category: "getting_started",
    summary: "Command center, portfolio context, and where to go next.",
  },
  {
    slug: "upload-csv",
    title: "Upload your first CSV",
    category: "upload",
    summary: "Columns, tickers, and SEA suffixes.",
  },
  {
    slug: "dna-score",
    title: "Reading your DNA score",
    category: "dna",
    summary: "Archetype, strengths, weaknesses, and what to improve.",
  },
  {
    slug: "regime",
    title: "Macro regime and your book",
    category: "regime",
    summary: "Why regime matters for positioning.",
  },
  {
    slug: "reports-vault",
    title: "Reports & Vault",
    category: "reports",
    summary: "PDFs, IC memos, and sharing.",
  },
  {
    slug: "advisor-clients",
    title: "Advisor workflows",
    category: "advisor",
    summary: "Clients, memos, and white-label.",
  },
  {
    slug: "api-keys",
    title: "API & automation",
    category: "api",
    summary: "Keys, quotas, webhooks.",
  },
];
