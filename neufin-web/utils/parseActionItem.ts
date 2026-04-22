export type ParsedActionItem = {
  action: string;
  rationale: string;
  time_horizon: string;
  severity: "HIGH" | "MEDIUM" | "LOW" | "INFO";
};

function normalizeSeverity(raw: unknown): ParsedActionItem["severity"] {
  const value = String(raw ?? "MEDIUM").toUpperCase();
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
  return "INFO";
}

export function parseActionItem(raw: string | object): ParsedActionItem {
  if (typeof raw === "object" && raw !== null) {
    const parsed = raw as Record<string, unknown>;
    return {
      action: String(parsed.action ?? parsed.text ?? ""),
      rationale: String(parsed.rationale ?? parsed.why ?? ""),
      time_horizon: String(parsed.time_horizon ?? parsed.horizon ?? ""),
      severity: normalizeSeverity(parsed.severity ?? parsed.priority),
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      action: String(parsed.action ?? parsed.text ?? raw),
      rationale: String(parsed.rationale ?? parsed.why ?? ""),
      time_horizon: String(parsed.time_horizon ?? parsed.horizon ?? ""),
      severity: normalizeSeverity(parsed.severity ?? parsed.priority),
    };
  } catch {
    return {
      action: String(raw),
      rationale: "",
      time_horizon: "",
      severity: "INFO",
    };
  }
}
