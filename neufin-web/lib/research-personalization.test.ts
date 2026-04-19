import { describe, expect, it } from "vitest";
import {
  categorizeResearchNote,
  scoreResearchForPortfolio,
} from "@/lib/research-personalization";
import type { ResearchNote } from "@/lib/api";

function baseNote(over: Partial<ResearchNote>): ResearchNote {
  return {
    id: "1",
    note_type: "macro_regime",
    title: "Test",
    executive_summary: "Summary",
    generated_at: new Date().toISOString(),
    is_public: true,
    ...over,
  };
}

describe("categorizeResearchNote", () => {
  it("tags regime and macro for macro_regime type", () => {
    const s = categorizeResearchNote(baseNote({}));
    expect(s.has("latest")).toBe(true);
    expect(s.has("regime")).toBe(true);
    expect(s.has("macro")).toBe(true);
  });

  it("tags sector when affected_sectors present", () => {
    const s = categorizeResearchNote(
      baseNote({
        note_type: "sector_rotation",
        affected_sectors: ["Technology"],
      }),
    );
    expect(s.has("sector")).toBe(true);
  });
});

describe("scoreResearchForPortfolio", () => {
  it("boosts score when regime matches user", () => {
    const low = scoreResearchForPortfolio(
      baseNote({ regime: "risk_off", confidence_score: 0.5 }),
      {
        userRegimeSlug: "risk_on",
        portfolioTickerHints: [],
        sectorHints: [],
        countryHints: [],
      },
    );
    const high = scoreResearchForPortfolio(
      baseNote({ regime: "risk_off", confidence_score: 0.5 }),
      {
        userRegimeSlug: "risk_off",
        portfolioTickerHints: [],
        sectorHints: [],
        countryHints: [],
      },
    );
    expect(high.score).toBeGreaterThan(low.score);
  });
});
