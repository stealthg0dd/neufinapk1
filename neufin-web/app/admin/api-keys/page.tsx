"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost } from "@/lib/api-client";

type KeyRow = {
  id: string;
  partner_id: string;
  partner_email?: string;
  key_masked: string;
  created_at?: string;
  last_used_at?: string | null;
  calls_today: number;
  calls_month: number;
  status: string;
  rate_limit_daily?: number | null;
  plan?: string | null;
};

export default function AdminApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiFetch("/api/admin/api-keys", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const j = await res.json();
      setKeys(j.keys ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-white">API keys</h1>
          <p className="text-sm text-zinc-500 mt-1">
            All issued keys (hashed at rest).
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            const pid = window.prompt("Partner user UUID");
            if (!pid) return;
            try {
              const out = await apiPost<{ key?: string }>(
                "/api/admin/api-keys/issue",
                {
                  partner_id: pid,
                  name: "admin-issued",
                },
              );
              if (out.key) window.prompt("New key", out.key);
              await load();
            } catch (e) {
              alert(e instanceof Error ? e.message : String(e));
            }
          }}
          className="text-sm rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 font-medium"
        >
          Issue key
        </button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Partner</th>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Today</th>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {keys.map((k) => (
              <tr key={k.id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-2 text-zinc-300">
                  {k.partner_email || k.partner_id}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                  {k.key_masked}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {k.created_at?.slice(0, 10) || "—"}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {k.last_used_at?.slice(0, 10) || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">{k.calls_today}</td>
                <td className="px-3 py-2 tabular-nums">{k.calls_month}</td>
                <td className="px-3 py-2">{k.status}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button
                    type="button"
                    className="text-xs text-red-300 hover:underline"
                    onClick={async () => {
                      if (!confirm("Revoke this key immediately?")) return;
                      try {
                        await apiPost(
                          `/api/admin/api-keys/${encodeURIComponent(k.id)}/revoke`,
                          {},
                        );
                        await load();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Revoke
                  </button>
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:underline"
                    onClick={async () => {
                      const v = window.prompt(
                        "New daily rate limit",
                        String(k.rate_limit_daily ?? 10000),
                      );
                      if (!v) return;
                      const res = await apiFetch(
                        `/api/admin/api-keys/${encodeURIComponent(k.id)}/rate-limit`,
                        {
                          method: "PATCH",
                          body: JSON.stringify({ rate_limit_daily: Number(v) }),
                        },
                      );
                      if (!res.ok) alert(`HTTP ${res.status}`);
                      await load();
                    }}
                  >
                    Rate limit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
