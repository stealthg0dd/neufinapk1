const API = process.env.NEXT_PUBLIC_API_URL || 'https://neufin101-production.up.railway.app'

// ── Auth helpers ───────────────────────────────────────────────────────────────

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DNAAnalysisResponse {
  dna_score: number
  investor_type: string
  total_value: number
  num_positions: number
  max_position_pct: number
  positions: Position[]
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  share_token: string
  share_url: string
  record_id: string
}

// Alias kept for backward compatibility with other pages
export type DNAResult = DNAAnalysisResponse

export interface Position {
  symbol: string
  shares: number
  price: number
  value: number
  weight: number
}

export interface CandleData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface LinePoint {
  time: string
  value: number
}

// ── DNA ───────────────────────────────────────────────────────────────────────

export async function analyzeDNA(file: File, token?: string | null): Promise<DNAAnalysisResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API}/api/analyze-dna`, {
    method: 'POST',
    body: form,
    headers: authHeaders(token),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Analysis failed')
  }
  return res.json()
}

// ── Charts ────────────────────────────────────────────────────────────────────

export async function getChartData(symbol: string, period = '3mo'): Promise<{ data: CandleData[] }> {
  const res = await fetch(`${API}/api/portfolio/chart/${symbol}?period=${period}`)
  if (!res.ok) throw new Error(`Chart data unavailable for ${symbol}`)
  return res.json()
}

export async function getPortfolioHistory(
  symbols: string[],
  shares: number[],
  period = '1mo'
): Promise<{ history: LinePoint[] }> {
  const params = new URLSearchParams({
    symbols: symbols.join(','),
    shares: shares.join(','),
    period,
  })
  const res = await fetch(`${API}/api/portfolio/value-history?${params}`)
  if (!res.ok) throw new Error('Portfolio history unavailable')
  return res.json()
}

export async function getLeaderboard(limit = 10) {
  const res = await fetch(`${API}/api/dna/leaderboard?limit=${limit}`)
  if (!res.ok) throw new Error('Leaderboard unavailable')
  return res.json()
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface CheckoutRequest {
  plan: 'single' | 'unlimited'
  positions?: Position[]
  portfolio_id?: string
  advisor_id?: string
  success_url: string
  cancel_url: string
}

export async function createCheckout(
  body: CheckoutRequest,
  token?: string | null
): Promise<{ checkout_url: string; report_id?: string }> {
  const res = await fetch(`${API}/api/reports/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Checkout failed')
  }
  return res.json()
}

export async function fulfillReport(
  reportId: string,
  token?: string | null
): Promise<{ pdf_url: string }> {
  const res = await fetch(`${API}/api/reports/fulfill?report_id=${reportId}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Report not yet ready — retry in a moment')
  }
  return res.json()
}
