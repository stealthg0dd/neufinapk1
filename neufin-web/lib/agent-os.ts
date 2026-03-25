/**
 * CTech Agent OS — typed client for NeuFin frontend.
 * All calls go through /api/agent-os/* which is proxied server-side
 * with the x-api-key injected (key never hits the browser).
 */

const BASE = '/api/agent-os'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentResponse {
  content: string
  provider_used: string
  model: string
  tokens: number
  cost_usd: number
  latency_ms: number
  task_type: string
}

export interface ProviderStatus {
  healthy: boolean
  in_cooldown: boolean
  cooldown_remaining_s: number
  rpm_current: number
  rpm_limit: number
  avg_latency_ms: number
  total_requests: number
  total_failures: number
  total_cost_usd: number
  last_failure_reason: string | null
}

export interface RouterStatus {
  providers: Record<string, ProviderStatus>
  budget: {
    daily_spend: number
    daily_cap: number
    daily_remaining: number
    monthly_spend: number
    monthly_cap: number
    monthly_remaining: number
    provider_breakdown: Record<string, Record<string, number>>
  }
}

export interface DailyBrief {
  id: string
  company_id: string
  date: string
  content: string
  actions_required: string[]
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Agent OS error ${res.status}`)
  }
  return res.json()
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Agent OS error ${res.status}`)
  }
  return res.json()
}

// ── Agent calls ────────────────────────────────────────────────────────────────

/**
 * Call any company agent by role.
 * @example callAgent('neufin', 'pm', 'What are this week's top priorities?')
 */
export async function callAgent(
  company: 'neufin' | 'arisole' | 'neumas' | 'apex_golf' | 'defquant',
  role: string,
  message: string,
  context?: Record<string, unknown>,
  taskType?: string,
): Promise<AgentResponse> {
  return post(`/agent/${company}/${role}`, { message, context, task_type: taskType })
}

/** Convenience: NeuFin PM agent — sprint priorities, task routing */
export const neufinPM = (message: string, context?: Record<string, unknown>) =>
  callAgent('neufin', 'pm', message, context)

/** Convenience: NeuFin Analyst — behavioural finance analysis */
export const neufinAnalyst = (message: string, context?: Record<string, unknown>) =>
  callAgent('neufin', 'analyst', message, context)

/** Convenience: NeuFin Compliance — MAS/PDPA review */
export const neufinCompliance = (message: string, context?: Record<string, unknown>) =>
  callAgent('neufin', 'compliance', message, context)

// ── Infrastructure status ──────────────────────────────────────────────────────

/** Full LLM provider health + budget status (for infra dashboard widget) */
export async function getRouterStatus(): Promise<RouterStatus> {
  return get('/router/status')
}

/** Health check (public — no auth needed) */
export async function getHealth(): Promise<{ status: string; providers_up: number; version: string }> {
  return get('/health')
}

/** Budget breakdown */
export async function getBudget(): Promise<RouterStatus['budget']> {
  return get('/infra/budget')
}

// ── Morning briefs ─────────────────────────────────────────────────────────────

/** Fetch latest daily briefs for all companies */
export async function getLatestBriefs(): Promise<{ briefs: DailyBrief[] }> {
  return get('/morning-engine/latest')
}

/** Trigger the morning engine manually (admin use) */
export async function runMorningEngine(companies?: string[]) {
  return post('/morning-engine/run', { companies })
}
