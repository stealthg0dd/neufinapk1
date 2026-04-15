"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { CheckCircle } from "lucide-react";

export interface AgentTraceItem {
  agent: string;
  status: "running" | "complete" | "failed";
  summary: string;
  ts: string;
}

type JobStatus = "idle" | "queued" | "running" | "complete" | "failed";

const AGENT_CONFIG: Record<
  string,
  { mono: string; color: string; label: string }
> = {
  market_regime: { mono: "MR", color: "#DC2626", label: "MARKET REGIME" },
  strategist: { mono: "PS", color: "#d97706", label: "STRATEGIST" },
  quant: { mono: "QA", color: "#2563eb", label: "QUANT" },
  tax_architect: { mono: "TO", color: "#d97706", label: "TAX ARCHITECT" },
  risk_sentinel: { mono: "RR", color: "#DC2626", label: "RISK SENTINEL" },
  alpha_scout: { mono: "AD", color: "#16A34A", label: "ALPHA SCOUT" },
  synthesizer: { mono: "IC", color: "#7c3aed", label: "SYNTHESIZER" },
};

const AGENT_ORDER = [
  "market_regime",
  "strategist",
  "quant",
  "tax_architect",
  "risk_sentinel",
  "alpha_scout",
  "synthesizer",
] as const;

function statusBadge(badge: "DONE" | "RUNNING" | "FAILED" | "WAITING"): {
  node: React.ReactNode;
  className: string;
} {
  if (badge === "DONE") {
    return {
      node: (
        <CheckCircle
          className="h-3.5 w-3.5 text-[#16A34A]"
          strokeWidth={2}
          aria-label="Complete"
        />
      ),
      className:
        "flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5",
    };
  }
  const label =
    badge === "RUNNING" ? "Running" : badge === "FAILED" ? "Failed" : "Waiting";
  const badgeClass =
    badge === "RUNNING"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : badge === "FAILED"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return {
    node: <span className="text-xs font-semibold">{label}</span>,
    className: `rounded border px-2 py-0.5 ${badgeClass}`,
  };
}

export default function SwarmTerminal({
  status,
  trace,
  onRetry,
}: {
  status: JobStatus;
  trace: AgentTraceItem[];
  onRetry: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [trace.length, status]);

  const byAgent = useMemo(() => {
    const map = new Map<string, AgentTraceItem>();
    for (const item of trace) map.set(item.agent, item);
    return map;
  }, [trace]);

  const completeCount = AGENT_ORDER.filter(
    (a) => byAgent.get(a)?.status === "complete",
  ).length;

  return (
    <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
        <div className="text-section-title pr-3">
          Portfolio Intelligence — Agent Analysis
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${status === "running" ? "animate-pulse bg-[#15803D]" : "bg-slate-300"}`}
          />
          <span className="rounded border border-[#BBF7D0] bg-[#DCFCE7] px-1.5 py-0.5 text-xs font-bold text-[#15803D]">
            LIVE
          </span>
        </div>
      </div>

      <div className="space-y-2 bg-[#F6F8FB] p-3">
        {AGENT_ORDER.map((agent) => {
          const cfg = AGENT_CONFIG[agent];
          const current = byAgent.get(agent);
          const badge =
            current?.status === "complete" || status === "complete"
              ? ("DONE" as const)
              : current?.status === "running" ||
                  (status === "running" && !current)
                ? ("RUNNING" as const)
                : current?.status === "failed" || status === "failed"
                  ? ("FAILED" as const)
                  : ("WAITING" as const);
          const { node, className: wrapClass } = statusBadge(badge);

          return (
            <div
              key={agent}
              className="rounded-md border border-[#E5E7EB] bg-white p-2.5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="agent-badge shrink-0">{cfg.mono}</span>
                  <span className="truncate text-sm font-semibold uppercase tracking-wide text-slate-800">
                    {cfg.label}
                  </span>
                </div>
                <div className={wrapClass}>{node}</div>
              </div>
              {current?.summary ? (
                <p className="mt-1.5 text-sm leading-snug text-slate-600">
                  {current.summary}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#E5E7EB] bg-white px-3 py-2">
        <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Progress</span>
          <span>{completeCount}/7 agents complete</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-sm bg-[#E5E7EB]">
          <div
            className="h-full rounded-sm bg-primary transition-all duration-500"
            style={{ width: `${(completeCount / 7) * 100}%` }}
          />
        </div>
      </div>

      {status === "complete" ? (
        <div className="border-t border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
          <p className="text-section-title text-[#0F172A]">IC briefing ready</p>
        </div>
      ) : null}

      {status === "failed" ? (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-red-800">
              Swarm failed before completion.
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-wide text-red-800 hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
