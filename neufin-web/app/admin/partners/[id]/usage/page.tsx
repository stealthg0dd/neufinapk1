"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Daily = { date: string; calls: number };

type UsagePayload = {
  partner_id: string;
  days: number;
  daily_totals: Daily[];
  keys: {
    id: string;
    key_masked: string;
    name?: string;
    is_active?: boolean;
    daily: Daily[];
  }[];
};

export default function PartnerUsagePage() {
  const params = useParams();
  const id = String(params.id || "");
  const [data, setData] = useState<UsagePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/api/admin/partners/${encodeURIComponent(id)}/usage?days=60`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const j = await res.json();
        if (!c) setData(j);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      c = true;
    };
  }, [id]);

  const chartData = useMemo(() => {
    if (!data?.daily_totals?.length) return [];
    return data.daily_totals.map((d) => ({
      date: d.date.slice(5),
      calls: d.calls,
    }));
  }, [data]);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <Link
        href="/admin/partners"
        className="text-sm text-sky-400 hover:underline"
      >
        ← Partners
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-white">Partner usage</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Partner <code className="text-zinc-400">{id}</code> — daily calls from{" "}
          <code className="text-zinc-400">api_keys_daily_usage</code>.
        </p>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      {!data && !err && <p className="text-sm text-zinc-500">Loading…</p>}
      {data && (
        <>
          <div className="h-72 rounded-xl border border-zinc-800 p-4 bg-zinc-900/30">
            <p className="text-xs text-zinc-500 mb-2">
              Total calls per day (all keys)
            </p>
            {chartData.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">
                No usage rows in range.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#a1a1aa", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #27272a",
                    }}
                  />
                  <Bar dataKey="calls" fill="#38bdf8" name="Calls" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="rounded-xl border border-zinc-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2 text-right">Calls (range)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.keys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {k.key_masked}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{k.name || "—"}</td>
                    <td className="px-3 py-2">{k.is_active ? "yes" : "no"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {k.daily
                        .reduce((s, d) => s + d.calls, 0)
                        .toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
