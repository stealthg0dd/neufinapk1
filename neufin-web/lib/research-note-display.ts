import type { ResearchNote } from "@/lib/api";

export type DisplayResearchNote = {
  id: string;
  title: string;
  executiveSummary: string;
  noteType: string;
  regime: string | null;
  confidencePct: number | null;
  readTimeMinutes: number;
  sectors: string[];
  whyPortfolioMatters: string | null;
  portfolioImplications: string[];
  suggestedNextAction: string | null;
};

function confidenceToPct(v: number | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
}

function estimateReadMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wpm = 220;
  return Math.max(1, Math.min(25, Math.ceil(words / wpm)));
}

export function toDisplayResearchNote(note: ResearchNote): DisplayResearchNote {
  const blob = `${note.title} ${note.executive_summary} ${note.full_content ?? ""}`;
  const readTimeMinutes =
    typeof note.read_time_minutes === "number" && note.read_time_minutes > 0
      ? note.read_time_minutes
      : estimateReadMinutes(blob);

  const implications =
    note.portfolio_implications ??
    (note.key_findings
      ? note.key_findings
          .map((k) => k.implication)
          .filter(Boolean)
          .slice(0, 5)
      : []);

  return {
    id: note.id,
    title: note.title,
    executiveSummary: note.executive_summary,
    noteType: note.note_type,
    regime: note.regime ?? null,
    confidencePct: confidenceToPct(note.confidence_score),
    readTimeMinutes,
    sectors: note.affected_sectors ?? [],
    whyPortfolioMatters: note.why_portfolio_matters ?? null,
    portfolioImplications: implications,
    suggestedNextAction: note.suggested_next_action ?? null,
  };
}
