import { describe, expect, it } from "vitest";
import { normalizeResearchContent } from "./research-normalizer";

describe("normalizeResearchContent", () => {
  it("parses JSON dict and exposes structured sections", () => {
    const raw = JSON.stringify({
      thesis: "Macro is soft.",
      key_findings: [{ finding: "Rates peaked", implication: "Risk-on" }],
      sector_impacts: [{ sector: "Tech", impact: "Higher beta", direction: "up" }],
    });
    const r = normalizeResearchContent(raw, "fallback");
    expect(r.structured?.key_findings?.[0].finding).toBe("Rates peaked");
    expect(r.structured?.sector_impacts?.[0].sector).toBe("Tech");
    expect(r.markdown).toContain("Macro is soft");
  });

  it("unwraps double-encoded JSON string", () => {
    const wrapped = JSON.stringify(
      JSON.stringify({ thesis: "Nested OK", key_findings: [] }),
    );
    const r = normalizeResearchContent(wrapped);
    expect(r.structured?.thesis).toContain("Nested OK");
  });

  it("falls back to markdown when not JSON", () => {
    const r = normalizeResearchContent("## Hello\n\nWorld");
    expect(r.markdown).toContain("Hello");
    expect(r.structured).toBeUndefined();
  });
});
