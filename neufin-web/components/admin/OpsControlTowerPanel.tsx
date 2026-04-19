"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import clsx from "clsx";
import {
  ObservabilitySummary,
  type UnifiedObservabilityPayload,
} from "@/components/admin/ObservabilitySummary";

type AIAccount = {
  provider_name: string;
  account_name: string;
  workspace_or_org?: string | null;
  model_name?: string | null;
  billing_cycle_start?: string | null;
  billing_cycle_end?: string | null;
  quota_type?: string;
  quota_limit?: number | null;
  quota_used?: number | null;
  quota_remaining?: number | null;
  cost_to_date_usd?: number | null;
  estimated_runway_days?: number | null;
  refresh_source: string;
  last_synced_at?: string | null;
  sync_confidence?: number;
  notes?: string | null;
};

type ControlTower = {
  generated_at?: string;
  cache_hit?: boolean;
  refreshed?: boolean;
  cache_ttl_seconds?: number;
  limitations?: string;
  manual_overrides_merged?: boolean;
  connectors?: Record<string, unknown>;
  repo_intelligence?: {
    loc_analytics?: Record<string, unknown>;
    engineering_health?: Record<string, unknown>;
  };
  ai_usage?: {
    accounts: AIAccount[];
    total_cost_usd_by_provider?: Record<string, number>;
    total_cost_usd_by_model?: Record<string, number>;
    top_models_by_spend?: { model: string; cost_usd: number }[];
  };
  github?: Record<string, unknown> | null;
  unified_observability?: UnifiedObservabilityPayload;
  deployments?: {
    vercel?: Record<string, unknown>;
    railway?: Record<string, unknown>;
  };
  errors?: Record<string, unknown>;
  integrations?: { id: string; automation?: string; detail?: string }[];
  alerts?: {
    severity?: string;
    type?: string;
    message?: string;
    provider?: string;
  }[];
  audit_sync_logs?: { at?: string; event?: string; message?: string }[];
  automation_summary?: {
    fully_automated?: string[];
    partial?: string[];
    manual_or_placeholder?: string[];
  };
};

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "ai-usage", label: "AI usage" },
  { id: "repo", label: "Repo" },
  { id: "connectors", label: "Connectors" },
  { id: "operations", label: "Deployments & incidents" },
  { id: "integrations", label: "Integrations" },
  { id: "audit", label: "Audit / sync" },
] as const;

function fmtUsd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function SyncBadge({ confidence }: { confidence?: number }) {
  const c = confidence ?? 0;
  const label =
    c >= 0.85 ? "high" : c >= 0.5 ? "medium" : c > 0 ? "low" : "manual";
  return (
    <span
      className={clsx(
        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        label === "high" && "bg-emerald-950/80 text-emerald-300",
        label === "medium" && "bg-amber-950/80 text-amber-200",
        (label === "low" || label === "manual") &&
          "bg-zinc-800 text-zinc-400",
      )}
    >
      sync {label} · {c.toFixed(2)}
    </span>
  );
}

function SourcePill({ source }: { source: string }) {
  return (
    <span className="rounded-md border border-zinc-700/80 bg-zinc-900/60 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
      {source.replace(/_/g, " ")}
    </span>
  );
}

function WeekHeatmap({ weeks }: { weeks: number[] }) {
  if (!weeks.length) return <p className="text-sm text-zinc-500">No data</p>;
  const max = Math.max(...weeks, 1);
  return (
    <div className="flex h-10 items-end gap-px">
      {weeks.map((w, i) => (
        <div
          key={i}
          title={`Week ${i + 1}: ${w} commits`}
          className="min-w-[6px] flex-1 rounded-sm bg-cyan-900/40"
          style={{
            height: `${Math.max(8, (w / max) * 100)}%`,
            opacity: 0.35 + (w / max) * 0.65,
          }}
        />
      ))}
    </div>
  );
}

