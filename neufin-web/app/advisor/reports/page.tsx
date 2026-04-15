"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiGet } from "@/lib/api-client";

interface ClientReport {
  id: string;
  client_id?: string;
  client_name?: string;
  portfolio_id: string;
  pdf_url: string | null;
  is_paid: boolean;
  created_at: string;
  plan_type?: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

export default function AdvisorReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedThisMonth, setUsedThisMonth] = useState(0);
  const REPORT_LIMIT = 10;

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ reports?: ClientReport[] }>(
        `/api/reports/advisor/${user.id}`,
        {
          cache: "no-store",
        },
      );
      const allReports: ClientReport[] = data.reports ?? [];
      setReports(allReports);
      const thisMonth = new Date().toISOString().slice(0, 7);
      setUsedThisMonth(
        allReports.filter((r) => r.created_at.startsWith(thisMonth)).length,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const usagePct = Math.min(100, (usedThisMonth / REPORT_LIMIT) * 100);

  if (loading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-3xl space-y-6 bg-app px-4 py-6 md:px-0">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app py-6 text-navy">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 md:px-0">
        {/* Header */}
        <div className="section-header">
          <div>
            <h1>Client Reports</h1>
            <p>White-label PDF reports for all clients</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/advisor/dashboard"
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-navy transition-colors hover:border-primary/40"
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-navy transition-colors hover:border-primary/40"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Usage meter */}
        <div className="rounded-xl border border-primary/30 bg-white p-4 shadow-sm ring-1 ring-inset ring-primary/20">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-navy">Reports This Month</p>
            <p className="text-sm font-bold">
              <span
                className={
                  usedThisMonth >= REPORT_LIMIT ? "text-red-700" : "text-navy"
                }
              >
                {usedThisMonth}
              </span>
              <span className="text-muted2">/{REPORT_LIMIT}</span>
            </p>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-3">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${
                usagePct >= 100
                  ? "bg-red-500"
                  : usagePct >= 80
                    ? "bg-amber-500"
                    : "bg-primary"
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {usedThisMonth >= REPORT_LIMIT && (
            <p className="mt-2 text-xs text-red-700">
              Monthly limit reached.{" "}
              <Link href="/pricing" className="underline">
                Upgrade to Enterprise
              </Link>{" "}
              for unlimited reports.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Reports table */}
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-white shadow-sm ring-1 ring-inset ring-primary/20">
          <div className="border-b border-border bg-surface-2 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
              All Reports ({reports.length})
            </p>
          </div>
          {reports.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted2">No reports generated yet.</p>
              <Link
                href="/advisor/dashboard"
                className="mt-3 inline-block text-sm text-primary hover:text-primary-dark"
              >
                Go to dashboard to generate your first report →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border bg-white">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-navy">
                      {r.client_name ??
                        `Portfolio ${r.portfolio_id.slice(0, 8)}…`}
                    </p>
                    <p className="text-xs text-muted2">{fmt(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.is_paid ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                        Paid
                      </span>
                    ) : (
                      <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted2">
                        Free
                      </span>
                    )}
                    {r.pdf_url ? (
                      <a
                        href={r.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
                      >
                        Download PDF
                      </a>
                    ) : (
                      <span className="text-xs text-muted2">Generating…</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
