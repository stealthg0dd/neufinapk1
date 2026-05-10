"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Loader2, ArrowDownRight, ArrowRight, Minus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSubscription, type SubscriptionInfo } from "@/lib/api";
import { apiGet } from "@/lib/api-client";
import { isAdvisorModeEnabled } from "@/lib/featureFlags";
import { canAccessAdvisorProduct } from "@/lib/advisor-access";
import { formatRegimeLabel, regimePillClass } from "@/lib/regime-display";

type RegimeResp = {
  current?: { regime?: string; confidence?: number; label?: string };
};

type MorningBrief = {
  greeting_name?: string;
  generated_at?: string;
  portfolios_monitored?: number;
  alerts_this_morning?: number;
  clients_due_review_this_week?: number;
  top_clients?: Array<{
    client_id: string;
    display_name: string;
    dna_score_current: number | null;
    dna_score_delta: number | null;
    churn_risk: string;
    top_bias: string;
    risk_from: string;
    risk_to: string;
    reason: string;
    recommended_action: string;
    primary_portfolio_id: string | null;
  }>;
  upcoming_meetings?: Array<{
    id: string;
    client_id: string;
    title: string | null;
    scheduled_at: string;
    client_display_name?: string;
    prep_ready?: boolean;
  }>;
  regime_impact?: {
    misaligned_portfolios?: number;
    primary_risk?: string;
    suggested_tilt?: string;
  };
};

const fetcher = async (url: string) => apiGet<MorningBrief>(url);

function churnClass(r: string) {
  const u = r.toUpperCase();
  if (u === "HIGH")
    return "border-red-200 bg-red-50 text-red-800";
  if (u === "MEDIUM")
    return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function DeltaArrow({ delta }: { delta: number | null | undefined }) {
  if (delta == null) return <Minus className="inline h-4 w-4 text-muted2" />;
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-red-600">
        <ArrowDownRight className="h-4 w-4" />
        {delta}
      </span>
    );
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-700">
        ↑{delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted2">
      <ArrowRight className="h-4 w-4" />0
    </span>
  );
}

