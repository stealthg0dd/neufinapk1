"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  FilePlus,
  ListOrdered,
  Share2,
  Sparkles,
  Waypoints,
} from "lucide-react";
import toast from "react-hot-toast";
import type { DisplayResearchNote } from "@/lib/research-note-display";
import {
  addResearchToReportQueue,
  isResearchSaved,
  toggleSavedResearchId,
} from "@/lib/research-saved";
import { ActionCard } from "@/components/ActionCard";

function regimePillClass(r: string | null): string {
  const k = (r || "").toLowerCase();
  if (k.includes("risk_on") || k.includes("recovery"))
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (k.includes("risk_off") || k.includes("recession"))
    return "border-red-200 bg-red-100 text-red-900";
  return "border-border bg-surface-2 text-navy";
}

function regimeLabel(r: string | null): string {
  if (!r) return "—";
  return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ResearchIntelligenceCard({
  display,
  relevanceReasons,
  relevanceScore,
  onSaveChange,
}: {
  display: DisplayResearchNote;
  relevanceReasons?: string[];
  relevanceScore?: number;
  onSaveChange?: () => void;
}) {
  const [saved, setSaved] = useState(() => isResearchSaved(display.id));

  const why =
    display.whyPortfolioMatters ??
    (relevanceReasons && relevanceReasons.length > 0
      ? relevanceReasons.join(" · ")
      : "Surfaces macro and factor context you should weigh against your book and policy.");

  function handleSave() {
    const now = toggleSavedResearchId(display.id);
    setSaved(now);
    toast.success(now ? "Saved to read later" : "Removed from saved");
    onSaveChange?.();
  }

  function handleReportQueue() {
    addResearchToReportQueue(display.id);
    toast.success("Added to report queue — open Reports to compile.");
  }

  async function handleShare() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/research/${display.id}`
        : "";
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <article className="group rounded-xl border border-border bg-white p-4 shadow-sm transition-all duration-200 hover:border-primary/35 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-primary/25 bg-primary-light/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-dark">
            {display.noteType.replace(/_/g, " ")}
          </span>
          {display.regime && (
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${regimePillClass(display.regime)}`}
            >
              {regimeLabel(display.regime)}
            </span>
          )}
          {typeof relevanceScore === "number" && relevanceScore >= 45 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              <Sparkles className="h-3 w-3" aria-hidden />
              For you · {relevanceScore}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-readable">
          {display.confidencePct != null && (
            <span className="text-xs tabular-nums">{display.confidencePct}% conf</span>
          )}
          <span className="text-xs text-readable">·</span>
          <span className="text-xs tabular-nums">{display.readTimeMinutes} min</span>
        </div>
      </div>

      <h3 className="mt-3 text-base font-bold leading-snug text-navy">
        <Link
          href={`/research/${display.id}`}
          className="transition-colors hover:text-primary"
        >
          {display.title}
        </Link>
      </h3>

      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-readable">
        {display.executiveSummary}
      </p>

      <div className="mt-3 rounded-lg border border-primary/15 bg-primary-light/30 px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary-dark">
          Why this matters to your portfolio
        </p>
        <p className="mt-1 text-sm leading-relaxed text-navy">{why}</p>
      </div>

      {display.sectors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-readable">
            Sectors
          </span>
          {display.sectors.slice(0, 8).map((s) => (
            <span
              key={s}
              className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-navy"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {display.portfolioImplications.length > 0 && (
        <div className="mt-3">
          {display.portfolioImplications.slice(0, 3).map((line, i) => (
            <ActionCard key={i} raw={line} />
          ))}
        </div>
      )}

      {display.suggestedNextAction && (
        <div className="mt-3">
          <ActionCard raw={display.suggestedNextAction} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border-light pt-3">
        <Link
          href={`/dashboard/portfolio?from=research&ref=${encodeURIComponent(display.id)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-primary/40 hover:bg-primary-light/40"
        >
          <Waypoints className="h-3.5 w-3.5" aria-hidden />
          Portfolio impact
        </Link>
        <Link
          href={`/dashboard/swarm?context=research&ref=${encodeURIComponent(display.id)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-primary/40 hover:bg-primary-light/40"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Advisor memo
        </Link>
        <Link
          href={`/dashboard/actions?from=research&ref=${encodeURIComponent(display.id)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-primary/40 hover:bg-primary-light/40"
        >
          <ListOrdered className="h-3.5 w-3.5" aria-hidden />
          Recommended actions
        </Link>
        <button
          type="button"
          onClick={handleReportQueue}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-primary/40 hover:bg-primary-light/40"
        >
          <FilePlus className="h-3.5 w-3.5" aria-hidden />
          Add to report
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            saved
              ? "border-primary bg-primary-light text-primary-dark"
              : "border-border bg-surface-2 text-navy hover:border-primary/40"
          }`}
          aria-pressed={saved}
        >
          <Bookmark className="h-3.5 w-3.5" aria-hidden />
          {saved ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-primary/40"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          Share
        </button>
        <Link
          href={`/research/${display.id}`}
          className="ml-auto inline-flex items-center text-xs font-semibold text-primary hover:underline"
        >
          Read full analysis →
        </Link>
      </div>
    </article>
  );
}
