/**
 * Research content normalization.
 *
 * The backend may emit `content` as:
 *  1. Clean markdown prose (ideal path)
 *  2. A JSON string (dict serialized from LLM structured output)
 *  3. A JSON-like string with loose formatting
 *
 * This module normalizes all three into a typed `NormalizedReport`
 * so the rendering layer never has to deal with raw JSON.
 */

export type KeyFinding = {
  finding: string;
  data_support?: string;
  implication?: string;
};

export type SectorImpact = {
  sector: string;
  impact: string;
  direction?: string;
};

export type NormalizedReport = {
  /** Full markdown prose — always present, may be derived from structured fields */
  markdown: string;
  /** Structured sections — only present when the payload was a JSON dict */
  structured?: {
    thesis?: string;
    key_findings?: KeyFinding[];
    sector_impacts?: SectorImpact[];
    portfolio_implications?: string[];
    risks?: string[];
    conclusion?: string;
    recommended_action?: string;
  };
};

function safeParseJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  // Remove common LLM artifacts: leading/trailing fences, parentheses
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^\(\s*/, "")
    .replace(/\s*\)$/, "");

  if (!cleaned.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // Near-JSON: trim trailing prose after the closing `}` (LLM chatter)
    const end = cleaned.lastIndexOf("}");
    if (end > 1) {
      try {
        const parsed = JSON.parse(cleaned.slice(0, end + 1));
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toStringArray(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === "string") return [val];
  if (Array.isArray(val)) {
    return val.map((v) =>
      typeof v === "object" && v !== null
        ? Object.values(v).filter(Boolean).join(" — ")
        : String(v ?? ""),
    ).filter(Boolean);
  }
  return [];
}

function toKeyFindings(val: unknown): KeyFinding[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => {
      if (typeof item === "string") return { finding: item };
      if (typeof item === "object" && item !== null) {
        const o = item as Record<string, unknown>;
        return {
          finding: String(o.finding ?? o.text ?? o.description ?? ""),
          data_support: o.data_support ? String(o.data_support) : undefined,
          implication: o.implication ? String(o.implication) : undefined,
        };
      }
      return null;
    })
    .filter((f): f is KeyFinding => f !== null && f.finding.length > 0);
}

function toSectorImpacts(val: unknown): SectorImpact[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => {
      if (typeof item === "object" && item !== null) {
        const o = item as Record<string, unknown>;
        return {
          sector: String(o.sector ?? o.name ?? ""),
          impact: String(o.impact ?? o.description ?? ""),
          direction: o.direction ? String(o.direction) : undefined,
        };
      }
      return null;
    })
    .filter((s): s is SectorImpact => s !== null && s.sector.length > 0);
}

function structuredToMarkdown(data: Record<string, unknown>): string {
  const parts: string[] = [];

  const thesis = data.thesis ?? data.executive_summary;
  if (typeof thesis === "string" && thesis.trim()) {
    parts.push(thesis.trim());
    parts.push("");
  }

  const findings = toKeyFindings(data.key_findings);
  if (findings.length) {
    parts.push("## Key Findings\n");
    for (const f of findings) {
      parts.push(`- **${f.finding}**`);
      if (f.data_support) parts.push(`  *${f.data_support}*`);
      if (f.implication) parts.push(`  → ${f.implication}`);
    }
    parts.push("");
  }

  const impacts = toSectorImpacts(data.sector_impacts);
  if (impacts.length) {
    parts.push("## Sector Impacts\n");
    for (const s of impacts) {
      const dir = s.direction ? ` (${s.direction})` : "";
      parts.push(`- **${s.sector}${dir}**: ${s.impact}`);
    }
    parts.push("");
  }

  const implications = toStringArray(data.portfolio_implications);
  if (implications.length) {
    parts.push("## Portfolio Implications\n");
    implications.forEach((i) => parts.push(`- ${i}`));
    parts.push("");
  }

  const risks = toStringArray(data.risks);
  if (risks.length) {
    parts.push("## Risk Factors\n");
    risks.forEach((r) => parts.push(`- ${r}`));
    parts.push("");
  }

  const conclusion = data.conclusion ?? data.recommended_action;
  if (typeof conclusion === "string" && conclusion.trim()) {
    parts.push("## Conclusion\n");
    parts.push(conclusion.trim());
  }

  return parts.join("\n").trim();
}

/**
 * Normalize raw content from the API into a `NormalizedReport`.
 * Never throws — falls back to treating the raw string as markdown.
 */
export function normalizeResearchContent(
  rawContent: string | null | undefined,
  executiveSummary?: string,
): NormalizedReport {
  const raw = (rawContent ?? "").trim();

  if (!raw) {
    return { markdown: executiveSummary ?? "" };
  }

  // Attempt JSON parse
  const parsed = safeParseJson(raw);
  if (parsed) {
    const structured = {
      thesis: parsed.thesis
        ? String(parsed.thesis)
        : parsed.executive_summary
          ? String(parsed.executive_summary)
          : undefined,
      key_findings: toKeyFindings(parsed.key_findings),
      sector_impacts: toSectorImpacts(parsed.sector_impacts),
      portfolio_implications: toStringArray(parsed.portfolio_implications),
      risks: toStringArray(parsed.risks),
      conclusion: parsed.conclusion ? String(parsed.conclusion) : undefined,
      recommended_action: parsed.recommended_action
        ? String(parsed.recommended_action)
        : undefined,
    };
    const markdown = structuredToMarkdown(parsed) || executiveSummary || "";
    return { markdown, structured };
  }

  // Already markdown or plain text — pass through
  return { markdown: raw };
}
