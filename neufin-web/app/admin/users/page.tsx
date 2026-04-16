"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { UserAdminRow } from "@/app/api/admin/users/route";

type StatusFilter = "all" | "trial" | "active" | "expired" | "suspended";

type RowMessage = { id: string; msg: string; ok: boolean } | null;

const PLAN_OPTIONS = ["free", "retail", "advisor", "enterprise"] as const;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function trialEnds(startedAt: string | null) {
  if (!startedAt) return "—";
  const ends = new Date(new Date(startedAt).getTime() + 14 * 86400_000);
  const daysLeft = Math.ceil((ends.getTime() - Date.now()) / 86400_000);
  if (daysLeft <= 0) return `Expired (${formatDate(ends.toISOString())})`;
  return `${daysLeft}d (${formatDate(ends.toISOString())})`;
}

function statusBadge(s: string | null | undefined) {
  const val = (s || "unknown").toLowerCase();
  const cls =
    val === "active"
      ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700"
      : val === "trial"
        ? "bg-sky-900/60 text-sky-300 border border-sky-700"
        : val === "suspended"
          ? "bg-red-900/60 text-red-300 border border-red-700"
          : "bg-zinc-800 text-zinc-400 border border-zinc-700";
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs capitalize ${cls}`}>
      {val}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

async function readError(res: Response) {
  const body = await res.json().catch(() => ({}));
  return (body as { detail?: string; message?: string }).detail ??
    (body as { detail?: string; message?: string }).message ??
    `HTTP ${res.status}`;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<RowMessage>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "100");
      qs.set("offset", "0");
      if (filter !== "all") qs.set("plan", filter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await apiFetch(`/api/admin/users?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await readError(res));
      setRows(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.email || "").localeCompare(b.email || ""),
      ),
    [rows],
  );

  const summary = useMemo(
    () => ({
      total: rows.length,
      trial: rows.filter((row) => row.subscription_status === "trial").length,
      active: rows.filter((row) => row.subscription_status === "active").length,
      expired: rows.filter((row) => row.subscription_status === "expired").length,
      suspended: rows.filter((row) => row.subscription_status === "suspended")
        .length,
    }),
    [rows],
  );

  async function runRowAction(
    userId: string,
    action: () => Promise<string>,
  ) {
    setActionLoading(userId);
    try {
      const msg = await action();
      setActionMsg({ id: userId, msg, ok: true });
      await load();
    } catch (e) {
      setActionMsg({
        id: userId,
        msg: e instanceof Error ? e.message : String(e),
        ok: false,
      });
    } finally {
      setActionLoading(null);
      window.setTimeout(() => setActionMsg(null), 3500);
    }
  }

  return (
    <div className="p-6 max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Users</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Manage subscriptions, onboarding, account recovery, and access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Loaded users" value={summary.total} />
        <SummaryCard label="Active" value={summary.active} tone="text-emerald-300" />
        <SummaryCard label="Trial" value={summary.trial} tone="text-sky-300" />
        <SummaryCard label="Expired" value={summary.expired} tone="text-amber-300" />
        <SummaryCard
          label="Suspended"
          value={summary.suspended}
          tone="text-red-300"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email, name, firm…"
          className="min-w-[240px] flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
        />
        {(["all", "trial", "active", "expired", "suspended"] as const).map(
          (value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${
                filter === value
                  ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {value}
            </button>
          ),
        )}
      </div>

      {err && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Trial ends</th>
              <th className="px-3 py-2">Analyses</th>
              <th className="px-3 py-2">Reports</th>
              <th className="px-3 py-2">Last active</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-zinc-600">
                  No users match this filter.
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const isLoading = actionLoading === row.id;
                const msg = actionMsg?.id === row.id ? actionMsg : null;
                const isSuspended = row.subscription_status === "suspended";

                return (
                  <tr key={row.id} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2 text-xs">
                      <div className="max-w-[240px] truncate text-sm text-zinc-200">
                        {row.email}
                      </div>
                      <div className="text-zinc-500">{row.name || "—"}</div>
                      {row.firm_name ? (
                        <div className="text-zinc-600">{row.firm_name}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.subscription_tier ?? ""}
                        disabled={isLoading}
                        onChange={(e) => {
                          const nextTier = e.target.value;
                          if (!nextTier || nextTier === row.subscription_tier) return;
                          void runRowAction(row.id, async () => {
                            const res = await apiFetch(
                              `/api/admin/users/${encodeURIComponent(row.id)}/plan`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  subscription_tier: nextTier,
                                  subscription_status:
                                    nextTier === "free" ? "expired" : "active",
                                }),
                              },
                            );
                            if (!res.ok) throw new Error(await readError(res));
                            return `Plan updated to ${nextTier}`;
                          });
                        }}
                        className="cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 disabled:opacity-50"
                      >
                        <option value="">{row.subscription_tier || "—"}</option>
                        {PLAN_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">{statusBadge(row.subscription_status)}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {trialEnds(row.trial_started_at)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-300">
                      {row.dna_score_count}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-300">
                      {row.reports_purchased}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {formatDate(row.last_sign_in_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {row.role || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {msg ? (
                        <span
                          className={`text-xs ${
                            msg.ok ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {msg.msg}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/admin/users/${row.id}`}
                            className="text-xs text-sky-400 hover:underline"
                          >
                            Detail
                          </Link>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() =>
                              void runRowAction(row.id, async () => {
                                const res = await apiFetch(
                                  `/api/admin/users/${encodeURIComponent(row.id)}/resend-onboarding`,
                                  { method: "POST" },
                                );
                                if (!res.ok) throw new Error(await readError(res));
                                return "Onboarding email sent";
                              })
                            }
                            className="text-xs text-violet-300 hover:underline disabled:opacity-40"
                          >
                            Onboard
                          </button>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() =>
                              void runRowAction(row.id, async () => {
                                const res = await apiFetch(
                                  `/api/admin/users/${encodeURIComponent(row.id)}/reset-password`,
                                  { method: "POST" },
                                );
                                const body = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                  throw new Error(
                                    (body as { detail?: string }).detail ??
                                      `HTTP ${res.status}`,
                                  );
                                }
                                const link = (body as { action_link?: string })
                                  .action_link;
                                if (link) window.prompt("Recovery link (copy now)", link);
                                return "Recovery link generated";
                              })
                            }
                            className="text-xs text-zinc-300 hover:underline disabled:opacity-40"
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() =>
                              void runRowAction(row.id, async () => {
                                const res = await apiFetch(
                                  `/api/admin/users/${encodeURIComponent(row.id)}/extend-trial`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({ days: 14 }),
                                  },
                                );
                                if (!res.ok) throw new Error(await readError(res));
                                return "Trial extended by 14 days";
                              })
                            }
                            className="text-xs text-amber-300 hover:underline disabled:opacity-40"
                          >
                            +14d
                          </button>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                              const prompt = isSuspended
                                ? "Unsuspend this user?"
                                : "Suspend this user?";
                              if (!window.confirm(prompt)) return;
                              void runRowAction(row.id, async () => {
                                const res = await apiFetch(
                                  `/api/admin/users/${encodeURIComponent(row.id)}/suspend`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({ unsuspend: isSuspended }),
                                  },
                                );
                                if (!res.ok) throw new Error(await readError(res));
                                return isSuspended
                                  ? "User unsuspended"
                                  : "User suspended";
                              });
                            }}
                            className={`text-xs hover:underline disabled:opacity-40 ${
                              isSuspended ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {isSuspended ? "Unsuspend" : "Suspend"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
