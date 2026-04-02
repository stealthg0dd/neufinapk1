/**
 * GET /api/neufin/health
 *
 * Aggregates NeuFin-specific infrastructure health from router-system:
 *   - Per-repo heartbeat / live status (neufin-backend, neufin-web, neufin-mobile, neufin-agent)
 *   - Latest scan findings from neufin-agent (top 5 open)
 *   - Recent deployments per repo
 *   - Unresolved P0/P1 error count
 *
 * All calls go through the server-side AGENT_OS_URL + AGENT_OS_API_KEY so
 * neither credential ever reaches the browser.
 */

import { NextResponse } from "next/server"

const BASE = (process.env.AGENT_OS_URL ?? "https://ctech-production.up.railway.app").replace(/\/$/, "")
const KEY  = process.env.AGENT_OS_API_KEY ?? ""

const NEUFIN_REPOS = ["neufin-backend", "neufin-web", "neufin-mobile", "neufin-agent"] as const
export type NeuFinRepo = (typeof NEUFIN_REPOS)[number]

export interface RepoHeartbeat {
  repo_id:      NeuFinRepo
  status:       "live" | "stale" | "offline"
  last_seen:    string | null   // ISO timestamp of last heartbeat
  version:      string | null
  environment:  string | null
}

export interface ScanFinding {
  id:          string
  repo_id:     string
  severity:    "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  category:    string
  message:     string
  detected_at: string
  resolved:    boolean
}

export interface RepoDeployment {
  repo_id:     string
  deployed_at: string | null
  commit_sha:  string | null
  commit_msg:  string | null
  deployed_by: string | null
}

export interface NeuFinHealthData {
  timestamp:    string
  repos:        RepoHeartbeat[]
  top_findings: ScanFinding[]
  deployments:  RepoDeployment[]
  error_rate: {
    unresolved_critical: number
    unresolved_high:     number
  }
}

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  if (!KEY) return fallback
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-api-key": KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return fallback
    return res.json() as Promise<T>
  } catch {
    return fallback
  }
}

/** Classify a heartbeat timestamp into LIVE / STALE / OFFLINE */
function classifyStatus(lastSeen: string | null): "live" | "stale" | "offline" {
  if (!lastSeen) return "offline"
  const ageMs = Date.now() - new Date(lastSeen).getTime()
  if (ageMs < 2 * 60 * 1000)    return "live"    // < 2 min
  if (ageMs < 10 * 60 * 1000)   return "stale"   // < 10 min
  return "offline"
}

export async function GET() {
  if (!KEY) {
    return NextResponse.json({ error: "AGENT_OS_API_KEY not set" }, { status: 500 })
  }

  // Fetch heartbeat/status for all 4 repos + scan data in parallel
  const [repoStatuses, scanData, ...deployResults] = await Promise.all([
    safeGet<Record<string, { last_seen?: string; version?: string; environment?: string }>>(
      "/api/repos/neufin/heartbeats",
      {},
    ),
    safeGet<{ findings?: ScanFinding[] }>("/api/repos/neufin-backend/scans", { findings: [] }),
    ...NEUFIN_REPOS.map((repo) =>
      safeGet<{ deployed_at?: string; commit_sha?: string; commit_msg?: string; deployed_by?: string }>(
        `/api/repos/${repo}/deployments/latest`,
        {},
      ),
    ),
  ])

  // Build repo heartbeat list
  const repos: RepoHeartbeat[] = NEUFIN_REPOS.map((repo) => {
    const info = (repoStatuses as Record<string, { last_seen?: string; version?: string; environment?: string }>)[repo] ?? {}
    const lastSeen = info.last_seen ?? null
    return {
      repo_id:     repo,
      status:      classifyStatus(lastSeen),
      last_seen:   lastSeen,
      version:     info.version ?? null,
      environment: info.environment ?? null,
    }
  })

  // Top 5 open findings sorted by severity
  const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const allFindings = (scanData.findings ?? []) as ScanFinding[]
  const topFindings = allFindings
    .filter((f) => !f.resolved)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 5)

  // Deployments per repo
  const deployments: RepoDeployment[] = NEUFIN_REPOS.map((repo, i) => {
    const d = deployResults[i] ?? {}
    return {
      repo_id:     repo,
      deployed_at: (d as {deployed_at?: string}).deployed_at ?? null,
      commit_sha:  (d as {commit_sha?: string}).commit_sha ?? null,
      commit_msg:  (d as {commit_msg?: string}).commit_msg ?? null,
      deployed_by: (d as {deployed_by?: string}).deployed_by ?? null,
    }
  })

  // Error rate
  const unresolvedCritical = allFindings.filter((f) => !f.resolved && f.severity === "CRITICAL").length
  const unresolvedHigh     = allFindings.filter((f) => !f.resolved && f.severity === "HIGH").length

  const payload: NeuFinHealthData = {
    timestamp:    new Date().toISOString(),
    repos,
    top_findings: topFindings,
    deployments,
    error_rate: {
      unresolved_critical: unresolvedCritical,
      unresolved_high:     unresolvedHigh,
    },
  }

  return NextResponse.json(payload)
}
