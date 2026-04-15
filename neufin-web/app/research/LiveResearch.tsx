"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL;

interface MarketRegime {
  regime: string;
  confidence: number;
  started_at: string;
}

interface ResearchNote {
  id: string;
  note_type: string;
  title: string;
  executive_summary: string;
  regime?: string;
  time_horizon?: string;
  confidence_score?: number;
  generated_at: string;
  is_public: boolean;
}

const REGIME_COLORS: Record<string, string> = {
  risk_on: "text-emerald-800 bg-emerald-50 border-emerald-200",
  risk_off: "text-red-800 bg-red-50 border-red-200",
  stagflation: "text-amber-900 bg-amber-50 border-amber-200",
  recovery: "text-sky-800 bg-sky-50 border-sky-200",
  recession_risk: "text-yellow-900 bg-yellow-50 border-yellow-200",
};

const REGIME_LABELS: Record<string, string> = {
  risk_on: "Risk-On",
  risk_off: "Risk-Off",
  stagflation: "Stagflation",
  recovery: "Recovery",
  recession_risk: "Recession Risk",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function NoteTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    macro_outlook: "Macro Outlook",
    sector_analysis: "Sector Analysis",
    regime_change: "Regime Change",
    risk_alert: "Risk Alert",
  };
  return (
    <span className="text-sm text-muted2">
      {labels[type] ?? type.replace(/_/g, " ")}
    </span>
  );
}

export default function LiveResearch() {
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [regimeRes, notesRes] = await Promise.all([
          fetch(`${API}/api/research/regime`, { cache: "no-store" }),
          fetch(`${API}/api/research/notes?per_page=3`, { cache: "no-store" }),
        ]);
        if (regimeRes.ok) setRegime(await regimeRes.json());
        if (notesRes.ok) {
          const data = await notesRes.json();
          setNotes((data.notes ?? data ?? []).slice(0, 3));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {regime && (
        <div
          className={`rounded-2xl border p-6 ${REGIME_COLORS[regime.regime] ?? "border-border bg-white text-navy"}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted2">
                Current Market Regime
              </p>
              <p className="text-2xl font-bold text-navy">
                {REGIME_LABELS[regime.regime] ?? regime.regime}
              </p>
              <p className="mt-1 text-sm text-slate2">
                Confidence: {(regime.confidence * 100).toFixed(0)}% · Active
                since {formatDate(regime.started_at)}
              </p>
            </div>
            <div className="text-right">
              <div className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-slate2">
                Live Signal
              </div>
            </div>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-navy">Latest Research</h3>
            <Link
              href="/auth?next=/research"
              className="text-sm font-medium text-primary hover:underline"
            >
              Sign in for full access →
            </Link>
          </div>
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/research/${note.id}`}
              className="group block rounded-xl border border-border bg-white p-5 shadow-sm transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <NoteTypeLabel type={note.note_type} />
                    {note.regime && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${REGIME_COLORS[note.regime] ?? "border-border bg-surface-2 text-muted2"}`}
                      >
                        {REGIME_LABELS[note.regime] ?? note.regime}
                      </span>
                    )}
                    {note.time_horizon && (
                      <span className="text-sm text-muted2">
                        {note.time_horizon.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-navy transition-colors group-hover:text-primary-dark">
                    {note.title}
                  </h4>
                  <p className="line-clamp-2 text-sm leading-relaxed text-slate2">
                    {note.executive_summary}
                  </p>
                </div>
                <div className="flex-shrink-0 space-y-1 text-right">
                  <p className="text-sm text-muted2">
                    {formatDate(note.generated_at)}
                  </p>
                  {note.confidence_score && (
                    <p className="text-sm text-muted2">
                      {(note.confidence_score * 100).toFixed(0)}% confidence
                    </p>
                  )}
                  <span className="text-sm font-medium text-primary group-hover:underline">
                    Read →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {notes.length === 0 && !regime && (
        <div className="rounded-xl border border-dashed border-border bg-white p-8 text-center">
          <p className="text-sm text-muted2">
            Live research data will appear here once the intelligence layer is
            active.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary-light/30 p-6 text-center">
        <p className="font-semibold text-navy">
          Access All Research Intelligence
        </p>
        <p className="text-sm text-slate2">
          Semantic search, macro signals, sector analysis, and daily
          AI-generated research notes. Available on Retail plan and above.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth"
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Sign up free
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-muted2 transition-colors hover:text-navy"
          >
            See all plans →
          </Link>
        </div>
      </div>
    </div>
  );
}