export default function OpsControlTowerPanel() {
  const [data, setData] = useState<ControlTower | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>(
    "overview",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/admin/control-tower", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const j = (await res.json()) as ControlTower;
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncPersist = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/admin/control-tower/refresh", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const j = (await res.json()) as ControlTower;
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to sync");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accounts = data?.ai_usage?.accounts ?? [];
  const byProv = data?.ai_usage?.total_cost_usd_by_provider ?? {};
  const topModels = data?.ai_usage?.top_models_by_spend ?? [];
  const anthropicAccounts = accounts.filter(
    (a) => a.provider_name === "anthropic",
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-cyan-500/90">
            Operations
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            Control tower
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Unified visibility for LLM spend, repository signals, deploys, and
            process errors. Source types and sync confidence are explicit — we do
            not imply automation where APIs are not wired.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>
            Generated:{" "}
            <span className="font-mono text-zinc-300">
              {data?.generated_at ?? "—"}
            </span>
          </span>
          <span
            className={clsx(
              "rounded-full px-2 py-0.5",
              data?.cache_hit
                ? "bg-zinc-800 text-zinc-400"
                : "bg-emerald-950/50 text-emerald-300",
            )}
          >
            {data?.cache_hit ? "cache hit" : "fresh fetch"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void syncPersist()}
            disabled={loading}
            className="rounded-lg border border-cyan-900/60 bg-cyan-950/40 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-950/60 disabled:opacity-50"
          >
            Sync &amp; persist
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-800/60 pb-3">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setActive(s.id);
              document.getElementById(s.id)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active === s.id
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading && !data && (
        <p className="text-sm text-zinc-500">Loading snapshot…</p>
      )}

      {data && (
        <>
          <section id="overview" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Overview
            </h2>
            {data.manual_overrides_merged && (
              <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100/90">
                Manual JSON overrides merged into this snapshot (
                <code className="text-amber-200/90">OPS_CONTROL_TOWER_MANUAL_JSON</code>
                ).
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs uppercase text-zinc-500">Automated</p>
                <p className="mt-1 text-lg text-white">
                  {(data.automation_summary?.fully_automated ?? []).join(", ") ||
                    "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs uppercase text-zinc-500">Partial</p>
                <p className="mt-1 text-lg text-white">
                  {(data.automation_summary?.partial ?? []).join(", ") || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs uppercase text-zinc-500">
                  Manual / placeholder
                </p>
                <p className="mt-1 text-lg text-white">
                  {(data.automation_summary?.manual_or_placeholder ?? []).join(
                    ", ",
                  ) || "—"}
                </p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-zinc-500">
              {data.limitations}
            </p>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                Alerts
              </h3>
              {(data.alerts ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">No active alerts.</p>
              ) : (
                <ul className="space-y-2">
                  {(data.alerts ?? []).map((a, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm"
                    >
                      <span
                        className={clsx(
                          "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                          a.severity === "warning"
                            ? "bg-amber-400"
                            : "bg-zinc-500",
                        )}
                      />
                      <span className="text-zinc-300">{a.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section id="ai-usage" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              AI usage observatory
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <p className="text-xs uppercase text-zinc-500">
                  Spend by provider
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {Object.keys(byProv).length === 0 ? (
                    <li className="text-zinc-500">
                      No cost rows (add manual JSON or wire billing APIs).
                    </li>
                  ) : (
                    Object.entries(byProv).map(([k, v]) => (
                      <li
                        key={k}
                        className="flex justify-between gap-2 font-mono text-zinc-300"
                      >
                        <span>{k}</span>
                        <span>{fmtUsd(v)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <p className="text-xs uppercase text-zinc-500">
                  Top burn-rate models
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {topModels.length === 0 ? (
                    <li className="text-zinc-500">No per-model costs yet.</li>
                  ) : (
                    topModels.map((m) => (
                      <li
                        key={m.model}
                        className="flex justify-between gap-2 font-mono text-zinc-300"
                      >
                        <span className="truncate">{m.model}</span>
                        <span>{fmtUsd(m.cost_usd)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <p className="text-xs uppercase text-zinc-500">
                  Claude accounts
                </p>
                {anthropicAccounts.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    No anthropic rows — placeholder or add manual accounts.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {anthropicAccounts.map((a, i) => (
                      <li
                        key={i}
                        className="rounded border border-zinc-800/80 bg-black/20 px-2 py-1.5 text-sm"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="text-zinc-200">{a.account_name}</span>
                          <SyncBadge confidence={a.sync_confidence} />
                        </div>
                        {a.notes && (
                          <p className="mt-1 text-xs text-zinc-500">{a.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">Quota</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Sync</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a, i) => (
                    <tr
                      key={i}
                      className="border-b border-zinc-800/60 hover:bg-zinc-900/30"
                    >
                      <td className="px-3 py-2 font-medium text-zinc-200">
                        {a.provider_name}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {a.account_name}
                        {a.workspace_or_org ? (
                          <span className="ml-1 text-xs text-zinc-500">
                            ({a.workspace_or_org})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                        {a.model_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {a.quota_limit != null && a.quota_used != null ? (
                          <>
                            {a.quota_used.toLocaleString()} /{" "}
                            {a.quota_limit.toLocaleString()}{" "}
                            <span className="text-zinc-600">
                              (
                              {fmtPct(
                                a.quota_limit > 0
                                  ? a.quota_used / a.quota_limit
                                  : undefined,
                              )}
                              )
                            </span>
                          </>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">
                        {fmtUsd(a.cost_to_date_usd)}
                      </td>
                      <td className="px-3 py-2">
                        <SourcePill source={a.refresh_source} />
                      </td>
                      <td className="px-3 py-2">
                        <SyncBadge confidence={a.sync_confidence} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                        {a.last_synced_at ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(accounts.some((a) => a.notes) ||
              accounts.some((a) => a.sync_confidence === 0)) && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-zinc-500">
                  Notes & limitations
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-500">
                  {accounts.map(
                    (a, i) =>
                      a.notes && (
                        <li key={i}>
                          <span className="text-zinc-400">
                            {a.provider_name}/{a.account_name}:
                          </span>{" "}
                          {a.notes}
                        </li>
                      ),
                  )}
                </ul>
              </div>
            )}
          </section>

          <section id="repo" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              GitHub / codebase
            </h2>
            {!data.github ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-500">
                No GitHub snapshot — set{" "}
                <code className="text-zinc-400">OPS_GITHUB_TOKEN</code> and{" "}
                <code className="text-zinc-400">OPS_GITHUB_REPO</code> on the API.
              </p>
            ) : data.github.ok === false ? (
              <p className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
                GitHub error:{" "}
                {String(
                  (data.github as { error?: string }).error ??
                    (data.github as { status?: number }).status ??
                    "unknown",
                )}
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-lg font-medium text-white">
                      {(data.github as { repository?: string }).repository}
                    </p>
                    <span className="text-xs text-zinc-500">
                      last sync{" "}
                      {(data.github as { last_synced_at?: string })
                        .last_synced_at ?? "—"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500">
                    {(data.github as { description?: string }).description ??
                      "—"}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-zinc-500">Default branch</p>
                      <p className="font-mono text-zinc-300">
                        {(data.github as { default_branch?: string })
                          .default_branch ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Open PRs</p>
                      <p className="text-zinc-300">
                        {String(
                          (data.github as { open_pull_requests?: number })
                            .open_pull_requests ??
                            (data.github as { open_pull_requests_hint?: number })
                              .open_pull_requests_hint ??
                            "—",
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Merged PRs (30d)</p>
                      <p className="text-zinc-300">
                        {String(
                          (data.github as { merged_pull_requests_30d?: number })
                            .merged_pull_requests_30d ?? "—",
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Contributors</p>
                      <p className="text-zinc-300">
                        {String(
                          (data.github as { contributors_count?: number })
                            .contributors_count ?? "—",
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Open issues</p>
                      <p className="text-zinc-300">
                        {String(
                          (data.github as { open_issues_count?: number })
                            .open_issues_count ?? "—",
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Stars</p>
                      <p className="text-zinc-300">
                        {String(
                          (data.github as { stars?: number }).stars ?? "—",
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Repo size (KB)</p>
                      <p className="text-zinc-300">
                        {String((data.github as { size_kb?: number }).size_kb ?? "—")}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-500">
                    <p className="font-semibold uppercase text-zinc-600">Recent commits</p>
                    <ul className="space-y-1 font-mono text-[11px] text-zinc-400">
                      {(
                        (data.github as { recent_commits?: { sha?: string; message?: string }[] })
                          .recent_commits ?? []
                      )
                        .slice(0, 6)
                        .map((c, i) => (
                          <li key={i}>
                            <span className="text-cyan-700/90">{c.sha}</span>{" "}
                            {c.message}
                          </li>
                        ))}
                    </ul>
                  </div>
                  <p className="text-xs text-zinc-600">
                    {(data.github as { notes?: string }).notes}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    Languages (bytes from GitHub API)
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-auto text-sm">
                    {Object.entries(
                      ((data.github as { languages_bytes?: Record<string, number> })
                        .languages_bytes ?? {}) as Record<string, number>,
                    )
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 14)
                      .map(([lang, bytes]) => (
                        <li
                          key={lang}
                          className="flex justify-between gap-2 font-mono text-xs text-zinc-400"
                        >
                          <span>{lang}</span>
                          <span>{bytes.toLocaleString()} B</span>
                        </li>
                      ))}
                  </ul>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">
                      Commit activity (12 weeks)
                    </p>
                    <WeekHeatmap
                      weeks={
                        (data.github as { commit_activity_last_12_weeks?: number[] })
                          .commit_activity_last_12_weeks ?? []
                      }
                    />
                  </div>
                </div>
              </div>
            )}
            {data.repo_intelligence?.loc_analytics &&
              !(data.repo_intelligence.loc_analytics as { skipped?: boolean }).skipped && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    LOC scan (excludes node_modules, build dirs, lockfiles)
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
                    {Number(
                      (data.repo_intelligence.loc_analytics as { total_loc?: number })
                        .total_loc ?? 0,
                    ).toLocaleString()}{" "}
                    <span className="text-sm font-normal text-zinc-500">lines</span>
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(
                      ((data.repo_intelligence.loc_analytics as { loc_by_language?: Record<string, number> })
                        .loc_by_language ?? {}) as Record<string, number>,
                    )
                      .slice(0, 12)
                      .map(([lang, n]) => (
                        <div
                          key={lang}
                          className="flex justify-between gap-2 rounded border border-zinc-800/80 bg-black/20 px-2 py-1 text-xs"
                        >
                          <span className="text-zinc-400">{lang}</span>
                          <span className="font-mono tabular-nums text-zinc-300">
                            {n.toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            {data.repo_intelligence?.engineering_health && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-400">
                <p className="text-xs font-semibold uppercase text-zinc-500">
                  Engineering health (heuristics)
                </p>
                <pre className="mt-2 max-h-40 overflow-auto text-xs">
                  {JSON.stringify(data.repo_intelligence.engineering_health, null, 2)}
                </pre>
              </div>
            )}
          </section>

          <section id="connectors" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Connector payloads
            </h2>
            <p className="text-sm text-zinc-500">
              Raw normalized output per provider (usage, deployments, sync status).
            </p>
            <pre className="max-h-[28rem] overflow-auto rounded-xl border border-zinc-800 bg-black/30 p-4 text-xs text-zinc-400">
              {JSON.stringify(data.connectors ?? {}, null, 2)}
            </pre>
          </section>

          <section id="operations" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Unified deployments &amp; incidents
            </h2>
            <p className="max-w-3xl text-sm text-zinc-500">
              One operational slice across Vercel, Railway, API process metrics, and
              optional Sentry — not a SIEM. Expand a row for fingerprint / remediation.
              Raw connector payloads remain under Connectors if you need full JSON.
            </p>
            <ObservabilitySummary data={data.unified_observability} />
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-400">
                Raw errors payload (legacy API health block)
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto text-xs text-zinc-500">
                {JSON.stringify(data.errors ?? {}, null, 2)}
              </pre>
            </details>
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-400">
                Raw deployment blobs (per platform)
              </summary>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <pre className="max-h-64 overflow-auto text-xs text-zinc-500">
                  {JSON.stringify(data.deployments?.vercel ?? {}, null, 2)}
                </pre>
                <pre className="max-h-64 overflow-auto text-xs text-zinc-500">
                  {JSON.stringify(data.deployments?.railway ?? {}, null, 2)}
                </pre>
              </div>
            </details>
          </section>

          <section id="integrations" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Integrations
            </h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Automation</th>
                    <th className="px-3 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.integrations ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-800/60 hover:bg-zinc-900/30"
                    >
                      <td className="px-3 py-2 font-mono text-zinc-300">
                        {row.id}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={clsx(
                            "rounded px-2 py-0.5 text-xs font-medium",
                            row.automation === "full" &&
                              "bg-emerald-950/60 text-emerald-300",
                            row.automation === "partial" &&
                              "bg-amber-950/60 text-amber-200",
                            (row.automation === "none" || !row.automation) &&
                              "bg-zinc-800 text-zinc-500",
                          )}
                        >
                          {row.automation ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {row.detail ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="audit" className="scroll-mt-24 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Audit / sync logs
            </h2>
            <ul className="space-y-2">
              {(data.audit_sync_logs ?? []).map((log, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 font-mono text-xs text-zinc-400"
                >
                  <span className="text-zinc-500">{log.at}</span>{" "}
                  <span className="text-zinc-300">{log.event}</span> —{" "}
                  {log.message}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
