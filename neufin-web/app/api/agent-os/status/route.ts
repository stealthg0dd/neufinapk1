/**
 * Agent OS status proxy — aggregates all dashboard data in one server-side request.
 * The API key is injected from Vercel env and never reaches the browser.
 *
 * Required Vercel env vars:
 *   AGENT_OS_URL=https://ctech-production.up.railway.app
 *   AGENT_OS_API_KEY=<value of AGENT_OS_API_KEY in Railway>
 */

import { NextResponse } from "next/server"

const BASE = (process.env.AGENT_OS_URL ?? "https://ctech-production.up.railway.app").replace(/\/$/, "")
const KEY  = process.env.AGENT_OS_API_KEY ?? ""

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-api-key": KEY },
      cache: "no-store",
    })
    if (!res.ok) return fallback
    return res.json() as Promise<T>
  } catch {
    return fallback
  }
}

export async function GET() {
  if (!KEY) {
    return NextResponse.json(
      { error: "AGENT_OS_API_KEY is not set in Vercel environment variables" },
      { status: 500 }
    )
  }

  const [routerStatus, budget, briefs, agents, rateLimits] = await Promise.all([
    get<{ providers: Record<string, unknown>; budget: unknown }>("/router/status",         { providers: {}, budget: {} }),
    get<Record<string, unknown>>                               ("/infra/budget",            {}),
    get<{ briefs: unknown[] }>                                 ("/morning-engine/latest",   { briefs: [] }),
    get<Record<string, unknown>>                               ("/agents/list",             {}),
    get<Record<string, unknown>>                               ("/router/rate-limits",      {}),
  ])

  return NextResponse.json({
    timestamp:   new Date().toISOString(),
    providers:   routerStatus.providers ?? {},
    budget:      budget,
    briefs:      briefs.briefs ?? [],
    agents:      agents,
    rateLimits:  rateLimits,
  })
}
