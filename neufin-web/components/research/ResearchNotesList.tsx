"use client";

import { useState } from "react";
import Link from "next/link";

type ResearchNoteRow = {
  id: string;
  title: string;
  executive_summary: string;
  note_type: string;
  regime?: string | null;
  region?: string | null;
  confidence_score?: number | null;
  generated_at?: string;
};

function regimePillLabel(r: string | null | undefined) {
  if (!r) return "Neutral";
  const m: Record<string, string> = {
    risk_on: "Risk-On",
    risk_off: "Risk-Off",
    neutral: "Neutral",
    stagflation: "Stagflation",
    recovery: "Recovery",
    recession: "Recession",
  };
  const k = r.toLowerCase().replace(/\s+/g, "_");
  return m[k] || r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function regimePillClass(r: string | null | undefined) {
  const k = (r || "").toLowerCase();
  if (k.includes("risk_on") || k === "recovery")
    return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (k.includes("risk_off") || k.includes("recession"))
    return "bg-red-100 text-red-700 border-red-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

type FilterId = "all" | "vn_sea";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All regions" },
  { id: "vn_sea", label: "Vietnam / SEA" },
];

function isVnSea(note: ResearchNoteRow) {
  const region = (note.region ?? "").toLowerCase();
  const title = (note.title ?? "").toLowerCase();
  const summary = (note.executive_summary ?? "").toLowerCase();
  return (
    region === "vn" ||
    region === "sea" ||
    region.includes("vietnam") ||
    region.includes("asean") ||
    title.includes("vietnam") ||
    title.includes("vn-index") ||
    title.includes("hose") ||
    summary.includes("vn-index") ||
    summary.includes("vietnam")
  );
}

export function ResearchNotesList({ notes }: { notes: ResearchNoteRow[] }) {
  const [filter, setFilter] = useState<FilterId>("all");

  const vnSeaCount = notes.filter(isVnSea).length;
  const filtered = filter === "vn_sea" ? notes.filter(isVnSea) : notes;
  const showVnContext = filter === "vn_sea" && filtered.length > 0;

  return (
    <div>
      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const badge = f.id === "vn_sea" ? vnSeaCount : null;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-white"
                  : "border-border/60 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              ].join(" ")}
            >
              {f.label}
              {badge !== null && (
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    active ? "bg-white/20" : "bg-primary/10 text-primary",
                  ].join(" ")}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* VN-Index context banner */}
      {showVnContext && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#0EA5E9]/30 bg-[#0EA5E9]/6 px-3 py-2 text-xs text-[#0284C7]">
          <span>🇻🇳</span>
          <span>
            Showing Vietnam / SEA memos — regime benchmarked against{" "}
            <strong>VN-Index</strong> and ASEAN macro signals.
          </span>
        </div>
      )}

      {/* Notes list */}
      <h2 className="sr-only">Research notes</h2>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
          {filter === "vn_sea"
            ? "No Vietnam / SEA research memos yet — check back as agents publish regional analysis."
            : "No public notes yet. Check back soon — the feed populates as agents publish."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <article
              key={n.id}
              className="rounded-xl border border-border/60 bg-surface/40 p-5 transition-colors hover:border-primary/30"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-sm font-medium ${regimePillClass(n.regime)}`}
                >
                  {regimePillLabel(n.regime)}
                </span>
                {isVnSea(n) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#0EA5E9]/40 bg-[#0EA5E9]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0284C7]">
                    🇻🇳 VN-Index
                  </span>
                )}
                <span className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                  Generated by NeuFin Synthesis Agent
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold leading-snug text-foreground">
                {n.title}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {n.executive_summary}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {n.generated_at
                    ? new Date(n.generated_at).toLocaleDateString("en-SG", {
                        dateStyle: "medium",
                      })
                    : "—"}
                </span>
                <Link
                  href={`/research/${n.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  Read more →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
