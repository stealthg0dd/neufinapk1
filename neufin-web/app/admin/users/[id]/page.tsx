"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost } from "@/lib/api-client";

type UserDetail = {
  id: string;
  email: string;
  name: string;
  firm_name?: string | null;
  subscription_status?: string;
  subscription_tier?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  role?: string | null;
  dna_score_count?: number;
  reports_purchased?: number;
};

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");
  const [u, setU] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setU(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function doAction(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label} — done`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (err || !u) {
    return (
      <div className="p-6 max-w-xl space-y-2">
        <Link
          href="/admin/users"
          className="text-sm text-sky-400 hover:underline"
        >
          ← Users
        </Link>
        <p className="text-red-400 text-sm">{err || "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl space-y-4">
      <Link
        href="/admin/users"
        className="text-sm text-sky-400 hover:underline"
      >
        ← Users
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-white">{u.email}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {u.name}
          {u.firm_name ? ` · ${u.firm_name}` : ""}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm border border-zinc-800 rounded-lg p-4 bg-zinc-900/40">
        <dt className="text-zinc-500">Status</dt>
        <dd>{u.subscription_status}</dd>
        <dt className="text-zinc-500">Tier</dt>
        <dd>{u.subscription_tier || "—"}</dd>
        <dt className="text-zinc-500">Role</dt>
        <dd>{u.role || "—"}</dd>
        <dt className="text-zinc-500">Trial ends</dt>
        <dd>{u.trial_ends_at || "—"}</dd>
        <dt className="text-zinc-500">DNA analyses</dt>
        <dd>{u.dna_score_count ?? 0}</dd>
        <dt className="text-zinc-500">Paid reports</dt>
        <dd>{u.reports_purchased ?? 0}</dd>
      </dl>

      {msg && <p className="text-sm text-zinc-300">{msg}</p>}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!!busy}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50"
          onClick={() =>
            doAction("Extend trial +7d", async () => {
              await apiPost(`/api/admin/users/${id}/extend-trial`, { days: 7 });
            })
          }
        >
          Extend trial (+7 days)
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50"
          onClick={() =>
            doAction("Upgrade to unlimited", async () => {
              await apiPost(`/api/admin/users/${id}/plan`, {
                subscription_tier: "enterprise",
                subscription_status: "active",
              });
            })
          }
        >
          Upgrade plan → enterprise / active
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50"
          onClick={() =>
            doAction("Resend onboarding", async () => {
              await apiPost(`/api/admin/users/${id}/resend-onboarding`, {});
            })
          }
        >
          Resend onboarding email
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50"
          onClick={() =>
            doAction("Reset password link", async () => {
              const res = await apiFetch(
                `/api/admin/users/${id}/reset-password`,
                { method: "POST" },
              );
              const j = await res.json().catch(() => ({}));
              if (!res.ok)
                throw new Error(
                  (j as { message?: string }).message || `${res.status}`,
                );
              const link = (j as { action_link?: string }).action_link;
              if (link) window.prompt("Recovery link (copy now)", link);
            })
          }
        >
          Reset password (recovery link)
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded-lg border border-amber-700/50 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50 text-amber-200"
          onClick={() =>
            doAction(
              u.subscription_status === "suspended" ? "Unsuspend" : "Suspend",
              async () => {
                await apiPost(`/api/admin/users/${id}/suspend`, {
                  unsuspend: u.subscription_status === "suspended",
                });
              },
            )
          }
        >
          {u.subscription_status === "suspended"
            ? "Unsuspend account"
            : "Suspend account"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50"
          onClick={() =>
            doAction("Set expired", async () => {
              await apiPost(`/api/admin/users/${id}/plan`, {
                subscription_status: "expired",
                subscription_tier: "free",
              });
            })
          }
        >
          Set plan → free / expired
        </button>
        {/* ── Admin Access Management ─────────────────────────────────── */}
        <div className="mt-2 border-t border-zinc-800 pt-3">
          <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide font-semibold">
            Admin Management
          </p>
          {u.role === "admin" ? (
            <button
              type="button"
              disabled={!!busy}
              className="rounded-lg border border-amber-700/60 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50 text-amber-200 w-full"
              onClick={() => {
                if (
                  !confirm(
                    `Revoke admin access from ${u.email}? They will be downgraded to advisor tier.`,
                  )
                )
                  return;
                void doAction("Revoke admin", async () => {
                  await apiPost(`/api/admin/users/${id}/plan`, {
                    role: "advisor",
                  });
                });
              }}
            >
              Revoke Admin Access
            </button>
          ) : (
            <button
              type="button"
              disabled={!!busy}
              className="rounded-lg border border-sky-700/60 px-3 py-2 text-sm text-left hover:bg-zinc-900 disabled:opacity-50 text-sky-200 w-full"
              onClick={() => {
                if (
                  !confirm(
                    `Grant admin access to ${u.email}? This gives full system access.`,
                  )
                )
                  return;
                void doAction("Grant admin", async () => {
                  await apiPost(`/api/admin/users/${id}/plan`, {
                    role: "admin",
                  });
                });
              }}
            >
              Grant Admin Access
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={!!busy}
          className="rounded-lg border border-red-800/60 px-3 py-2 text-sm text-left hover:bg-red-950/30 disabled:opacity-50 text-red-300"
          onClick={() => {
            if (!confirm("Permanently delete this user from Auth + database?"))
              return;
            void doAction("Delete user", async () => {
              const res = await apiFetch(`/api/admin/users/${id}`, {
                method: "DELETE",
              });
              if (!res.ok) throw new Error(`${res.status}`);
              router.push("/admin/users");
            });
          }}
        >
          Delete user…
        </button>
      </div>
    </div>
  );
}
