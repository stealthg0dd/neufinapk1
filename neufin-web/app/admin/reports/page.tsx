"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type Row = {
  id: string;
  created_at?: string;
  source: string;
  advisor_id?: string;
  user_id?: string;
  is_paid?: boolean;
};

type SourceFilter = "all" | "advisor" | "swarm";
type PaidFilter = "all" | "paid" | "unpaid";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/reports?limit=100", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const body = await res.json();
        if (!cancelled) setRows(body.reports ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
      if (paidFilter === "paid" && row.is_paid !== true) return false;
      if (paidFilter === "unpaid" && row.is_paid !== false) return false;
      if (!q) return true;
      return [row.id, row.user_id, row.advisor_id, row.source]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [paidFilter, rows, search, sourceFilter]);

  const summary = useMemo(
    () => ({
      total: filtered.length,
      advisor: filtered.filter((row) => row.source === "advisor").length,
      swarm: filtered.filter((row) => row.source === "swarm").length,
      paid: filtered.filter((row) => row.is_paid === true).length,
    }),
    [filtered],
  );

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Reports</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Review advisor and swarm report generation activity.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Loaded reports" value={summary.total} />
        <SummaryCard label="Advisor" value={summary.advisor} />
        <SummaryCard label="Swarm" value={summary.swarm} />
        <SummaryCard label="Paid" value={summary.paid} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search id, user, advisor…"
          className="min-w-[240px] flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
        />
        {(["all", "advisor", "swarm"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSourceFilter(value)}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${
              sourceFilter === value
                ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {value}
          </button>
        ))}
        {(["all", "paid", "unpaid"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPaidFilter(value)}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${
              paidFilter === value
                ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {err ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Report id</th>
              <th className="px-3 py-2">User / advisor</th>
              <th className="px-3 py-2">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-600">
                  No reports found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={`${row.source}-${row.id}`} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-2 text-zinc-400">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 capitalize">{row.source}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {row.advisor_id || row.user_id || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.is_paid == null ? "—" : row.is_paid ? "yes" : "no"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
