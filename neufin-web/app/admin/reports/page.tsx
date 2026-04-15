"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type Row = {
  id: string;
  created_at?: string;
  source: string;
  advisor_id?: string;
  user_id?: string;
  is_paid?: boolean;
};

export default function AdminReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/reports?limit=100", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const j = await res.json();
        if (!c) setRows(j.reports ?? []);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Reports log</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Recent advisor + swarm report rows.
        </p>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Id</th>
              <th className="px-3 py-2">User / advisor</th>
              <th className="px-3 py-2">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((r) => (
              <tr key={`${r.source}-${r.id}`} className="hover:bg-zinc-900/40">
                <td className="px-3 py-2 text-zinc-400">
                  {r.created_at || "—"}
                </td>
                <td className="px-3 py-2">{r.source}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {r.advisor_id || r.user_id || "—"}
                </td>
                <td className="px-3 py-2">
                  {r.is_paid == null ? "—" : r.is_paid ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
