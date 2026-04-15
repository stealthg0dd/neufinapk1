"use client";

import { useEffect, useMemo, useState } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { Info, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiPost } from "@/lib/api-client";

/** Stable ids mapped to backend `financial_modes` (not raw model names). */
export const FINANCIAL_MODE_IDS = [
  "alpha",
  "risk",
  "forecast",
  "macro",
  "allocation",
  "trading",
  "institutional",
] as const;

export type FinancialModeId = (typeof FINANCIAL_MODE_IDS)[number];

const MODES: {
  id: FinancialModeId;
  title: string;
  tooltip: string;
}[] = [
  {
    id: "alpha",
    title: "Alpha generation",
    tooltip:
      "Prioritizes return drivers and relative performance signals. Typically raises tracking of opportunities; may add sleeve turnover in the near term.",
  },
  {
    id: "risk",
    title: "Risk minimization",
    tooltip:
      "Emphasizes drawdown control and diversification. Expected to lower path volatility; may trim concentration in crowded names.",
  },
  {
    id: "forecast",
    title: "Volatility outlook",
    tooltip:
      "Focuses on near-term dispersion and range estimates. Useful when allocators need a clearer band around expected outcomes.",
  },
  {
    id: "macro",
    title: "Macro regime",
    tooltip:
      "Aligns positioning with the prevailing macro cycle narrative and policy path, anchoring sleeves to regime-sensitive factors.",
  },
  {
    id: "allocation",
    title: "Long-term allocation",
    tooltip:
      "Optimizes strategic weights for multi-year horizons; changes appear gradually and aim at policy-level stability.",
  },
  {
    id: "trading",
    title: "Short-term trading",
    tooltip:
      "Surfaces tactical timing and shorter lookback signals. May increase responsiveness to price dislocations.",
  },
  {
    id: "institutional",
    title: "Hybrid institutional",
    tooltip:
      "Blends strategic discipline with tactical overlays — the default for audit-friendly, committee-ready analytics.",
  },
];

/** Heuristic deltas for preview when API is unavailable (expected vs. neutral baseline). */
const HEURISTIC: Record<
  FinancialModeId,
  { sharpe: number; volPct: number; ddPct: number; dna: number }
> = {
  alpha: { sharpe: 0.06, volPct: 0.8, ddPct: 1.1, dna: 1.5 },
  risk: { sharpe: -0.02, volPct: -5.5, ddPct: -4.2, dna: 3 },
  forecast: { sharpe: 0.02, volPct: -1.2, ddPct: 0.4, dna: 0.8 },
  macro: { sharpe: 0.03, volPct: -0.5, ddPct: -0.3, dna: 1.2 },
  allocation: { sharpe: 0.04, volPct: -2.0, ddPct: -1.5, dna: 2 },
  trading: { sharpe: 0.02, volPct: 1.5, ddPct: 2.0, dna: -0.5 },
  institutional: { sharpe: 0.05, volPct: -1.0, ddPct: -1.0, dna: 2.5 },
};

function mergePreview(selected: Set<string>) {
  const keys = [...selected].filter((k): k is FinancialModeId =>
    FINANCIAL_MODE_IDS.includes(k as FinancialModeId),
  );
  if (keys.length === 0) {
    keys.push("institutional");
  }
  let sharpe = 0;
  let vol = 0;
  let dd = 0;
  let dna = 0;
  for (const k of keys) {
    const h = HEURISTIC[k];
    sharpe += h.sharpe;
    vol += h.volPct;
    dd += h.ddPct;
    dna += h.dna;
  }
  const n = keys.length;
  return {
    sharpe: sharpe / n,
    volatilityPct: vol / n,
    drawdownPct: dd / n,
    dnaPoints: dna / n,
  };
}

type QuantApiResult = {
  risk_adjusted_metrics?: {
    sharpe_proxy?: number;
    volatility_annualized_proxy?: number;
    max_drawdown_proxy?: number;
  };
  alpha_score?: number;
};

export type FinancialModelSelectorProps = {
  /** When set, preview can call the quant API for server-aligned metrics. */
  portfolioId?: string | null;
  className?: string;
  /** Collapse the entire panel (e.g. portfolio page keeps first paint minimal). */
  defaultCollapsed?: boolean;
};

