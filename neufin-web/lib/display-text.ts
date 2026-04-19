/**
 * Defensive display helpers so UI never shows raw JSON blobs from LLM/API glitches.
 */

/** If the whole field is a JSON object string, pull a human-readable string out. */
export function unwrapAccidentalJsonObjectString(input: string): string {
  const t = (input ?? "").trim();
  if (!t.startsWith("{")) return input;
  try {
    const p = JSON.parse(t) as Record<string, unknown>;
    const keys = [
      "recommendation",
      "text",
      "summary",
      "executive_summary",
      "message",
      "body",
    ] as const;
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {
    /* keep original */
  }
  return input;
}

/** Parse JSON array string or return a one-line fallback. */
export function parseStringListField(value: string): string[] {
  const t = value.trim();
  if (t.startsWith("[")) {
    try {
      const j = JSON.parse(t) as unknown;
      if (Array.isArray(j)) {
        return j.map((x) => String(x ?? "").trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return value ? [value] : [];
}
