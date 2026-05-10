"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/lib/auth-context";
import { getSubscription, type SubscriptionInfo } from "@/lib/api";
import { apiGet } from "@/lib/api-client";
import { isAdvisorModeEnabled } from "@/lib/featureFlags";
import { canAccessAdvisorProduct } from "@/lib/advisor-access";

type TabId = "overview" | "timeline" | "reports" | "comms" | "meetings";

export default function AdvisorClientDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [tab, setTab] = useState<TabId>("overview");

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

  const detailKey = advisorMode && entitled && id ? `/api/advisor/clients/${id}` : null;
  const { data: detail, error: detailErr, isLoading: detailLoading } = useSWR(
    detailKey,
    (url) => apiGet<Record<string, unknown>>(url),
  );

  const { data: timeline, isLoading: tlLoading } = useSWR(
    advisorMode && entitled && id ? `/api/advisor/clients/${id}/timeline` : null,
    (url) =>
      apiGet<{
        dna_snapshots: Array<{
          id: string;
          dna_score: number | null;
          created_at: string;
          detail?: Record<string, unknown>;
        }>;
        portfolio_snapshots: Array<{ id: string; as_of: string }>;
      }>(url),
  );

  const { data: reportsData } = useSWR(
    tab === "reports" && id && entitled
      ? `/api/advisor/clients/${id}/reports`
      : null,
    (url) => apiGet<{ reports: unknown[] }>(url),
  );

  const client = detail?.client as Record<string, unknown> | undefined;
  const displayName = String(client?.display_name ?? "Client");
  const meta = (client?.metadata as Record<string, unknown>) ?? {};
  const riskProfile = String(meta.risk_profile ?? "—");
  const latestDna = detail?.latest_dna as Record<string, unknown> | null | undefined;
  const dnaScore =
    typeof latestDna?.dna_score === "number" ? latestDna.dna_score : null;
  const flags = useMemo(() => {
    const alerts = (detail?.alerts as Array<Record<string, unknown>>) ?? [];
    return alerts.slice(0, 6).map((a) => String(a.title ?? "Alert"));
  }, [detail]);

  const reportRows = useMemo(
    () =>
      ((reportsData?.reports as Array<Record<string, unknown>>) ??
        []) as Array<Record<string, unknown>>,
    [reportsData?.reports],
  );

  const chartData = useMemo(() => {
    const snaps = timeline?.dna_snapshots ?? [];
    const pts = snaps
      .filter((s) => s.dna_score != null)
      .map((s) => ({
        t: new Date(s.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        score: Number(s.dna_score),
        id: s.id,
      }))
      .reverse();
    return pts;
  }, [timeline]);

  const primaryPortfolioId =
    (detail?.primary_portfolio_id as string | null | undefined) ?? null;

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!advisorMode) {
    return <div className="p-8 text-center text-sm text-muted2">Redirecting…</div>;
  }

  if (!entitled) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted2">Advisor access required.</p>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Portfolio Timeline" },
    { id: "reports", label: "Reports" },
    { id: "comms", label: "Communications" },
    { id: "meetings", label: "Meetings" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6 md:px-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/advisor/clients"
          className="text-muted2 hover:text-primary-dark"
        >
          ← Client book
        </Link>
      </div>

      {detailLoading && (
        <div className="flex items-center gap-2 text-muted2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading client…
        </div>
      )}

      {detailErr && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load client.
        </p>
      )}

      {!detailLoading && !detailErr && client && (
        <>
          <header>
            <h1 className="text-2xl font-bold text-navy">{displayName}</h1>
            <p className="text-sm text-muted2">
              {String(client.email ?? "—")} · Risk profile: {riskProfile}
            </p>
            {client.notes ? (
              <p className="mt-2 max-w-2xl text-sm text-muted2">{String(client.notes)}</p>
            ) : null}
          </header>

          <div className="flex flex-wrap gap-2 border-b border-border pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  tab === t.id
                    ? "bg-primary-light font-semibold text-primary-dark"
                    : "text-muted2 hover:bg-surface-2",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-navy">Latest DNA score</p>
                <div className="mt-4 flex items-center justify-center">
                  <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-primary/35 bg-gradient-to-br from-primary-light to-emerald-50/90 text-center shadow-inner">
                    <span className="text-3xl font-bold tabular-nums text-navy">
                      {dnaScore ?? "—"}
                    </span>
                    <span className="text-xs text-muted2">DNA</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {flags.length === 0 ? (
                    <span className="text-xs text-muted2">No active bias flags</span>
                  ) : (
                    flags.map((f) => (
                      <span
                        key={f}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
                      >
                        {f}
                      </span>
                    ))
                  )}
                </div>
                <p className="mt-4 text-xs text-muted2">
                  Liquidity risk: see behavioral alerts and full DNA run for detail.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    href={
                      primaryPortfolioId
                        ? `/upload?portfolio_hint=${encodeURIComponent(primaryPortfolioId)}`
                        : "/upload"
                    }
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
                  >
                    Run new analysis
                  </Link>
                  <Link
                    href={`/dashboard/meeting-prep?client=${encodeURIComponent(id)}`}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-surface-2"
                  >
                    Generate meeting prep
                  </Link>
                  <Link
                    href={`/dashboard/communications?client=${encodeURIComponent(id)}&type=pdf`}
                    className="rounded-lg border border-primary/30 bg-primary-light px-3 py-2 text-xs font-semibold text-primary-dark hover:bg-primary-light/80"
                  >
                    Generate Client Summary
                  </Link>
                </div>
              </div>
            </div>
          )}

          {tab === "timeline" && (
            <div className="space-y-6">
              {tlLoading && (
                <p className="text-sm text-muted2">Loading history…</p>
              )}
              {chartData.length === 0 ? (
                <p className="rounded-xl border border-border bg-white px-4 py-8 text-center text-sm text-muted2">
                  No analyses run yet for this client.
                </p>
              ) : (
                <div className="h-72 w-full rounded-xl border border-border bg-white p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#0d9488"
                        strokeWidth={2}
                        dot
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="rounded-xl border border-border bg-white">
                <p className="border-b border-border px-4 py-2 text-sm font-medium text-navy">
                  Snapshot log
                </p>
                <ul className="divide-y divide-border">
                  {(timeline?.dna_snapshots ?? []).slice(0, 20).map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                      <span className="text-muted2">
                        {new Date(s.created_at).toLocaleString()}
                      </span>
                      <span className="font-mono tabular-nums">
                        Score {s.dna_score ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === "reports" && (
            <div className="rounded-xl border border-border bg-white p-4">
              <ul className="divide-y divide-border">
                {reportRows.length === 0 ? (
                  <li className="py-8 text-center text-sm text-muted2">
                    No PDF reports yet for the linked portfolio.
                  </li>
                ) : (
                  reportRows.map((r) => (
                    <li key={String(r.id)} className="py-2 text-sm">
                      <span className="text-muted2">
                        {String(r.created_at ?? "")}
                      </span>{" "}
                      ·{" "}
                      {r.pdf_url ? (
                        <a
                          href={String(r.pdf_url)}
                          className="font-medium text-primary underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open PDF
                        </a>
                      ) : (
                        "Queued / processing"
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {tab === "comms" && (
            <div className="rounded-xl border border-border bg-white">
              {(((detail?.communications as unknown[]) ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted2">
                  No communications logged yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {(
                    (detail?.communications as Array<Record<string, unknown>>) ??
                    []
                  ).map((c) => (
                    <li key={String(c.id)} className="px-4 py-3 text-sm">
                      <p className="font-medium text-navy">
                        {String(c.channel ?? "note")} ·{" "}
                        {String(c.subject ?? "")}
                      </p>
                      <p className="text-muted2">{String(c.body ?? "")}</p>
                      <p className="mt-1 text-xs text-muted2">
                        {String(c.occurred_at ?? "")}
                      </p>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          )}

          {tab === "meetings" && (
            <div className="rounded-xl border border-border bg-white">
              {(((detail?.meetings as unknown[]) ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted2">No meetings scheduled.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(
                    (detail?.meetings as Array<Record<string, unknown>>) ?? []
                  ).map((m) => (
                    <li key={String(m.id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span>
                        {String(m.title ?? "Meeting")} ·{" "}
                        {new Date(String(m.scheduled_at ?? "")).toLocaleString()}
                      </span>
                      <Link
                        href={`/dashboard/meeting-prep?client=${encodeURIComponent(id)}`}
                        className="text-xs font-semibold text-primary"
                      >
                        Prep
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