export default function FinancialModelSelector({
  portfolioId: portfolioIdProp,
  className = "",
  defaultCollapsed = false,
}: FinancialModelSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["institutional"]),
  );
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [apiPreview, setApiPreview] = useState<QuantApiResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const portfolioId = usePortfolioIdFromPropOrStorage(portfolioIdProp);

  const heuristic = useMemo(() => mergePreview(selected), [selected]);

  /** Load preferences from Supabase user_preferences.quant_models */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          const raw =
            typeof window !== "undefined"
              ? localStorage.getItem("neufin-quant-modes")
              : null;
          if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSelected(new Set(parsed.map(String)));
            }
          }
          setLoaded(true);
          return;
        }
        const { data, error } = await supabase
          .from("user_preferences")
          .select("quant_models")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (cancelled) return;
        if (
          !error &&
          data?.quant_models &&
          Array.isArray(data.quant_models) &&
          data.quant_models.length > 0
        ) {
          setSelected(new Set(data.quant_models.map(String)));
        }
        setLoaded(true);
      } catch {
        const raw =
          typeof window !== "undefined"
            ? localStorage.getItem("neufin-quant-modes")
            : null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSelected(new Set(parsed.map(String)));
            }
          } catch {
            /* ignore */
          }
        }
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Persist debounced */
  useEffect(() => {
    if (!loaded) return;
    const modes = [...selected];
    const t = window.setTimeout(() => {
      void (async () => {
        setSaveStatus("saving");
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user?.id) {
            const { error } = await supabase.from("user_preferences").upsert(
              {
                user_id: session.user.id,
                quant_models: modes,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );
            if (error) throw error;
          }
          try {
            localStorage.setItem("neufin-quant-modes", JSON.stringify(modes));
          } catch {
            /* ignore */
          }
          setSaveStatus("saved");
          window.setTimeout(() => setSaveStatus("idle"), 1600);
        } catch {
          try {
            localStorage.setItem("neufin-quant-modes", JSON.stringify(modes));
          } catch {
            /* ignore */
          }
          setSaveStatus("error");
          window.setTimeout(() => setSaveStatus("idle"), 2500);
        }
      })();
    }, 550);
    return () => window.clearTimeout(t);
  }, [selected, loaded]);

  /** Server preview when portfolio exists */
  useEffect(() => {
    if (!portfolioId || selected.size === 0) {
      setApiPreview(null);
      return;
    }
    let cancelled = false;
    const modes = [...selected];
    setPreviewLoading(true);
    const run = async () => {
      try {
        const res = await apiPost<{ result: QuantApiResult }>(
          "/api/quant/analyze",
          {
            portfolio_id: portfolioId,
            financial_modes: modes,
          },
        );
        if (!cancelled) setApiPreview(res.result ?? null);
      } catch {
        if (!cancelled) setApiPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    const t = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [portfolioId, selected]);

  const preview = useMemo(() => {
    const ram = apiPreview?.risk_adjusted_metrics;
    if (
      ram &&
      (ram.sharpe_proxy != null || ram.volatility_annualized_proxy != null)
    ) {
      const baseSharpe = 0.45;
      const baseVol = 0.14;
      const baseDd = 0.1;
      const baseDna = 72.0;
      const sharpe = (ram.sharpe_proxy ?? baseSharpe) - baseSharpe;
      const vol =
        ((ram.volatility_annualized_proxy ?? baseVol) - baseVol) * 100;
      const dd = ((ram.max_drawdown_proxy ?? baseDd) - baseDd) * 100;
      const dna = (apiPreview?.alpha_score ?? baseDna) - baseDna;
      return {
        sharpe,
        volatilityPct: vol,
        drawdownPct: dd,
        dnaPoints: dna,
        source: "server" as const,
      };
    }
    return {
      sharpe: heuristic.sharpe,
      volatilityPct: heuristic.volatilityPct,
      drawdownPct: heuristic.drawdownPct,
      dnaPoints: heuristic.dnaPoints,
      source: "heuristic" as const,
    };
  }, [apiPreview, heuristic]);

  const toggle = (id: FinancialModeId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return next;
        next.delete(id);
        return next;
      }
      next.add(id);
      return next;
    });
  };

  return (
    <section
      className={`rounded-xl border border-[#E2E8F0] bg-white shadow-sm ${className}`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3 text-left md:px-5"
      >
        <div className="flex items-center gap-2">
          <Sparkles
            className="h-4 w-4 text-primary"
            strokeWidth={1.75}
            aria-hidden
          />
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Financial Model Studio
            </h2>
            <p className="text-xs text-[#64748B]">
              Choose analytical objectives — multi-select
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-[#94A3B8]">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-5 px-4 py-4 md:px-5 md:py-5">
          <RadixTooltip.Provider delayDuration={200}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {MODES.map((m) => {
                const active = selected.has(m.id);
                return (
                  <RadixTooltip.Root key={m.id}>
                    <RadixTooltip.Trigger asChild>
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        className={[
                          "relative flex min-h-[76px] flex-col rounded-lg border px-3 py-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary-light/80 text-[#0F172A] shadow-sm"
                            : "border-[#E2E8F0] bg-[#FAFBFC] text-[#334155] hover:border-primary/35 hover:bg-white",
                        ].join(" ")}
                      >
                        <span className="text-sm font-semibold leading-snug">
                          {m.title}
                        </span>
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#64748B]">
                          <Info
                            className="h-3 w-3 shrink-0 opacity-70"
                            aria-hidden
                          />
                          Why this matters
                        </span>
                      </button>
                    </RadixTooltip.Trigger>
                    <RadixTooltip.Portal>
                      <RadixTooltip.Content
                        className="z-[10050] max-w-[260px] rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-xs leading-relaxed text-[#334155] shadow-lg"
                        sideOffset={6}
                      >
                        {m.tooltip}
                        <RadixTooltip.Arrow className="fill-white" />
                      </RadixTooltip.Content>
                    </RadixTooltip.Portal>
                  </RadixTooltip.Root>
                );
              })}
            </div>
          </RadixTooltip.Provider>

          <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
                Preview impact
              </h3>
              {previewLoading && (
                <span className="text-xs text-[#94A3B8]">Updating…</span>
              )}
              {saveStatus === "saving" && (
                <span className="text-xs text-[#94A3B8]">Saving…</span>
              )}
              {saveStatus === "saved" && (
                <span className="text-xs text-emerald-600">Saved</span>
              )}
              {saveStatus === "error" && (
                <span className="text-xs text-amber-700">Saved locally</span>
              )}
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-[#64748B]">
              Illustrative shifts vs. a neutral baseline for your current
              selection
              {preview.source === "server"
                ? " (aligned to live quant mix)."
                : " (heuristic preview)."}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewPill
                label="Sharpe (exp.)"
                value={formatSigned(preview.sharpe, 2)}
              />
              <PreviewPill
                label="Volatility"
                value={formatSignedPct(preview.volatilityPct)}
                accent="vol"
              />
              <PreviewPill
                label="Drawdown"
                value={formatSignedPct(preview.drawdownPct)}
                accent="dd"
              />
              <PreviewPill
                label="DNA score"
                value={formatSigned(preview.dnaPoints, 1)}
                accent="dna"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PreviewPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "vol" | "dd" | "dna";
}) {
  return (
    <div className="rounded-md border border-[#E2E8F0] bg-white px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </div>
      <div
        className={[
          "mt-1 tabular-nums text-sm font-semibold",
          accent === "vol"
            ? "text-[#0F172A]"
            : accent === "dd"
              ? "text-[#0F172A]"
              : "text-[#0F172A]",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function formatSigned(n: number, digits: number) {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}`;
}

function formatSignedPct(n: number) {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(1)}%`;
}

function usePortfolioIdFromPropOrStorage(prop?: string | null): string | null {
  const [id, setId] = useState<string | null>(prop ?? null);
  useEffect(() => {
    if (prop) {
      setId(prop);
      return;
    }
    try {
      const raw = localStorage.getItem("dnaResult");
      const j = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      const pid = (j?.portfolio_id ?? j?.record_id) as string | undefined;
      if (typeof pid === "string" && pid.length > 0) setId(pid);
    } catch {
      /* ignore */
    }
  }, [prop]);
  return id;
}
