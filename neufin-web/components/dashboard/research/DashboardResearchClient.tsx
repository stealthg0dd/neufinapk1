"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import GlobalMacroMap from "@/components/GlobalMacroMap";
import RegimeHeatmap from "@/components/RegimeHeatmap";
import { usePortfolioIntelligence } from "@/components/dashboard/PortfolioIntelligenceContext";
import type { ResearchNote } from "@/lib/api";
import { formatRegimeLabel } from "@/lib/regime-display";
import { toDisplayResearchNote } from "@/lib/research-note-display";
import {
  buildRelevanceContext,
  categorizeResearchNote,
  sortByPortfolioRelevance,
} from "@/lib/research-personalization";
import { getSavedResearchIds } from "@/lib/research-saved";
import { ResearchIntelligenceCard } from "@/components/dashboard/research/ResearchIntelligenceCard";
import { apiGet } from "@/lib/api-client";
import type { RegimeData } from "@/hooks/usePortfolioData";

type GlobalMapPayload = {
  regime?: string;
  regions?: Array<{
    region: string;
    sentiment: number;
    volatility: number;
    regime: string;
    latest_signal?: {
      title?: string;
      signal_type?: string;
      value?: number;
      date?: string;
    };
  }>;
};

type RegimeHeatmapPayload = {
  timeline?: string[];
  regions?: string[];
  cells?: Array<{
    time: string;
    region: string;
    regime_state: string;
    intensity: number;
  }>;
};

type RegimePayload = {
  current?: {
    regime?: string;
    confidence?: number;
    started_at?: string | null;
  };
  recent_history?: Array<{
    regime?: string;
    started_at?: string;
    confidence?: number | null;
  }>;
};

function regimeSlugFrom(r: RegimeData | null): string | null {
  if (!r) return null;
  const raw = r.current?.regime ?? r.regime ?? r.label;
  if (!raw || raw === "unknown") return null;
  return String(raw).toLowerCase().replace(/\s+/g, "_");
}

const NAV = [
  { href: "#ri-latest", label: "Latest" },
  { href: "#ri-regime", label: "Regime" },
  { href: "#ri-sector", label: "Sectors" },
  { href: "#ri-macro", label: "Macro watch" },
  { href: "#ri-you", label: "For your book" },
  { href: "#ri-saved", label: "Saved" },
] as const;

