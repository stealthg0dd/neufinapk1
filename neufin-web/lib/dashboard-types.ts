/**
 * CTech Agent OS — Chief of Staff Command Centre types.
 * Used by app/dashboard/cos/page.tsx and its sub-components.
 */

// ── Venture ────────────────────────────────────────────────────────────────────

export type VentureStatus = "active" | "maintenance" | "dormant"

export interface VentureCard {
  id: string            // neufin | arisole | neumas | apex_golf | defquant
  name: string
  businessHead: string  // TW | JT | Brooksie | Fred | VS
  status: VentureStatus
  briefExcerpt: string  // first 120 chars of today's brief
  briefFull: string     // full brief content
  actionsRequired: string[]
  lastCommit: { message: string; author: string; timeAgo: string } | null
  taskCounts: { pending: number; blocked: number; done_today: number }
}

// ── Budget ─────────────────────────────────────────────────────────────────────

export interface BudgetStatus {
  daily_spend: number
  daily_cap: number
  monthly_spend: number
  monthly_cap: number
  daily_remaining: number
  monthly_remaining: number
}

// ── Agent call log ─────────────────────────────────────────────────────────────

export interface AgentCallLog {
  id?: string
  company: string
  agent_role: string
  provider_used: string
  cost_usd: number
  latency_ms: number
  success: boolean
  timestamp: string
}

// ── Provider health ────────────────────────────────────────────────────────────

export interface ProviderHealthEntry {
  healthy: boolean
  in_cooldown: boolean
  cooldown_remaining_s: number
  rpm_current: number
  rpm_limit: number
  cost_today_usd: number
  avg_latency_ms: number
  total_requests: number
  total_failures: number
  last_failure_reason: string | null
}

export interface RateLimitEntry {
  rpm_current: number
  rpm_limit: number
  rpm_pct: number
  tpm_current: number
  tpm_limit: number
  tpm_pct: number
  cooldown_s: number
  healthy: boolean
  cost_today_usd: number
}

// ── Dashboard aggregate ────────────────────────────────────────────────────────

export interface DashboardBrief {
  company_id: string
  date: string
  content: string
  actions_required: string[]
  created_at: string
}

export interface DashboardData {
  budget: BudgetStatus
  briefs: DashboardBrief[]
  providers: Record<string, ProviderHealthEntry>
  rateLimits: Record<string, RateLimitEntry>
  callLogs: AgentCallLog[]
  timestamp: string
  error?: string
}

// ── GitHub ─────────────────────────────────────────────────────────────────────

export interface GitCommit {
  sha: string
  message: string
  author: string
  date: string
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string
  agent_id: string | null
  company_id: string
  title: string | null
  input: string
  status: string
  priority: string
  created_at: string
  error_message?: string | null
}