export default function MorningBriefPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const advisorMode = isAdvisorModeEnabled();

  useEffect(() => {
    if (!advisorMode) router.replace("/dashboard");
  }, [advisorMode, router]);

  useEffect(() => {
    if (!token) {
      setSub(null);
      return;
    }
    void getSubscription(token)
      .then(setSub)
      .catch(() => setSub(null));
  }, [token]);

  const entitled = canAccessAdvisorProduct(sub);
  const allowed = advisorMode && entitled && !!user;

  const {
    data: brief,
    error: briefErr,
    isLoading: briefLoading,
  } = useSWR(
    allowed ? "/api/advisor/morning-brief" : null,
    fetcher,
    { revalidateOnFocus: true },
  );

  const { data: regimeJson } = useSWR(
    allowed ? "/api/research/regime" : null,
    async (u) => apiGet<RegimeResp>(u),
    { revalidateOnFocus: false },
  );

  const regimeLabel = useMemo(() => {
    const cur = regimeJson?.current ?? null;
    return formatRegimeLabel(cur as { regime?: string; label?: string } | null);
  }, [regimeJson]);

  const regimeConfidencePct = useMemo(() => {
    const c = regimeJson?.current?.confidence;
    if (c == null || Number.isNaN(Number(c))) return null;
    const n = Number(c);
    return n <= 1 ? Math.round(n * 100) : Math.round(n);
  }, [regimeJson]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!advisorMode) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted2">
        Redirecting…
      </div>
    );
  }

  if (!entitled) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-10">
        <h1 className="text-xl font-semibold text-navy">Morning Brief</h1>
        <p className="text-sm text-muted2">
          Advisor workspace requires an advisor or enterprise plan, or advisor
          access from your firm administrator.
        </p>
        <Link
          href="/pricing"
          className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          View plans
        </Link>
      </div>
    );
  }

  const loading = briefLoading;
  const top = brief?.top_clients ?? [];
  const monitored = brief?.portfolios_monitored ?? 0;
  const emptyBook = monitored === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-16 pt-6 md:px-6">
      <header className="space-y-3 border-b border-border pb-6">
        <p className="text-label">Advisor · Morning brief</p>
        <h1 className="text-2xl font-bold tracking-tight text-navy md:text-3xl">
          Good morning, {brief?.greeting_name ?? "there"}. Here&apos;s what
          needs your attention today.
        </h1>
        <p className="text-sm text-muted2">
          {todayLabel} · {regimeLabel}
          {regimeConfidencePct != null ? ` · ${regimeConfidencePct}% confidence` : ""}{" "}
          · {monitored} portfolio{monitored === 1 ? "" : "s"} monitored
        </p>
        <div className="flex flex-wrap gap-2">
          <span className={regimePillClass(regimeJson?.current as never)}>
            Market: {regimeLabel}
          </span>
          <span className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground">
            {brief?.alerts_this_morning ?? "—"} alerts this morning
          </span>
          <span className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground">
            {brief?.clients_due_review_this_week ?? "—"} clients due for review
            (90d+)
          </span>
        </div>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading advisor brief…
        </div>
      )}

      {briefErr && !loading && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load morning brief. Try refreshing the page.
        </p>
      )}

      {!loading && !briefErr && (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-navy">
              Top clients needing attention
            </h2>
            {emptyBook ? (
              <div className="rounded-2xl border border-dashed border-primary/35 bg-primary-light/30 p-8 text-center">
                <p className="mb-4 text-sm text-navy">
                  Add your first client portfolio to start monitoring behavioral
                  risk.
                </p>
                <Link
                  href="/advisor/clients/new"
                  className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  Add Client Portfolio →
                </Link>
              </div>
            ) : top.length === 0 ? (
              <p className="rounded-xl border border-border bg-white px-4 py-6 text-sm text-muted2">
                No prioritized clients yet. Alerts and DNA snapshots will
                appear here after analyses run.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-1">
                {top.slice(0, 5).map((c) => (
                  <article
                    key={c.client_id}
                    className="rounded-2xl border border-border bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-navy">
                          {c.display_name}
                        </h3>
                        <p className="mt-1 text-sm text-muted2">
                          DNA score:{" "}
                          <span className="font-mono tabular-nums text-foreground">
                            {c.dna_score_current ?? "—"}
                          </span>
                          {c.dna_score_delta != null ? (
                            <>
                              {" "}
                              (
                              <DeltaArrow delta={c.dna_score_delta} /> since last
                              snapshot)
                            </>
                          ) : null}
                        </p>
                        <p className="mt-1 text-sm">
                          Risk change:{" "}
                          <span className="font-medium">{c.risk_from}</span>
                          {" → "}
                          <span className="font-medium">{c.risk_to}</span>
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold uppercase ${churnClass(c.churn_risk)}`}
                      >
                        {c.churn_risk} churn
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <p>
                        <span className="font-medium text-navy">Top flag:</span>{" "}
                        {c.top_bias}
                      </p>
                      <p className="text-muted2">{c.reason}</p>
                      <p>
                        <span className="font-medium text-navy">
                          Recommended:
                        </span>{" "}
                        {c.recommended_action}
                      </p>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href={
                          c.primary_portfolio_id
                            ? `/swarm?portfolio_id=${encodeURIComponent(c.primary_portfolio_id)}`
                            : "/swarm"
                        }
                        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-3"
                      >
                        Run Analysis
                      </Link>
                      <Link
                        href={`/dashboard/communications?client=${encodeURIComponent(c.client_id)}&type=email`}
                        className="rounded-lg border border-primary/30 bg-primary-light px-3 py-2 text-xs font-semibold text-primary-dark hover:bg-primary-light/80"
                      >
                        Generate Memo
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-navy">
              Market regime impact
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted2">
              <li>
                <span className="font-medium text-foreground">
                  Current regime:
                </span>{" "}
                {regimeLabel}
                {regimeConfidencePct != null
                  ? ` · ${regimeConfidencePct}% confidence`
                  : ""}
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Impact on your book:
                </span>{" "}
                {brief?.regime_impact?.misaligned_portfolios ?? 0} portfolios may
                be misaligned with the current regime (from alerts / severity).
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Primary risk:
                </span>{" "}
                {brief?.regime_impact?.primary_risk ??
                  "Review factor and concentration exposures."}
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Suggested tilt:
                </span>{" "}
                {brief?.regime_impact?.suggested_tilt ??
                  "Nudge sleeves toward quality and resilience when risk-off dominates."}
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-navy">Upcoming meetings</h2>
            {(brief?.upcoming_meetings?.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-border bg-white px-4 py-5 text-sm text-muted2">
                No meetings scheduled. Add from the client book.
              </p>
            ) : (
              <ul className="space-y-3">
                {(brief?.upcoming_meetings ?? []).map((m) => {
                  const dt = new Date(m.scheduled_at);
                  return (
                    <li
                      key={m.id}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-navy">
                          {m.client_display_name ?? "Client"}
                        </p>
                        <p className="text-sm text-muted2">
                          {dt.toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}{" "}
                          · {m.title ?? "Review"}
                        </p>
                        <p className="text-xs text-muted2">
                          {m.prep_ready ? "Prep ready" : "Prep needed"}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/meeting-prep?client=${encodeURIComponent(m.client_id)}`}
                        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
                      >
                        Generate Prep
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-navy">Quick actions</h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/advisor/clients/new"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-surface-2"
              >
                + Add Client Portfolio
              </Link>
              <Link
                href="/upload"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Upload Batch
              </Link>
              <Link
                href="/dashboard/raw-input"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Paste Raw Portfolio
              </Link>
              <Link
                href="/dashboard/alerts"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-surface-2"
              >
                View All Alerts
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
