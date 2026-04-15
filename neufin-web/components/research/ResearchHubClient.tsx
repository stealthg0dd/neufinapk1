"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Lock, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { GlassCard } from "@/components/ui/GlassCard";
import type { MarketRegime, ResearchNote } from "@/lib/api";

const REGIME_LABELS: Record<string, string> = {
  risk_on: "Risk-On",
  risk_off: "Risk-Off",
  stagflation: "Stagflation",
  recovery: "Recovery",
  recession_risk: "Recession Risk",
};

function typeStyle(t: string): string {
  if (t.includes("macro") || t.includes("regime"))
    return "border-primary/40 text-primary bg-primary/10";
  if (t.includes("sector"))
    return "border-primary/40 text-primary bg-primary/10";
  return "border-[var(--emerald)]/40 text-[var(--emerald)] bg-[var(--emerald)]/10";
}

function highlightText(text: string, q: string) {
  if (!q.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeReg(q)})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-primary/25 px-0.5 text-navy">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function ResearchHubClient({
  regime,
  notes,
}: {
  regime: MarketRegime | null;
  notes: ResearchNote[];
}) {
  const { getAccessToken } = useAuth();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchHits, setSearchHits] = useState<
    Array<{
      title?: string;
      summary?: string;
      similarity?: number;
      id?: string;
    }>
  >([]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setSearchErr(null);
    setSearchHits([]);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSearchErr(
          "Sign in with an Advisor plan to search the intelligence layer.",
        );
        return;
      }
      const res = await fetch("/api/research/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: q, limit: 8, search_type: "notes" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402 || res.status === 403) {
        setSearchErr("Advisor plan required for semantic search.");
        return;
      }
      if (!res.ok) {
        setSearchErr(
          typeof data.detail === "string" ? data.detail : "Search failed",
        );
        return;
      }
      const raw = data.results?.notes ?? [];
      setSearchHits(
        raw.map((n: Record<string, unknown>) => ({
          id: String(n.id ?? n.note_id ?? ""),
          title: String(n.title ?? ""),
          summary: String(n.executive_summary ?? n.content ?? ""),
          similarity:
            typeof n.similarity === "number" ? n.similarity : undefined,
        })),
      );
    } catch {
      setSearchErr("Network error");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-app text-navy">
      <nav className="sticky top-0 z-10 border-b border-border bg-white/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-sans text-lg text-primary">
            NeuFin
          </Link>
          <div className="flex gap-3 text-sm">
            <Link href="/blog" className="text-slate2 hover:text-navy">
              Blog
            </Link>
            <Link href="/upload" className="text-primary font-medium">
              DNA Score
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-section space-y-12">
        <header className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-wide text-muted2">
            Live intelligence
          </p>
          <h1 className="font-sans text-4xl md:text-5xl leading-tight">
            Current Regime:{" "}
            <span className="text-primary">
              {regime
                ? (REGIME_LABELS[regime.regime] ?? regime.regime)
                : "Loading…"}
            </span>
          </h1>
          {regime && (
            <>
              <div className="h-2 max-w-md overflow-hidden rounded-full bg-surface-3">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(regime.confidence * 100)}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <p className="font-mono text-sm text-slate2">
                Confidence {(regime.confidence * 100).toFixed(0)}% · Last regime
                update{" "}
                {new Date(regime.started_at).toLocaleString("en-SG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </>
          )}
        </header>

        <form onSubmit={runSearch} className="space-y-4">
          <GlassCard className="flex items-center gap-2 border-primary/25 p-2">
            <Search className="ml-3 h-5 w-5 shrink-0 text-muted2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search intelligence…"
              className="flex-1 border-0 bg-transparent py-3 pr-3 text-sm text-navy placeholder:text-muted2 focus:outline-none focus:ring-0"
            />
            <button
              type="submit"
              disabled={searching}
              className="mr-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </GlassCard>
          {searchErr && (
            <GlassCard className="border-danger2/30 p-4 text-sm text-danger2">
              {searchErr}
            </GlassCard>
          )}
          {searchHits.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted2">Results</p>
              {searchHits.map((h) => (
                <GlassCard key={h.id || h.title} className="p-4">
                  {h.title && (
                    <p className="mb-1 font-medium text-navy">
                      {highlightText(h.title, q)}
                    </p>
                  )}
                  {h.summary && (
                    <p className="line-clamp-3 text-sm text-slate2">
                      {highlightText(h.summary, q)}
                    </p>
                  )}
                  {h.similarity != null && (
                    <p className="mt-2 font-mono text-sm text-muted2">
                      Match {(h.similarity * 100).toFixed(0)}%
                    </p>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
        </form>

        <section>
          <h2 className="font-sans text-2xl mb-6">Research notes</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {notes.map((note) => {
              const locked = note.is_public === false;
              return (
                <GlassCard
                  key={note.id}
                  className="p-5 flex flex-col h-full border-l-2 border-l-primary/60"
                >
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${typeStyle(note.note_type)}`}
                    >
                      {note.note_type.replace(/_/g, " ")}
                    </span>
                    {note.confidence_score != null && (
                      <span className="font-mono text-xs text-muted2">
                        {(note.confidence_score * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-navy">
                    {note.title}
                  </h3>
                  <p className="line-clamp-3 flex-1 text-sm text-slate2">
                    {note.executive_summary}
                  </p>
                  <p className="mt-3 font-mono text-sm text-muted2">
                    {new Date(note.generated_at).toLocaleDateString("en-SG", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                    {locked ? (
                      <span className="inline-flex items-center gap-1 text-sm text-muted2">
                        <Lock className="w-3.5 h-3.5" />
                        Advisor plan required
                      </span>
                    ) : (
                      <Link
                        href={`/research/${note.id}`}
                        className="text-sm text-primary font-medium hover:underline"
                      >
                        Read full report →
                      </Link>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
          {notes.length === 0 && (
            <GlassCard className="p-8 text-center text-sm text-slate2">
              No published notes yet. Check back soon.
            </GlassCard>
          )}
        </section>

        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold mb-2">Methodology</h2>
          <p className="mb-4 text-sm leading-relaxed text-slate2">
            Findings combine anonymised portfolio signals with academic bias
            metrics. For deep dives, see our{" "}
            <Link href="/blog" className="text-primary hover:underline">
              research blog
            </Link>
            .
          </p>
        </GlassCard>
      </div>

      <footer className="mt-12 border-t border-border px-4 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-4 text-sm text-muted2">
          <Image
            src="/logo.png"
            alt="NeuFin"
            width={90}
            height={26}
            className="h-6 w-auto opacity-80"
          />
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-navy">
              Pricing
            </Link>
            <Link href="/privacy" className="hover:text-navy">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
