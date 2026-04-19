import type { ResearchNote } from "@/lib/api";

export type ResearchIACategory =
  | "latest"
  | "regime"
  | "sector"
  | "macro"
  | "portfolio";

const SECTOR_KEYWORDS = [
  "technology",
  "tech",
  "financial",
  "financials",
  "health",
  "healthcare",
  "energy",
  "consumer",
  "industrial",
  "materials",
  "utilities",
  "real estate",
  "communication",
  "staples",
  "discretionary",
] as const;

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function noteType(nt: string): string {
  return norm(nt).replace(/\s+/g, "_");
}

/** Classify a note into IA buckets (a note can appear in multiple). */
export function categorizeResearchNote(note: ResearchNote): Set<ResearchIACategory> {
  const s = new Set<ResearchIACategory>();
  s.add("latest");
  const nt = noteType(note.note_type);
  const summary = norm(note.executive_summary + " " + note.title);

  if (
    nt.includes("regime") ||
    nt.includes("macro") ||
    summary.includes("regime") ||
    summary.includes("fed ") ||
    summary.includes("yield")
  ) {
    s.add("regime");
  }
  if (
    nt.includes("sector") ||
    (note.affected_sectors && note.affected_sectors.length > 0) ||
    SECTOR_KEYWORDS.some((k) => summary.includes(k))
  ) {
    s.add("sector");
  }
  if (
    nt.includes("macro") ||
    nt.includes("global") ||
    summary.includes("cpi") ||
    summary.includes("inflation") ||
    summary.includes("pmi")
  ) {
    s.add("macro");
  }
  return s;
}

export type RelevanceContext = {
  userRegimeSlug: string | null;
  portfolioTickerHints: string[];
  sectorHints: string[];
  countryHints: string[];
};

export function buildRelevanceContext(input: {
  regimeLabel?: string | null;
  regimeSlug?: string | null;
  portfolioSummaryText?: string;
  dnaStrengthsWeaknesses?: string[];
}): RelevanceContext {
  const userRegimeSlug = input.regimeSlug
    ? norm(input.regimeSlug).replace(/\s+/g, "_")
    : input.regimeLabel
      ? norm(input.regimeLabel).replace(/\s+/g, "_")
      : null;

  const blob = [
    input.portfolioSummaryText ?? "",
    ...(input.dnaStrengthsWeaknesses ?? []),
  ].join(" ");
  const sectorHints = SECTOR_KEYWORDS.filter((k) => blob.toLowerCase().includes(k));

  const tickerLike = blob.match(/\b[A-Z]{1,5}\b/g) ?? [];
  const portfolioTickerHints = [...new Set(tickerLike)].slice(0, 24);

  return {
    userRegimeSlug,
    portfolioTickerHints,
    sectorHints,
    countryHints: [],
  };
}

export type ScoredNote = {
  note: ResearchNote;
  score: number;
  reasons: string[];
};

/**
 * Heuristic relevance 0–100: regime alignment, sector/ticker overlap, confidence.
 */
export function scoreResearchForPortfolio(
  note: ResearchNote,
  ctx: RelevanceContext,
): ScoredNote {
  const reasons: string[] = [];
  let score = 15;

  const noteRegime = note.regime ? norm(note.regime).replace(/\s+/g, "_") : "";
  if (ctx.userRegimeSlug && noteRegime && noteRegime === ctx.userRegimeSlug) {
    score += 35;
    reasons.push("Matches your current risk regime");
  } else if (ctx.userRegimeSlug && noteRegime) {
    score += 12;
    reasons.push("Regime context for positioning review");
  }

  const sectors = (note.affected_sectors ?? []).map(norm);
  for (const sh of ctx.sectorHints) {
    if (sectors.some((s) => s.includes(sh) || sh.includes(s))) {
      score += 22;
      reasons.push(`Touches a sector theme in your book (${sh})`);
      break;
    }
  }

  const hay = norm(note.title + " " + note.executive_summary);
  for (const t of ctx.portfolioTickerHints) {
    if (hay.includes(norm(t))) {
      score += 18;
      reasons.push(`Mentions a holding symbol (${t})`);
      break;
    }
  }

  const conf =
    typeof note.confidence_score === "number"
      ? note.confidence_score <= 1
        ? note.confidence_score
        : note.confidence_score / 100
      : 0.5;
  score += Math.round(conf * 8);

  if (note.why_portfolio_matters) {
    score += 10;
    reasons.push("Includes portfolio-specific framing");
  }

  return {
    note,
    score: Math.min(100, score),
    reasons: reasons.slice(0, 3),
  };
}

export function sortByPortfolioRelevance(
  notes: ResearchNote[],
  ctx: RelevanceContext,
): ScoredNote[] {
  return notes
    .map((n) => scoreResearchForPortfolio(n, ctx))
    .sort((a, b) => b.score - a.score);
}
