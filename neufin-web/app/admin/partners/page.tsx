"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiPost } from "@/lib/api-client";

type Partner = {
  id: string;
  firm: string;
  contact_email?: string;
  plan?: string | null;
  api_calls_30d: number;
  mrr_usd?: number | null;
  status?: string;
  integration_health: string;
  stripe_customer_id?: string | null;
  active_keys: number;
  total_keys?: number;
  last_used_at?: string | null;
};

function healthDot(h: string) {
  const c =
    h === "GREEN"
      ? "bg-emerald-400"
      : h === "AMBER"
        ? "bg-amber-400"
        : "bg-red-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} title={h} />;
}

function SummaryCard({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white tabular-nums">
        {value.toLocaleString()}
        {suffix}
      </p>
    </div>
  );
}

export default function AdminPartnersPage() {
  const [rows, setRows] = useState<Partner[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/partners", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        setRows(body.partners ?? []);
        setWarning(body.warning ?? null);
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
    if (!q) return rows;
    return rows.filter((row) =>
      [row.firm, row.contact_email, row.plan, row.status, row.integration_health]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const summary = useMemo(
    () => ({
      partners: filtered.length,
      activeKeys: filtered.reduce((sum, row) => sum + row.active_keys, 0),
      calls30d: filtered.reduce((sum, row) => sum + row.api_calls_30d, 0),
      stale: filtered.filter((row) => row.integration_health !== "GREEN").length,
    }),
    [filtered],
  );

  return (
    <div className="p-6 max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Partners</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage B2B API accounts, key lifecycle, and integration health.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Partners" value={summary.partners} />
        <SummaryCard label="Active keys" value={summary.activeKeys} />
        <SummaryCard label="API calls (30d)" value={summary.calls30d} />
        <SummaryCard label="Needs attention" value={summary.stale} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search partner, email, plan, status…"
          className="min-w-[240px] flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
        />
      </div>

      {warning ? (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          {warning}
        </div>
      ) : null}
      {err ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Partner</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">API (30d)</th>
              <th className="px-3 py-2">Keys</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-600">
                  No partners found.
                </td>
              </tr>
            ) : (
              filtered.map((partner) => (
                <tr key={partner.id} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-2">
                    <div className="text-zinc-200">{partner.firm}</div>
                    <div className="text-xs text-zinc-500">
                      {partner.contact_email || partner.id}
                    </div>
                  </td>
                  <td className="px-3 py-2">{partner.plan || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {partner.api_calls_30d.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">
                    {partner.active_keys}
                    {partner.total_keys != null ? (
                      <span className="text-xs text-zinc-500">
                        {" "}
                        / {partner.total_keys}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {partner.last_used_at
                      ? new Date(partner.last_used_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{partner.status || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {healthDot(partner.integration_health)}
                      <span className="text-xs text-zinc-500">
                        {partner.integration_health}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2 whitespace-nowrap">
                      <Link
                        href={`/admin/partners/${partner.id}/usage`}
                        className="text-xs text-sky-400 hover:underline"
                      >
                        Usage
                      </Link>
                      <button
                        type="button"
                        className="text-xs text-violet-300 hover:underline"
                        onClick={async () => {
                          try {
                            const out = await apiPost<{ key?: string }>(
                              "/api/admin/api-keys/issue",
                              {
                                partner_id: partner.id,
                                name: "partner-issued",
                              },
                            );
                            if (out.key) window.prompt("New key (copy now)", out.key);
                          } catch (e) {
                            alert(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        Issue key
                      </button>
                      <button
                        type="button"
                        className="text-xs text-amber-300 hover:underline"
                        onClick={async () => {
                          if (!window.confirm("Rotate API key? Old keys stop working."))
                            return;
                          try {
                            const out = await apiPost<{ key?: string }>(
                              `/api/admin/partners/${encodeURIComponent(partner.id)}/rotate-key`,
                              {},
                            );
                            if (out.key) window.prompt("New key (copy now)", out.key);
                          } catch (e) {
                            alert(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        Rotate
                      </button>
                      <a
                        className="text-xs text-zinc-400 hover:underline"
                        href={
                          partner.stripe_customer_id
                            ? `https://dashboard.stripe.com/customers/${partner.stripe_customer_id}`
                            : "https://dashboard.stripe.com/"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Stripe
                      </a>
                    </div>
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
