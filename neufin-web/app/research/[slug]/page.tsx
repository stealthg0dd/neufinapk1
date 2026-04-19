import type { Metadata } from "next";
import Link from "next/link";
import { ResearchMarkdown } from "@/components/content/ResearchMarkdown";
import { ShareResearchUrlButton } from "@/components/research/ShareResearchUrlButton";
import { normalizeResearchContent } from "@/lib/research-normalizer";

function regimeBadge(regime: string | null | undefined) {
  if (!regime) return "Neutral";
  const m: Record<string, string> = {
    risk_on: "Risk-On",
    risk_off: "Risk-Off",
    neutral: "Neutral",
    stagflation: "Stagflation",
    recovery: "Recovery",
    recession: "Recession",
    recession_risk: "Recession risk",
  };
  const k = regime.toLowerCase();
  const mapped =
    k in m ? m[k as keyof typeof m] : undefined;
  return (
    mapped ||
    regime.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function regimeBadgeClass(regime: string | null | undefined) {
  const k = (regime || "").toLowerCase();
  if (k.includes("risk_on") || k === "recovery")
    return "border-emerald-300 bg-emerald-100 text-emerald-700";
  if (k.includes("risk_off") || k.includes("recession"))
    return "border-red-300 bg-red-100 text-red-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

type RelatedNote = {
  id: string;
  slug: string;
  title: string;
  note_type: string;
};

type BlogNote = {
  id: string;
  slug: string;
  title: string;
  executive_summary: string;
  content: string;
  note_type: string;
  regime?: string | null;
  confidence_score?: number;
  created_at: string;
  read_time_minutes: number;
  asset_tickers: string[];
  meta_description: string;
  related_notes: RelatedNote[];
  macro_signal_count?: number;
};

function resolveBase() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.startsWith("http") ? raw : `https://${raw}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function fetchResearchNote(slug: string): Promise<BlogNote | null> {
  try {
    const base = resolveBase().replace(/\/$/, "");
    const res = await fetch(
      `${base}/api/research/blog/${encodeURIComponent(slug)}`,
      {
        next: { revalidate: 300 },
        cache: "force-cache",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as BlogNote;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const note = await fetchResearchNote(slug);
  if (!note) return { title: "NeuFin Research" };
  return {
    title: `${note.title} | NeuFin Research`,
    description: note.meta_description,
    openGraph: {
      title: note.title,
      description: note.meta_description,
      type: "article",
      publishedTime: note.created_at,
      authors: ["NeuFin AI Research Team"],
      tags: note.asset_tickers,
    },
  };
}

export default async function ResearchArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const note = await fetchResearchNote(slug);
  if (!note) {
    return (
      <div className="min-h-screen bg-background px-6 py-section-hero text-foreground">
        <div className="mx-auto max-w-4xl">
          <p className="text-muted-foreground">Research note not found.</p>
        </div>
      </div>
    );
  }

  const report = normalizeResearchContent(note.content, note.executive_summary);
  const s = report.structured;

  const keyInsights =
    s?.key_findings && s.key_findings.length > 0
      ? s.key_findings.slice(0, 3).map((f) => f.finding)
      : note.executive_summary
          .split(".")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 3);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-section lg:grid-cols-[minmax(0,1fr)_300px]">
        <article>
          <div className="mb-6 text-sm text-muted-foreground">
            <Link href="/research" className="hover:text-foreground">
              Research
            </Link>{" "}
            → <span>{note.note_type.replace(/_/g, " ")}</span> →{" "}
            <span className="text-foreground">{note.title}</span>
          </div>

          <header className="mb-8">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-sm font-medium ${regimeBadgeClass(note.regime)}`}
              >
                {regimeBadge(note.regime)}
              </span>
              <ShareResearchUrlButton />
            </div>
            <h1 className="mt-4 text-3xl font-bold leading-tight">
              {note.title}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              {note.executive_summary}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-mono text-muted-foreground">
              <span>
                {new Date(note.created_at).toLocaleString("en-SG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              <span>
                {Math.round(
                  (note.confidence_score ?? 0) <= 1
                    ? (note.confidence_score ?? 0) * 100
                    : (note.confidence_score ?? 0),
                )}
                % confidence
              </span>
              <span>{note.read_time_minutes} min read</span>
            </div>
          </header>

          {/* Structured sections (when content was a JSON dict) */}
          {s && (
            <div className="mb-8 space-y-6">
              {s.thesis &&
                s.thesis.trim() &&
                s.thesis.trim() !== (note.executive_summary ?? "").trim() && (
                  <section className="rounded-xl border border-border/80 bg-surface p-5">
                    <h2 className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Thesis
                    </h2>
                    <p className="text-base leading-relaxed text-foreground">
                      {s.thesis}
                    </p>
                  </section>
                )}

              {s.key_findings && s.key_findings.length > 0 && (
                <section className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    Key Findings
                  </h2>
                  <ul className="space-y-3">
                    {s.key_findings.map((f, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {f.finding}
                          </p>
                          {f.data_support && (
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {f.data_support}
                            </p>
                          )}
                          {f.implication && (
                            <p className="mt-0.5 text-sm text-primary/80">
                              → {f.implication}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {s.sector_impacts && s.sector_impacts.length > 0 && (
                <section className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    Sector Impacts
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {s.sector_impacts.map((si, i) => {
                      const dir = (si.direction ?? "").toLowerCase();
                      const isPositive = dir.includes("positiv") || dir.includes("up") || dir === "bullish";
                      const isNegative = dir.includes("negativ") || dir.includes("down") || dir === "bearish";
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface-2 p-3"
                        >
                          <span
                            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                              isPositive
                                ? "bg-emerald-500"
                                : isNegative
                                  ? "bg-red-500"
                                  : "bg-amber-400"
                            }`}
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {si.sector}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {si.impact}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {s.portfolio_implications && s.portfolio_implications.length > 0 && (
                <section className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                  <h2 className="mb-3 text-xs font-mono uppercase tracking-widest text-primary/70">
                    Portfolio Implications
                  </h2>
                  <ul className="space-y-1.5">
                    {s.portfolio_implications.map((imp, i) => (
                      <li key={i} className="flex gap-2 text-sm text-foreground">
                        <span className="shrink-0 text-primary">→</span>
                        {imp}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {s.risks && s.risks.length > 0 && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <h2 className="mb-3 text-xs font-mono uppercase tracking-widest text-amber-700">
                    Risk Factors
                  </h2>
                  <ul className="space-y-1.5">
                    {s.risks.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-amber-900">
                        <span className="shrink-0">⚠</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(s.conclusion || s.recommended_action) && (
                <section className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    Conclusion
                  </h2>
                  <p className="text-sm leading-relaxed text-foreground">
                    {s.conclusion ?? s.recommended_action}
                  </p>
                </section>
              )}
            </div>
          )}

          {/* Full markdown content (prose path) */}
          {!s && (
            <ResearchMarkdown
              markdown={report.markdown || note.executive_summary || ""}
            />
          )}

          {/* Also render the markdown version below structured sections for full context */}
          {s && report.markdown && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Full analysis
              </summary>
              <div className="mt-4">
                <ResearchMarkdown markdown={report.markdown} />
              </div>
            </details>
          )}

          <p className="mt-8 text-sm text-muted-foreground">
            Generated by NeuFin Synthesis Agent at{" "}
            {new Date(note.created_at).toLocaleString("en-SG", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . Based on{" "}
            {typeof note.macro_signal_count === "number"
              ? note.macro_signal_count
              : "—"}{" "}
            macro signals.
          </p>

          <div className="mt-10 rounded-xl border border-primary/30 bg-primary/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Try NeuFin free for 14 days — full portfolio DNA, IC-ready
              reports, and swarm intelligence.
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
            >
              Start free trial
            </Link>
          </div>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Market conditions at publication
            </h3>
            <p className="text-sm font-medium text-foreground">
              {regimeBadge(note.regime)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Confidence:{" "}
              {Math.round(
                (note.confidence_score ?? 0) <= 1
                  ? (note.confidence_score ?? 0) * 100
                  : (note.confidence_score ?? 0),
              )}
              %
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Key Insights
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {keyInsights.map((k, i) => (
                <li key={i}>• {k}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Asset Mentions
            </h3>
            <div className="flex flex-wrap gap-2">
              {note.asset_tickers.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-sm text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Related Research
            </h3>
            <div className="space-y-2">
              {note.related_notes.map((r) => (
                <Link
                  key={r.id}
                  href={`/research/${r.slug}`}
                  className="block text-sm text-foreground hover:text-primary"
                >
                  {r.title}
                </Link>
              ))}
            </div>
          </div>

          <Link
            href="/upload"
            className="block rounded-xl border border-primary/30 bg-primary/10 p-4 text-center text-sm text-primary"
          >
            Analyze Your Portfolio
          </Link>
        </aside>
      </div>
    </div>
  );
}
