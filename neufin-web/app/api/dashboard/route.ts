/**
 * Chief of Staff dashboard aggregate endpoint.
 * Fetches all 4 Agent OS data sources in parallel server-side.
 * API key is injected from env — never exposed to the browser.
 *
 * Required env vars:
 *   AGENT_OS_URL=https://<your-router-system>.up.railway.app
 *   AGENT_OS_API_KEY=<your key>
 */

import { NextResponse } from "next/server";
import type { DashboardData } from "@/lib/dashboard-types";

export const revalidate = 30;

const BASE = (process.env.AGENT_OS_URL ?? "").replace(/\/$/, "");
const KEY = process.env.AGENT_OS_API_KEY ?? "";

async function agentGet<T>(path: string, fallback: T): Promise<T> {
  if (!BASE || !KEY) return fallback;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-api-key": KEY, Authorization: `Bearer ${KEY}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return fallback;
    return res.json() as Promise<T>;
  } catch {
    return fallback;
  }
}

export async function GET() {
  if (!BASE || !KEY) {
    const empty: DashboardData = {
      timestamp: new Date().toISOString(),
      briefs: [],
      providers: {},
      rateLimits: {},
      callLogs: [],
      budget: {
        daily_spend: 0,
        daily_cap: 15,
        daily_remaining: 15,
        monthly_spend: 0,
        monthly_cap: 400,
        monthly_remaining: 400,
      },
    };
    return NextResponse.json({
      ...empty,
      _warning:
        "AGENT_OS_URL and AGENT_OS_API_KEY must both be set — data unavailable",
    });
  }

  const [briefs, routerStatus, callLogsRaw, _agents] = await Promise.all([
    agentGet<{ briefs?: unknown[] } | unknown[]>("/morning-engine/latest", {
      briefs: [],
    }),
    agentGet<{
      providers?: Record<string, unknown>;
      budget?: Record<string, unknown>;
    }>("/router/status", { providers: {}, budget: {} }),
    agentGet<unknown[]>("/infra/call-logs?days=1", []),
    agentGet<Record<string, unknown>>("/agents/list", {}),
  ]);

  // Normalise briefs — API returns either {briefs:[]} or []
  const briefList = Array.isArray(briefs)
    ? briefs
    : ((briefs as { briefs?: unknown[] }).briefs ?? []);

  // Normalise budget
  const budget = (routerStatus.budget ?? {}) as Record<string, number>;

  const data: DashboardData = {
    timestamp: new Date().toISOString(),
    briefs: briefList as DashboardData["briefs"],
    providers: (routerStatus.providers ?? {}) as DashboardData["providers"],
    rateLimits: {},
    callLogs: Array.isArray(callLogsRaw)
      ? (callLogsRaw as DashboardData["callLogs"])
      : [],
    budget: {
      daily_spend: budget.daily_spend ?? 0,
      daily_cap: budget.daily_cap ?? 15,
      daily_remaining:
        budget.daily_remaining ??
        (budget.daily_cap ?? 15) - (budget.daily_spend ?? 0),
      monthly_spend: budget.monthly_spend ?? 0,
      monthly_cap: budget.monthly_cap ?? 400,
      monthly_remaining:
        budget.monthly_remaining ??
        (budget.monthly_cap ?? 400) - (budget.monthly_spend ?? 0),
    },
  };

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
  });
}
