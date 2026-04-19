"use client";

import { Fragment, useMemo, useState } from "react";
import clsx from "clsx";

type Incident = {
  source?: string;
  severity?: string;
  service?: string | null;
  environment?: string | null;
  title?: string;
  fingerprint?: string;
  count?: number | null;
  latest_message?: string | null;
  status?: string;
  remediation_link?: string | null;
  last_seen?: string | null;
};

type DepView = {
  platform?: string;
  deployment_id?: string | null;
  status?: string | null;
  environment?: string | null;
  service_name?: string | null;
  commit_sha?: string | null;
  created_at?: string | null;
  duration_ms?: number | null;
  rollback_candidate?: boolean;
  url?: string | null;
  logs_summary?: string;
};

export type UnifiedObservabilityPayload = {
  generated_at?: string;
  disclaimer?: string;
  incidents?: {
    current?: Incident[];
    failing_services?: string[];
    top_recurring?: Incident[];
    environment_breakdown?: Record<string, number>;
  };
  deployments?: {
    vercel?: { latest?: DepView | null; failed_last_7d?: DepView[] };
    railway?: { latest?: DepView | null; failed_last_7d?: DepView[] };
  };
  service_health?: {
    http_24h?: Record<string, unknown>;
    sources?: {
      source: string;
      stale?: boolean;
      last_success_at?: string | null;
      ingest_error?: string | null;
    }[];
    ingest_notes?: string[];
  };
};

function fmtDur(ms: number | null | undefined) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function ObservabilitySummary({
  data,
}: {
  data: UnifiedObservabilityPayload | undefined;
}) {
  const [openFp, setOpenFp] = useState<string | null>(null);
  const incidents = data?.incidents?.current ?? [];
  const top = data?.incidents?.top_recurring ?? incidents.slice(0, 10);
  const vLatest = data?.deployments?.vercel?.latest;
  const rLatest = data?.deployments?.railway?.latest;
  const sources = data?.service_health?.sources ?? [];
  const http = data?.service_health?.http_24h ?? {};

  const staleSources = useMemo(
    () => sources.filter((s) => s.stale).map((s) => s.source),
    [sources],
  );

  if (!data) {
    return (
      <p className="text-sm text-zinc-500">No unified observability payload.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">
            Last synthesized{" "}
            <span className="font-mono text-zinc-300">
              {data.generated_at ?? "—"}
            </span>
          </p>
          <p className="mt-1 max-w-3xl text-xs text-zinc-600">{data.disclaimer}</p>
        </div>
        {staleSources.length > 0 && (
          <span className="rounded-full border border-amber-900/50 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200">
            Stale sources: {staleSources.join(", ")}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs font-semibold uppercase text-cyan-600/90">
            Vercel — latest
          </p>
          {vLatest ? (
            <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-400">
              <li>Status · {vLatest.status ?? "—"}</li>
              <li>Env · {vLatest.environment ?? "—"}</li>
              <li>Commit · {vLatest.commit_sha ?? "—"}</li>
              <li>Duration · {fmtDur(vLatest.duration_ms)}</li>
              <li>
                Rollback candidate ·{" "}
                {vLatest.rollback_candidate ? "yes" : "no"}
              </li>
              {vLatest.url && (
                <li>
                  <a
                    href={vLatest.url.startsWith("http") ? vLatest.url : `https://${vLatest.url}`}
                    className="text-cyan-500 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open deployment
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No deployment rows.</p>
          )}
          <p className="mt-2 text-[11px] text-zinc-600">{vLatest?.logs_summary}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Railway — latest
          </p>
          {rLatest ? (
            <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-400">
              <li>Status · {rLatest.status ?? "—"}</li>
              <li>Service · {rLatest.service_name ?? "—"}</li>
              <li>Env · {rLatest.environment ?? "—"}</li>
              <li>
                Rollback candidate ·{" "}
                {rLatest.rollback_candidate ? "yes" : "no"}
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No deployment rows.</p>
          )}
          <p className="mt-2 text-[11px] text-zinc-600">{rLatest?.logs_summary}</p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase text-zinc-500">
          API process (24h)
        </h3>
        <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-400">
          {JSON.stringify(http, null, 2)}
        </pre>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase text-zinc-500">
          Current incidents &amp; recurring
        </h3>
        <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
                <th className="px-3 py-2">Sev</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Env</th>
                <th className="px-3 py-2">Count</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {top.map((inc) => (
                <Fragment key={inc.fingerprint ?? inc.title}>
                  <tr className="border-b border-zinc-800/60 hover:bg-zinc-900/30">
                    <td className="px-3 py-2 text-zinc-400">{inc.severity}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                      {inc.source}
                    </td>
                    <td className="px-3 py-2 text-zinc-200">{inc.title}</td>
                    <td className="px-3 py-2 text-zinc-500">
                      {inc.environment ?? "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-400">
                      {inc.count ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs text-cyan-500 hover:underline"
                        onClick={() =>
                          setOpenFp((v) =>
                            v === inc.fingerprint ? null : inc.fingerprint ?? null,
                          )
                        }
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                  {openFp === inc.fingerprint && (
                    <tr className="bg-black/20">
                      <td colSpan={6} className="px-3 py-2 text-xs text-zinc-500">
                        <p className="font-mono text-zinc-400">
                          fp {inc.fingerprint}
                        </p>
                        <p className="mt-1">{inc.latest_message}</p>
                        {inc.remediation_link && (
                          <a
                            href={inc.remediation_link}
                            className="mt-2 inline-block text-cyan-500 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Remediation / provider
                          </a>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
          <p className="text-xs uppercase text-zinc-500">Failing services</p>
          <p className="mt-1 text-zinc-300">
            {(data.incidents?.failing_services ?? []).join(", ") || "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
          <p className="text-xs uppercase text-zinc-500">Env breakdown</p>
          <pre className="mt-1 text-xs text-zinc-400">
            {JSON.stringify(data.incidents?.environment_breakdown ?? {}, null, 2)}
          </pre>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase text-zinc-500">
          Connector ingest health
        </h3>
        <ul className="mt-2 space-y-2">
          {sources.map((s) => (
            <li
              key={s.source}
              className={clsx(
                "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs",
                s.stale
                  ? "border-amber-900/40 bg-amber-950/20 text-amber-100"
                  : "border-zinc-800 bg-zinc-900/30 text-zinc-400",
              )}
            >
              <span className="font-mono">{s.source}</span>
              <span>
                {s.stale ? "stale" : "fresh"} · last ok{" "}
                {s.last_success_at ?? "—"}
              </span>
              {s.ingest_error && (
                <span className="w-full text-amber-200/90">{s.ingest_error}</span>
              )}
            </li>
          ))}
        </ul>
        {(data.service_health?.ingest_notes?.length ?? 0) > 0 && (
          <p className="mt-2 text-xs text-amber-200/80">
            {(data.service_health?.ingest_notes ?? []).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
