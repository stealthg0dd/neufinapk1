/**
 * Demo environment strategy — vendor-agnostic (Storylane, Supademo, Guidde, Arcade, Navattic).
 * Never use production customer data in recorded flows; use synthetic portfolios and demo users only.
 */

export const DEMO_ENVIRONMENT = {
  /** Prefer a dedicated demo workspace / service account with synthetic holdings only. */
  dataPolicy:
    "Use CSV fixtures or seeded tickers; no imports from live client accounts.",
  /** Routes that should stay layout-stable for Loom / iframe recorders. */
  stableUiPaths: ["/", "/upload", "/results", "/dashboard", "/pricing"] as const,
  /** Query flag for future gated demo mode in app (analytics only for now). */
  demoQueryParam: "demo" as const,
  envKeys: {
    /** Optional full-page embed for interactive product tour (any vendor iframe URL). */
    embedUrl: "NEXT_PUBLIC_DEMO_EMBED_URL",
    /** Optional 60s marketing video (YouTube/Vimeo/self-hosted). */
    videoUrl: "NEXT_PUBLIC_DEMO_VIDEO_URL",
    /** Optional deep link to sample IC PDF or static preview page. */
    sampleIcUrl: "NEXT_PUBLIC_SAMPLE_IC_MEMO_URL",
    /** Optional advisor workflow walkthrough URL. */
    advisorTourUrl: "NEXT_PUBLIC_ADVISOR_TOUR_URL",
  },
} as const;

export function getDemoEmbedUrl(): string | undefined {
  const u = process.env.NEXT_PUBLIC_DEMO_EMBED_URL?.trim();
  return u || undefined;
}

export function getDemoVideoUrl(): string | undefined {
  const u = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL?.trim();
  return u || undefined;
}

export function getSampleIcMemoUrl(): string | undefined {
  const u = process.env.NEXT_PUBLIC_SAMPLE_IC_MEMO_URL?.trim();
  return u || undefined;
}

export function getAdvisorTourUrl(): string | undefined {
  const u = process.env.NEXT_PUBLIC_ADVISOR_TOUR_URL?.trim();
  return u || undefined;
}
