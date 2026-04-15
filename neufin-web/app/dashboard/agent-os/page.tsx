"use client";

/**
 * CTech Agent OS Monitoring Dashboard
 * Route: /dashboard/agent-os
 *
 * ROW 0 — NeuFin repo health (neufin-backend/web/mobile/agent) + scan findings
 * ROW 1 — Budget bar (today + monthly)
 * ROW 2 — Provider health grid
 * ROW 3 — Company status cards (agent count, last brief time, task queue)
 * ROW 4 — Today's briefs accordion (one per company)
 *
 * Polls /api/agent-os/status every 30 seconds.
 * NeuFin health polls /api/neufin/health every 60 seconds.
 * Tailwind only — no external UI libraries.
 * Dark-mode compatible using Tailwind dark: variants.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api-client";
import type {
  NeuFinHealthData,
  RepoHeartbeat,
  ScanFinding,
  RepoDeployment,
} from "@/app/api/neufin/health/route";

// ─────────────────────────────────────────────────────────────────────────────
// NeuFin Health types (imported from API route, re-stated for clarity)
// ─────────────────────────────────────────────────────────────────────────────

// Re-export types are imported above via the route module.

// ─────────────────────────────────────────────────────────────────────────────
// NeuFin Health — utilities
// ─────────────────────────────────────────────────────────────────────────────

const REPO_LABELS: Record<string, string> = {
  "neufin-backend": "Backend",
  "neufin-web": "Web",
  "neufin-mobile": "Mobile",
  "neufin-agent": "Agent",
};

function statusBadgeClass(status: RepoHeartbeat["status"]): string {
  switch (status) {
    case "live":
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    case "stale":
      return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30";
    case "offline":
      return "bg-red-500/15 text-red-400 border border-red-500/30";
  }
}

function statusDotClass(status: RepoHeartbeat["status"]): string {
  switch (status) {
    case "live":
      return "bg-emerald-400";
    case "stale":
      return "bg-yellow-400 animate-pulse";
    case "offline":
      return "bg-red-500";
  }
}

function severityClass(sev: ScanFinding["severity"]): string {
  switch (sev) {
    case "CRITICAL":
      return "bg-red-500/15 text-red-400 border border-red-500/30";
    case "HIGH":
      return "bg-orange-500/15 text-orange-400 border border-orange-500/30";
    case "MEDIUM":
      return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30";
    case "LOW":
      return "bg-[#F8FAFC] text-[#64748B]";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 0a — Repo health cards
// ─────────────────────────────────────────────────────────────────────────────

function RepoHealthCard({
  repo,
  deployment,
  onRunScan,
  scanning,
}: {
  repo: RepoHeartbeat;
  deployment: RepoDeployment | undefined;
  onRunScan?: () => void;
  scanning?: boolean;
}) {
  const label = REPO_LABELS[repo.repo_id] ?? repo.repo_id;

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        repo.status === "live"
          ? "border-[#E2E8F0] bg-white"
          : repo.status === "stale"
            ? "border-yellow-500/20 bg-yellow-500/5"
            : "border-red-500/20 bg-red-500/5"
      }`}
    >
      {/* Name + dot */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full flex-shrink-0 ${statusDotClass(repo.status)}`}
          />
          <span className="font-semibold text-sm text-navy">{label}</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-sm font-medium ${statusBadgeClass(repo.status)}`}
        >
          {repo.status.toUpperCase()}
        </span>
      </div>

      {/* Last seen */}
      <div className="space-y-1">
        {repo.last_seen && (
          <p className="text-sm text-[#94A3B8]">
            Last seen:{" "}
            <span className="text-[#64748B]">
              {relativeTime(repo.last_seen)}
            </span>
          </p>
        )}
        {repo.version && (
          <p className="text-sm text-[#94A3B8]">
            Version:{" "}
            <span className="text-[#64748B] font-mono">{repo.version}</span>
          </p>
        )}
        {deployment?.deployed_at && (
          <p className="text-sm text-[#94A3B8]">
            Deployed:{" "}
            <span className="text-[#64748B]">
              {relativeTime(deployment.deployed_at)}
            </span>
            {deployment.commit_sha && (
              <span className="ml-1 font-mono text-[#94A3B8]">
                {deployment.commit_sha.slice(0, 7)}
              </span>
            )}
          </p>
        )}
        {deployment?.commit_msg && (
          <p
            className="text-sm text-[#94A3B8] truncate"
            title={deployment.commit_msg}
          >
            {deployment.commit_msg}
          </p>
        )}
      </div>

      {/* Run scan button — only on backend */}
      {onRunScan && (
        <button
          onClick={onRunScan}
          disabled={scanning}
          className="w-full rounded-lg border border-primary/30 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
        >
          {scanning ? "Scanning…" : "▶ Run Scan"}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 0b — Top findings
// ─────────────────────────────────────────────────────────────────────────────

function ScanFindingsSection({
  findings,
  errorRate,
}: {
  findings: ScanFinding[];
  errorRate: NeuFinHealthData["error_rate"];
}) {
  if (
    findings.length === 0 &&
    errorRate.unresolved_critical === 0 &&
    errorRate.unresolved_high === 0
  ) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-navy/90">
            All clear — no open findings
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 space-y-3">
      {/* Error rate pills */}
      {(errorRate.unresolved_critical > 0 || errorRate.unresolved_high > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {errorRate.unresolved_critical > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
              {errorRate.unresolved_critical} CRITICAL
            </span>
          )}
          {errorRate.unresolved_high > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-sm font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30">
              {errorRate.unresolved_high} HIGH
            </span>
          )}
          <span className="text-sm text-[#94A3B8]">unresolved</span>
        </div>
      )}

      {/* Findings list */}
      <div className="divide-y divide-[#E2E8F0]/60">
        {findings.map((f) => (
          <div key={f.id} className="py-2.5 flex items-start gap-3">
            <span
              className={`mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold ${severityClass(f.severity)}`}
            >
              {f.severity}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-navy/90 leading-snug">{f.message}</p>
              <p className="text-sm text-[#94A3B8] mt-0.5">
                {f.category} · {f.repo_id} · {relativeTime(f.detected_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderStats {
  healthy: boolean;
  in_cooldown: boolean;
  cooldown_remaining_s: number;
  rpm_current: number;
  rpm_limit: number;
  avg_latency_ms: number;
  total_requests: number;
  total_failures: number;
  total_cost_usd: number;
  last_failure_reason: string | null;
}

interface RateLimitStats {
  rpm_current: number;
  rpm_limit: number;
  rpm_pct: number;
  tpm_current: number;
  tpm_limit: number;
  tpm_pct: number;
  cooldown_s: number;
  healthy: boolean;
  cost_today_usd: number;
}

interface BudgetReport {
  daily_spend: number;
  daily_cap: number;
  daily_remaining: number;
  monthly_spend: number;
  monthly_cap: number;
  monthly_remaining: number;
}

interface Brief {
  id?: string;
  company_id: string;
  content: string;
  created_at: string;
  actions_required?: unknown[];
}

type AgentDef = Record<string, unknown>;

interface DashboardData {
  timestamp: string;
  providers: Record<string, ProviderStats>;
  budget: BudgetReport;
  briefs: Brief[];
  agents: Record<string, Record<string, AgentDef>>;
  rateLimits: Record<string, RateLimitStats>;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY_LABELS: Record<string, string> = {
  neufin: "NeuFin",
  arisole: "Arisole",
  neumas: "Neumas",
  apex_golf: "Apex Golf",
  defquant: "DefQuant",
  ctech_corporate: "CTech Corp",
};

function displayName(slug: string): string {
  const label = Object.entries(COMPANY_LABELS).find(
    ([key]) => key === slug,
  )?.[1];
  if (label) return label;
  return slug.replace(/_/g, " ");
}

function pct(val: number, cap: number): number {
  if (!cap) return 0;
  return Math.min(100, Math.round((val / cap) * 100));
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function budgetBarClass(p: number): string {
  if (p >= 90) return "bg-red-500";
  if (p >= 70) return "bg-yellow-400";
  return "bg-emerald-500";
}

function budgetTextClass(p: number): string {
  if (p >= 90) return "text-red-400";
  if (p >= 70) return "text-yellow-400";
  return "text-emerald-400";
}

function providerDotClass(h: ProviderStats | RateLimitStats): string {
  if ("in_cooldown" in h && h.in_cooldown) return "bg-yellow-400 animate-pulse";
  if ("cooldown_s" in h && h.cooldown_s > 0)
    return "bg-yellow-400 animate-pulse";
  if (h.healthy) return "bg-emerald-400";
  return "bg-red-500";
}

function providerLabel(name: string): string {
  // "anthropic_sonnet_0" → "Anthropic Sonnet 0"
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 1 — Budget Bar
// ─────────────────────────────────────────────────────────────────────────────

function BudgetRow({ budget }: { budget: BudgetReport }) {
  const dayPct = pct(budget.daily_spend ?? 0, budget.daily_cap ?? 15);
  const monPct = pct(budget.monthly_spend ?? 0, budget.monthly_cap ?? 400);

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      {/* Today */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-navy">Today</span>
          <span
            className={`text-lg font-bold tabular-nums ${budgetTextClass(dayPct)}`}
          >
            ${(budget.daily_spend ?? 0).toFixed(2)}
          </span>
          <span className="text-sm text-[#94A3B8]">
            / ${(budget.daily_cap ?? 15).toFixed(2)}
          </span>
        </div>
        <span
          className={`text-xs font-medium tabular-nums ${budgetTextClass(dayPct)}`}
        >
          {dayPct}%
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-[#F8FAFC] overflow-hidden mb-4">
        <div
          className={`h-3 rounded-full transition-all duration-700 ${budgetBarClass(dayPct)}`}
          style={{ width: `${dayPct}%` }}
        />
      </div>

      {/* Monthly */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-[#64748B]">Monthly</span>
          <span
            className={`text-xs font-semibold tabular-nums ${budgetTextClass(monPct)}`}
          >
            ${(budget.monthly_spend ?? 0).toFixed(2)}
          </span>
          <span className="text-xs text-[#94A3B8]">
            / ${(budget.monthly_cap ?? 400).toFixed(2)}
          </span>
        </div>
        <span className={`text-xs tabular-nums ${budgetTextClass(monPct)}`}>
          {monPct}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[#F8FAFC] overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${budgetBarClass(monPct)}`}
          style={{ width: `${monPct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 2 — Provider health grid
// ─────────────────────────────────────────────────────────────────────────────

function ProviderCard({
  name,
  stats,
  rl,
}: {
  name: string;
  stats: ProviderStats;
  rl: RateLimitStats | undefined;
}) {
  const rpmPct = rl?.rpm_pct ?? pct(stats.rpm_current, stats.rpm_limit);
  const costToday = rl?.cost_today_usd ?? 0;

  return (
    <div
      className={`rounded-xl border p-3 space-y-2.5 ${
        stats.healthy && !stats.in_cooldown
          ? "border-[#E2E8F0] bg-white"
          : stats.in_cooldown
            ? "border-yellow-500/30 bg-yellow-500/5"
            : "border-red-500/30 bg-red-500/5"
      }`}
    >
      {/* Name + status dot */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${providerDotClass(stats)}`}
        />
        <span className="text-sm font-medium text-navy/90 leading-tight">
          {providerLabel(name)}
        </span>
      </div>

      {/* RPM gauge */}
      <div>
        <div className="flex justify-between text-sm text-[#94A3B8] mb-1">
          <span>RPM</span>
          <span className="tabular-nums">
            {stats.rpm_current}/{stats.rpm_limit}
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-[#F8FAFC]">
          <div
            className={`h-1 rounded-full transition-all ${
              rpmPct > 80
                ? "bg-red-500"
                : rpmPct > 50
                  ? "bg-yellow-400"
                  : "bg-sky-500"
            }`}
            style={{ width: `${rpmPct}%` }}
          />
        </div>
      </div>

      {/* Latency + cost */}
      <div className="flex justify-between text-sm">
        <span className="text-[#64748B]">
          {stats.avg_latency_ms > 0
            ? `${Math.round(stats.avg_latency_ms)}ms`
            : "—"}
        </span>
        <span className="text-[#64748B] tabular-nums">
          ${costToday.toFixed(4)}
        </span>
      </div>

      {stats.in_cooldown && stats.cooldown_remaining_s > 0 && (
        <p className="text-sm text-yellow-400">
          cooldown {Math.round(stats.cooldown_remaining_s)}s
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 3 — Company status cards
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY_COLORS: Record<string, string> = {
  neufin: "from-primary/20 to-primary-dark/10 border-primary-dark/30",
  arisole: "from-emerald-600/20 to-emerald-800/10 border-emerald-700/30",
  neumas: "from-purple-600/20 to-purple-800/10 border-purple-700/30",
  apex_golf: "from-amber-600/20 to-amber-800/10 border-amber-700/30",
  defquant: "from-rose-600/20 to-rose-800/10 border-rose-700/30",
  ctech_corporate: "from-[#E2E8F0]/20 to-[#F8FAFC]/10 border-[#E2E8F0]/30",
};

function companyColor(company: string): string {
  const color = Object.entries(COMPANY_COLORS).find(
    ([key]) => key === company,
  )?.[1];
  if (color) return color;
  return "from-[#E2E8F0]/20 to-[#F8FAFC]/10 border-[#E2E8F0]/30";
}

function providerRateLimit(
  limits: Record<string, RateLimitStats>,
  name: string,
): RateLimitStats | undefined {
  return Object.entries(limits).find(([key]) => key === name)?.[1];
}

function companyAgents(
  allAgents: Record<string, Record<string, AgentDef>>,
  company: string,
): Record<string, AgentDef> {
  return Object.entries(allAgents).find(([key]) => key === company)?.[1] ?? {};
}

function CompanyStatusCard({
  company,
  agentRoles,
  brief,
  onExpand,
  isExpanded,
}: {
  company: string;
  agentRoles: Record<string, AgentDef>;
  brief: Brief | undefined;
  onExpand: () => void;
  isExpanded: boolean;
}) {
  const agentCount = Object.keys(agentRoles).length;
  const colorClass = companyColor(company);
  const hasBrief = Boolean(brief);

  return (
    <button
      onClick={onExpand}
      className={`text-left rounded-xl border bg-gradient-to-br p-4 transition-all hover:brightness-110 ${colorClass} ${
        isExpanded ? "ring-1 ring-white/10" : ""
      }`}
    >
      {/* Company name + expand chevron */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-navy">{displayName(company)}</span>
        <svg
          className={`h-4 w-4 text-[#64748B] transition-transform ${isExpanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-sm text-[#94A3B8] mb-0.5">Agents</p>
          <p className="text-lg font-bold text-navy leading-none tabular-nums">
            {agentCount}
          </p>
        </div>
        <div>
          <p className="text-sm text-[#94A3B8] mb-0.5">Brief</p>
          <p className="text-xs font-medium text-navy/90 leading-none">
            {hasBrief ? relativeTime(brief!.created_at) : "none"}
          </p>
        </div>
        <div>
          <p className="text-sm text-[#94A3B8] mb-0.5">Status</p>
          <span
            className={`inline-block h-2 w-2 rounded-full ${hasBrief ? "bg-emerald-400" : "bg-[#94A3B8]"}`}
          />
        </div>
      </div>

      {/* Agent role pills */}
      <div className="flex flex-wrap gap-1 mt-3">
        {Object.keys(agentRoles)
          .slice(0, 4)
          .map((role) => (
            <span
              key={role}
              className="rounded-full bg-white/5 px-2 py-0.5 text-sm text-[#64748B]"
            >
              {role}
            </span>
          ))}
        {agentCount > 4 && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-sm text-[#94A3B8]">
            +{agentCount - 4}
          </span>
        )}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 4 — Briefs accordion
// ─────────────────────────────────────────────────────────────────────────────

function BriefAccordion({
  company,
  brief,
  open,
  onToggle,
}: {
  company: string;
  brief: Brief | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#F8FAFC]/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
              brief ? "bg-emerald-400" : "bg-[#94A3B8]"
            }`}
          />
          <span className="font-medium text-navy">{displayName(company)}</span>
          {brief && (
            <span className="text-xs text-[#94A3B8]">
              {relativeTime(brief.created_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!brief && (
            <span className="text-xs text-[#94A3B8]">no brief today</span>
          )}
          <svg
            className={`h-4 w-4 text-[#94A3B8] transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              d="M6 9l6 6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {/* Content */}
      <div
        ref={contentRef}
        className={`transition-all duration-300 overflow-hidden ${open ? "max-h-[600px]" : "max-h-0"}`}
      >
        <div className="border-t border-[#E2E8F0] px-5 py-4">
          {brief ? (
            <pre className="whitespace-pre-wrap font-mono text-xs text-[#64748B] leading-relaxed overflow-y-auto max-h-[500px]">
              {brief.content}
            </pre>
          ) : (
            <p className="text-sm text-[#94A3B8]">
              No brief generated yet today. Morning Engine runs at 07:00 SGT.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-[#F8FAFC] ${className}`} />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function AgentOSDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  // Which company's brief is expanded in ROW 3 (status card click)
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  // Which brief is open in ROW 4 accordion
  const [openBriefs, setOpenBriefs] = useState<Set<string>>(new Set());

  // ── NeuFin health state ────────────────────────────────────────────────────
  const [neufinHealth, setNeufinHealth] = useState<NeuFinHealthData | null>(
    null,
  );
  const [scanRunning, setScanRunning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/agent-os/status", { cache: "no-store" });
      const json = (await res.json()) as DashboardData;
      if (!res.ok || json.error)
        throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setFetchError(null);
      setPulse(true);
      setTimeout(() => setPulse(false), 700);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── NeuFin health refresh (60s poll) ────────────────────────────────────────
  const refreshNeufinHealth = useCallback(async () => {
    try {
      const res = await apiFetch("/api/neufin/health", { cache: "no-store" });
      if (res.ok) setNeufinHealth(await res.json());
    } catch {
      /* non-critical — fail silently */
    }
  }, []);

  // ── Run neufin-backend scan via agent-os proxy ────────────────────────────
  const runScan = useCallback(async () => {
    setScanRunning(true);
    setScanError(null);
    try {
      const res = await apiFetch(
        "/api/agent-os/repos/neufin-backend/run-scan",
        { method: "POST" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(j.detail ?? `HTTP ${res.status}`);
      }
      // Refresh health data after a brief delay to pick up new scan results
      setTimeout(refreshNeufinHealth, 3000);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanRunning(false);
    }
  }, [refreshNeufinHealth]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // NeuFin health: initial fetch + 60s poll
  useEffect(() => {
    refreshNeufinHealth();
    const id = setInterval(refreshNeufinHealth, 60_000);
    return () => clearInterval(id);
  }, [refreshNeufinHealth]);

  const toggleBrief = (company: string) => {
    setOpenBriefs((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;

  // ── Error state ──────────────────────────────────────────────────────────
  if (fetchError && !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <p className="font-semibold text-red-400">Agent OS unreachable</p>
          <p className="mt-1 text-sm text-red-400/70">{fetchError}</p>
          <p className="mt-2 text-xs text-[#94A3B8]">
            Check AGENT_OS_URL and AGENT_OS_API_KEY in Vercel environment
            variables.
          </p>
          <button
            onClick={refresh}
            className="mt-4 rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Section-label Tailwind classes (replaces styled-jsx)
  const SL =
    "text-sm font-semibold uppercase tracking-widest text-[#94A3B8] mb-2.5 block";

  const {
    providers = {},
    budget = {} as BudgetReport,
    briefs = [],
    agents = {},
    rateLimits = {},
    timestamp = "",
  } = data!;

  // Sort providers: unhealthy/cooldown first, then alphabetical
  const sortedProviders = Object.entries(providers).sort(
    ([an, av], [bn, bv]) => {
      const aScore = av.in_cooldown ? 1 : av.healthy ? 2 : 0;
      const bScore = bv.in_cooldown ? 1 : bv.healthy ? 2 : 0;
      if (aScore !== bScore) return aScore - bScore;
      return an.localeCompare(bn);
    },
  );

  // Companies: ventures first, ctech_corporate last
  const VENTURE_ORDER = [
    "neufin",
    "arisole",
    "neumas",
    "apex_golf",
    "defquant",
    "ctech_corporate",
  ];
  const companies = [
    ...VENTURE_ORDER.filter((c) => c in agents),
    ...Object.keys(agents)
      .filter((c) => !VENTURE_ORDER.includes(c))
      .sort(),
  ];

  const healthyCount = sortedProviders.filter(
    ([, v]) => v.healthy && !v.in_cooldown,
  ).length;

  return (
    <div className="min-h-screen bg-transparent text-navy">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agent OS</h1>
            <p className="text-sm text-[#64748B] mt-0.5">
              CTech venture intelligence platform ·{" "}
              {companies.filter((c) => c !== "ctech_corporate").length} ventures
              ·{" "}
              {Object.values(agents).reduce(
                (n, roles) => n + Object.keys(roles).length,
                0,
              )}{" "}
              agents
            </p>
          </div>
          <div className="flex items-center gap-3">
            {fetchError && (
              <span className="text-xs text-yellow-400">stale data</span>
            )}
            {/* Live pulse indicator */}
            <div className="flex items-center gap-1.5">
              <span className={`relative flex h-2 w-2 ${pulse ? "" : ""}`}>
                <span
                  className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${
                    pulse ? "animate-ping" : ""
                  }`}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs text-[#94A3B8]">
                {timestamp ? relativeTime(timestamp) : "—"}
              </span>
            </div>
            <button
              onClick={refresh}
              className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs text-navy/90 hover:border-[#94A3B8] hover:text-navy transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* ── ROW 0 — NeuFin Repo Health ─────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className={SL}>
              NeuFin Infra
              {neufinHealth && (
                <span className="ml-2 normal-case font-normal text-[#94A3B8]">
                  {neufinHealth.repos.filter((r) => r.status === "live").length}
                  /{neufinHealth.repos.length} live
                </span>
              )}
            </h2>
            {scanError && (
              <span className="text-sm text-red-400">{scanError}</span>
            )}
          </div>

          {!neufinHealth ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#E2E8F0] bg-white h-28 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {neufinHealth.repos.map((repo) => (
                <RepoHealthCard
                  key={repo.repo_id}
                  repo={repo}
                  deployment={neufinHealth.deployments.find(
                    (d) => d.repo_id === repo.repo_id,
                  )}
                  onRunScan={
                    repo.repo_id === "neufin-backend" ? runScan : undefined
                  }
                  scanning={
                    repo.repo_id === "neufin-backend" ? scanRunning : undefined
                  }
                />
              ))}
            </div>
          )}

          {/* Top findings */}
          {neufinHealth &&
            (neufinHealth.top_findings.length > 0 ||
              neufinHealth.error_rate.unresolved_critical > 0 ||
              neufinHealth.error_rate.unresolved_high > 0) && (
              <div className="mt-3">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-[#94A3B8] mb-2">
                  Open Findings
                </h3>
                <ScanFindingsSection
                  findings={neufinHealth.top_findings}
                  errorRate={neufinHealth.error_rate}
                />
              </div>
            )}
        </section>

        {/* ── ROW 1 — Budget ─────────────────────────────────────────────── */}
        <section>
          <h2 className={SL}>LLM Budget</h2>
          <BudgetRow budget={budget} />
        </section>

        {/* ── ROW 2 — Provider health grid ───────────────────────────────── */}
        <section>
          <h2 className={SL}>
            Providers
            <span className="ml-2 text-[#94A3B8] normal-case font-normal">
              {healthyCount}/{sortedProviders.length} healthy
            </span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {sortedProviders.map(([name, stats]) => (
              <ProviderCard
                key={name}
                name={name}
                stats={stats}
                rl={providerRateLimit(rateLimits, name)}
              />
            ))}
            {sortedProviders.length === 0 && (
              <p className="col-span-full text-sm text-[#94A3B8]">
                No providers registered.
              </p>
            )}
          </div>
        </section>

        {/* ── ROW 3 — Company status cards ───────────────────────────────── */}
        <section>
          <h2 className={SL}>Ventures</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {companies.map((company) => {
              const brief = briefs.find((b) => b.company_id === company);
              return (
                <CompanyStatusCard
                  key={company}
                  company={company}
                  agentRoles={companyAgents(agents, company)}
                  brief={brief}
                  isExpanded={expandedCard === company}
                  onExpand={() => {
                    setExpandedCard((p) => (p === company ? null : company));
                    // Also open the accordion in ROW 4
                    setOpenBriefs((prev) => {
                      const next = new Set(prev);
                      if (expandedCard === company) next.delete(company);
                      else next.add(company);
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        </section>

        {/* ── ROW 4 — Today&apos;s briefs accordion ───────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`${SL} mb-0`}>Today&apos;s Briefs</h2>
            <button
              onClick={() => {
                const allOpen = companies.every((c) => openBriefs.has(c));
                if (allOpen) setOpenBriefs(new Set());
                else setOpenBriefs(new Set(companies));
              }}
              className="text-xs text-[#94A3B8] hover:text-navy/90 transition-colors"
            >
              {companies.every((c) => openBriefs.has(c))
                ? "Collapse all"
                : "Expand all"}
            </button>
          </div>
          <div className="space-y-2">
            {companies.map((company) => {
              const brief = briefs.find((b) => b.company_id === company);
              return (
                <BriefAccordion
                  key={company}
                  company={company}
                  brief={brief}
                  open={openBriefs.has(company)}
                  onToggle={() => toggleBrief(company)}
                />
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
