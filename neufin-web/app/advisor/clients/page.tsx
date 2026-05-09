"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Loader2, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSubscription, type SubscriptionInfo } from "@/lib/api";
import { apiGet } from "@/lib/api-client";
import { isAdvisorModeEnabled } from "@/lib/featureFlags";
import { canAccessAdvisorProduct } from "@/lib/advisor-access";

type Row = {
  id: string;
  display_name: string | null;
  dna_score: number | null;
  score_delta: number | null;
  churn_risk: string;
  top_bias: string;
  last_review_at: string | null;
  next_action: string;
  primary_portfolio_id: string | null;
};

function fmtDay(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function churnBadgeCls(r: string) {
  const u = r.toUpperCase();
  if (u === "HIGH") return "bg-red-50 text-red-800 ring-red-200";
  if (u === "MEDIUM") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-emerald-50 text-emerald-900 ring-emerald-200";
}

export default function AdvisorClientBookPage() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [risk, setRisk] = useState<string>("");
  const [overdue, setOverdue] = useState<boolean | null>(null);
  const [bias, setBias] = useState("");

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

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (risk) p.set("risk", risk);
    if (overdue === true) p.set("overdue", "true");
    if (bias.trim()) p.set("bias", bias.trim());
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [risk, overdue, bias]);

  const { data, error, isLoading, mutate } = useSWR(
    advisorMode && entitled && token
      ? `/api/advisor/clients${qs}`
      : null,
    async (url) => {
      const j = await apiGet<{ clients: Row[] }>(url);
      return j.clients ?? [];
    },
  );

  const rows = data ?? [];

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
      <div className="p-8 text-center text-sm text-muted2">Redirecting…</div>
    );
  }

  if (!entitled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-xl font-semibold text-navy">Client book</h1>
        <p className="mt-2 text-sm text-muted2">
          Advisor plan or advisor access is required.
        </p>
        <Link href="/pricing" className="mt-4 inline-block text-sm text-primary">
          View plans →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-6 md:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-label">Advisor</p>
          <h1 className="text-2xl font-bold text-navy">Client book command center</h1>
          <p className="text-sm text-muted2">
            Triage view — highest churn and largest score drops first.
          </p>
        </div>
        <Link
          href="/advisor/clients/new"
          className="inline-flex justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          + Add client
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted2">
            Risk band
          </label>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="input-base text-sm"
          >
            <option value="">All</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdue === true}
            onChange={(e) =>
              setOverdue(e.target.checked ? true : null)
            }
          />
          Overdue review (&gt;90d)
        </label>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted2">
            Bias contains
          </label>
          <input
            value={bias}
            onChange={(e) => setBias(e.target.value)}
            placeholder="e.g. Home bias"
            className="input-base w-full text-sm"
          />
        </div>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
          onClick={() => {
            setRisk("");
            setOverdue(null);
            setBias("");
            void mutate();
          }}
        >
          Clear filters
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading clients…
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load clients.
        </p>
      )}

      {!isLoading && !error && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary/35 bg-primary-light/30 p-10 text-center">
          <p className="mb-4 text-navy">
            Add your first client portfolio to start monitoring behavioral risk.
          </p>
          <Link
            href="/advisor/clients/new"
            className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            Add Client Portfolio →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted2">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">DNA Score</th>
                <th className="px-3 py-2">Score Δ</th>
                <th className="px-3 py-2">Churn</th>
                <th className="px-3 py-2">Top bias</th>
                <th className="px-3 py-2">Last review</th>
                <th className="px-3 py-2">Next action</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 font-medium text-navy">
                    {r.display_name ?? `Client ${r.id.slice(0, 8)}`}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {r.dna_score ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    {r.score_delta == null ? (
                      <span className="text-muted2">—</span>
                    ) : r.score_delta > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-700">
                        <ArrowUp className="h-3.5 w-3.5" />
                        {r.score_delta}
                      </span>
                    ) : r.score_delta < 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-red-600">
                        <ArrowDown className="h-3.5 w-3.5" />
                        {Math.abs(r.score_delta)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-muted2">
                        <Minus className="h-3.5 w-3.5" />0
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${churnBadgeCls(r.churn_risk)}`}
                    >
                      {r.churn_risk}
                    </span>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-3 text-muted2">
                    {r.top_bias}
                  </td>
                  <td className="px-3 py-3 text-muted2">
                    {fmtDay(r.last_review_at)}
                  </td>
                  <td className="max-w-[200px] px-3 py-3 text-muted2">
                    {r.next_action}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Link
                        href={`/advisor/clients/${r.id}`}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-2"
                      >
                        View
                      </Link>
                      <Link
                        href={`/dashboard/meeting-prep?client=${encodeURIComponent(r.id)}`}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-2"
                      >
                        Meeting prep
                      </Link>
                      <Link
                        href={
                          r.primary_portfolio_id
                            ? `/swarm?portfolio_id=${encodeURIComponent(r.primary_portfolio_id)}`
                            : "/swarm"
                        }
                        className="rounded-md border border-primary/30 bg-primary-light px-2 py-1 text-xs font-semibold text-primary-dark hover:bg-primary-light/80"
                      >
                        Run analysis
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