export default function DashboardResearchClient() {
  const {
    latestPortfolio,
    hasPortfolio,
    latestDna,
    regime,
    loading: portfolioLoading,
  } = usePortfolioIntelligence();

  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [deskRegime, setDeskRegime] = useState<RegimePayload | null>(null);
  const [globalMap, setGlobalMap] = useState<GlobalMapPayload | null>(null);
  const [regimeHeatmap, setRegimeHeatmap] = useState<RegimeHeatmapPayload | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [savedTick, setSavedTick] = useState(0);

  const reloadSaved = useCallback(() => setSavedTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [nRes, rRes, gmRes, rhRes] = await Promise.allSettled([
          apiGet<{ notes?: ResearchNote[] }>(
            "/api/research/notes?per_page=40&page=1",
          ).catch(() => ({ notes: [] as ResearchNote[] })),
          apiGet<RegimePayload>("/api/research/regime").catch(() => null),
          apiGet<GlobalMapPayload>("/api/research/global-map?days=30").catch(
            () => null,
          ),
          apiGet<RegimeHeatmapPayload>(
            "/api/research/regime-heatmap?days=60",
          ).catch(() => null),
        ]);

        if (cancelled) return;
        if (nRes.status === "fulfilled") {
          setNotes(nRes.value.notes ?? []);
        }
        if (rRes.status === "fulfilled" && rRes.value) {
          setDeskRegime(rRes.value);
        }
        if (gmRes.status === "fulfilled") setGlobalMap(gmRes.value);
        if (rhRes.status === "fulfilled") setRegimeHeatmap(rhRes.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const savedIds = useMemo(() => {
    void savedTick;
    return new Set(getSavedResearchIds());
  }, [savedTick]);

  const relevanceCtx = useMemo(
    () =>
      buildRelevanceContext({
        regimeSlug: regimeSlugFrom(regime),
        portfolioSummaryText: [
          latestDna?.recommendation,
          latestPortfolio?.portfolio_name ?? latestPortfolio?.name,
        ]
          .filter(Boolean)
          .join(" "),
        dnaStrengthsWeaknesses: [
          ...(latestDna?.strengths ?? []),
          ...(latestDna?.weaknesses ?? []),
        ],
      }),
    [regime, latestDna, latestPortfolio],
  );

  const scored = useMemo(
    () => sortByPortfolioRelevance(notes, relevanceCtx),
    [notes, relevanceCtx],
  );

  const sortedLatest = useMemo(
    () =>
      [...notes].sort(
        (a, b) =>
          new Date(b.generated_at).getTime() -
          new Date(a.generated_at).getTime(),
      ),
    [notes],
  );

  const regimeNotes = useMemo(
    () => notes.filter((n) => categorizeResearchNote(n).has("regime")),
    [notes],
  );
  const sectorNotes = useMemo(
    () => notes.filter((n) => categorizeResearchNote(n).has("sector")),
    [notes],
  );
  const macroNotes = useMemo(
    () => notes.filter((n) => categorizeResearchNote(n).has("macro")),
    [notes],
  );
  const forYou = useMemo(
    () => scored.filter((s) => s.score >= 38).slice(0, 10),
    [scored],
  );
  const savedNotes = useMemo(
    () => notes.filter((n) => savedIds.has(n.id)),
    [notes, savedIds],
  );

  const cur = deskRegime?.current;
  const hist = deskRegime?.recent_history ?? [];

  if (portfolioLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-readable">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading portfolio context…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-label text-primary">Research desk</p>
          <h1 className="text-2xl font-bold text-navy">
            Portfolio-aware intelligence
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-readable">
            Same live feed as the public hub, reorganized for how committees
            consume risk — with relevance to your regime and book, read-later,
            and one-click bridges into portfolio, Swarm, and reports.
          </p>
        </div>
        <Link
          href="/research"
          className="rounded-lg border border-primary/35 bg-primary-light/50 px-4 py-2 text-sm font-semibold text-primary-dark transition-colors hover:bg-primary-light"
        >
          Open public hub →
        </Link>
      </header>

      <section
        className="rounded-xl border border-border bg-surface-2/80 p-4"
        aria-label="Your portfolio context"
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-navy">Your context</span>
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${regime ? "border-primary/30 bg-primary-light/60 text-primary-dark" : "border-border bg-white text-readable"}`}>
            Regime: {formatRegimeLabel(regime)}
          </span>
          {hasPortfolio ? (
            <span className="text-readable">
              Book:{" "}
              <strong className="text-navy">
                {latestPortfolio?.portfolio_name ??
                  latestPortfolio?.name ??
                  "Portfolio"}
              </strong>
              {latestDna?.weighted_beta != null && (
                <span className="ml-2 tabular-nums">
                  · β {latestDna.weighted_beta.toFixed(2)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-readable">
              Upload a portfolio to unlock personalized relevance scoring.
            </span>
          )}
          <Link
            href="/dashboard/portfolio"
            className="ml-auto text-sm font-semibold text-primary hover:underline"
          >
            Manage portfolio →
          </Link>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <GlobalMacroMap regions={globalMap?.regions ?? []} />
        <RegimeHeatmap
          timeline={regimeHeatmap?.timeline ?? []}
          regions={regimeHeatmap?.regions ?? []}
          cells={regimeHeatmap?.cells ?? []}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border border-border bg-white p-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-readable">
            Desk regime (feed)
          </h2>
          <p className="mt-2 text-lg font-semibold capitalize text-navy">
            {cur?.regime
              ? String(cur.regime).replace(/_/g, " ")
              : formatRegimeLabel(regime)}
          </p>
          {typeof cur?.confidence === "number" && (
            <p className="text-sm text-readable">
              Confidence:{" "}
              {cur.confidence <= 1
                ? Math.round(cur.confidence * 100)
                : Math.round(cur.confidence)}
              %
            </p>
          )}
        </div>
        {hist.length > 0 && (
          <div className="rounded-lg border border-border bg-white p-4">
            <h2 className="text-xs font-mono uppercase tracking-widest text-readable">
              Recent regime history
            </h2>
            <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-xs text-readable">
              {hist.slice(0, 6).map((h, i) => (
                <li
                  key={`${h.started_at ?? i}`}
                  className="flex justify-between gap-2 border-b border-border-light pb-2 last:border-0"
                >
                  <span className="capitalize text-navy">
                    {(h.regime ?? "—").replace(/_/g, " ")}
                  </span>
                  <span className="shrink-0 font-mono">
                    {h.started_at
                      ? new Date(h.started_at).toLocaleDateString("en-SG", {
                          dateStyle: "medium",
                        })
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <nav
        className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-2 border-b border-border bg-app/95 px-1 py-3 backdrop-blur-sm"
        aria-label="Research sections"
      >
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-primary/40 hover:text-primary"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-readable">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading intelligence feed…
        </div>
      ) : notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center text-sm text-readable">
          No research notes loaded yet. When the synthesis desk publishes, they
          will appear here with portfolio-aware ranking.
        </p>
      ) : (
        <>
          <ResearchSection
            id="ri-latest"
            title="Latest intelligence"
            subtitle="Newest synthesis first — regime, factor, and risk commentary."
            notes={sortedLatest}
            scored={scored}
            onSaveChange={reloadSaved}
          />
          <ResearchSection
            id="ri-regime"
            title="Regime updates"
            subtitle="Macro state, rates, and risk-on / risk-off transitions."
            notes={regimeNotes}
            scored={scored}
            onSaveChange={reloadSaved}
          />
          <ResearchSection
            id="ri-sector"
            title="Sector shifts"
            subtitle="Rotation, earnings leverage, and thematic risk."
            notes={sectorNotes}
            scored={scored}
            onSaveChange={reloadSaved}
          />
          <ResearchSection
            id="ri-macro"
            title="Macro watch"
            subtitle="Inflation, growth, and cross-asset signals."
            notes={macroNotes}
            scored={scored}
            onSaveChange={reloadSaved}
          />
          <section id="ri-you" className="scroll-mt-28 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-navy">
                Recommended for your portfolio
              </h2>
              <p className="text-sm text-readable">
                Ranked by regime match, sector overlap, and confidence. Plug in
                holdings to sharpen tickers (CSV DNA).
              </p>
            </div>
            <div className="grid gap-4">
              {forYou.length === 0 ? (
                <p className="text-sm text-readable">
                  Upload and analyze a portfolio to unlock stronger “for you”
                  matches.
                </p>
              ) : (
                forYou.map((s) => (
                  <ResearchIntelligenceCard
                    key={s.note.id}
                    display={toDisplayResearchNote(s.note)}
                    relevanceReasons={s.reasons}
                    relevanceScore={s.score}
                    onSaveChange={reloadSaved}
                  />
                ))
              )}
            </div>
          </section>
          <section id="ri-saved" className="scroll-mt-28 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-navy">Saved / read later</h2>
              <p className="text-sm text-readable">
                Stored on this device — sync to account is on the roadmap.
              </p>
            </div>
            {savedNotes.length === 0 ? (
              <p className="text-sm text-readable">
                Save items from any card — they will collect here.
              </p>
            ) : (
              <div className="grid gap-4">
                {savedNotes.map((n) => {
                  const sc = scored.find((x) => x.note.id === n.id);
                  return (
                    <ResearchIntelligenceCard
                      key={n.id}
                      display={toDisplayResearchNote(n)}
                      relevanceReasons={sc?.reasons}
                      relevanceScore={sc?.score}
                      onSaveChange={reloadSaved}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <p className="text-xs text-readable">
        Backend roadmap: attach explicit{" "}
        <code className="rounded bg-surface-2 px-1">why_portfolio_matters</code>
        , <code className="rounded bg-surface-2 px-1">portfolio_implications</code>
        , and benchmark tags on each note for tighter matching.
      </p>
    </div>
  );
}

function ResearchSection({
  id,
  title,
  subtitle,
  notes,
  scored,
  onSaveChange,
}: {
  id: string;
  title: string;
  subtitle: string;
  notes: ResearchNote[];
  scored: ReturnType<typeof sortByPortfolioRelevance>;
  onSaveChange: () => void;
}) {
  const scoreMap = useMemo(() => {
    const m = new Map<string, (typeof scored)[0]>();
    for (const s of scored) m.set(s.note.id, s);
    return m;
  }, [scored]);

  return (
    <section id={id} className="scroll-mt-28 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-navy">{title}</h2>
        <p className="text-sm text-readable">{subtitle}</p>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-readable">Nothing in this bucket yet.</p>
      ) : (
        <div className="grid gap-4">
          {notes.map((n) => {
            const sc = scoreMap.get(n.id);
            return (
              <ResearchIntelligenceCard
                key={n.id}
                display={toDisplayResearchNote(n)}
                relevanceReasons={sc?.reasons}
                relevanceScore={sc?.score}
                onSaveChange={onSaveChange}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
