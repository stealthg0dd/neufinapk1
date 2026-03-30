const API = process.env.NEXT_PUBLIC_API_URL;
if (!API) console.warn("WARNING: NEXT_PUBLIC_API_URL is not set!");
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
  record_id: string | null
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

export async function getChartData(symbol: string, period = '3mo', token?: string | null): Promise<{ data: CandleData[] }> {
  const res = await fetch(`${API}/api/portfolio/chart/${symbol}?period=${period}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`Chart data unavailable for ${symbol}`)
  return res.json()
}

export async function getPortfolioHistory(
  symbols: string[],
  shares: number[],
  period = '1mo',
  token?: string | null,
): Promise<{ history: LinePoint[] }> {
  const params = new URLSearchParams({
    symbols: symbols.join(','),
    shares: shares.join(','),
    period,
  })
  const res = await fetch(`${API}/api/portfolio/value-history?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Portfolio history unavailable')
  return res.json()
}

export async function getLeaderboard(limit = 10, token?: string | null) {
  const res = await fetch(`${API}/api/dna/leaderboard?limit=${limit}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Leaderboard unavailable')
  return res.json()
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface CheckoutRequest {
  plan: 'single' | 'unlimited'
  positions?: Position[]
  portfolio_id?: string
  advisor_id?: string
  ref_token?: string        // maps to backend CheckoutRequest.ref_token — applies 20% Stripe coupon
  success_url: string
  cancel_url: string
}

export interface AdvisorProfile {
  id?: string
  advisor_name: string
  firm_name: string
  calendar_link: string
  logo_base64: string | null
  brand_color: string
  white_label: boolean
  subscription_tier: 'free' | 'pro'
}

export interface WhiteLabelReportRequest {
  portfolio_id: string
  advisor_id: string
  advisor_name?: string
  logo_base64?: string | null
  color_scheme?: { primary: string; secondary: string; accent: string } | null
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

/**
 * Persist a referral code from ?ref= URL parameter into localStorage.
 * Call this once on page load in landing/upload pages.
 */
export function captureReferral(ref: string): void {
  if (ref && typeof window !== 'undefined') {
    localStorage.setItem('ref_token', ref)
  }
}

/**
 * One-shot helper: creates a Stripe Checkout session for a single DNA report,
 * stores the returned report_id in localStorage, then hard-redirects to Stripe.
 * Automatically picks up any persisted referral code from localStorage.
 * Browser-only — do not call server-side.
 */
export async function createCheckoutSession(
  recordId: string,
  token?: string | null
): Promise<void> {
  const origin       = window.location.origin
  const refToken = localStorage.getItem('ref_token') ?? undefined
  const data = await createCheckout(
    {
      plan:         'single',
      portfolio_id: recordId,
      ref_token:    refToken,              // backend field name
      success_url:  `${origin}/reports/success`,
      cancel_url:   `${origin}/results`,
    },
    token
  )
  if (data.report_id) {
    localStorage.setItem('pendingReportId', data.report_id)
  }
  window.location.href = data.checkout_url
}

// ── Advisor ────────────────────────────────────────────────────────────────────

export async function getAdvisorProfile(
  advisorId: string,
  token?: string | null
): Promise<AdvisorProfile> {
  const res = await fetch(`${API}/api/advisors/${advisorId}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Could not load advisor profile')
  }
  return res.json()
}

export async function upsertAdvisorProfile(
  body: Partial<AdvisorProfile>,
  token?: string | null
): Promise<AdvisorProfile> {
  const res = await fetch(`${API}/api/advisors/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Could not save advisor profile')
  }
  return res.json()
}

export async function getAdvisorReports(
  advisorId: string,
  token?: string | null
): Promise<{ reports: Array<{ id: string; portfolio_id: string; pdf_url: string | null; is_paid: boolean; created_at: string }> }> {
  const res = await fetch(`${API}/api/reports/advisor/${advisorId}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Could not load advisor reports')
  return res.json()
}

export async function generateWhiteLabelReport(
  body: WhiteLabelReportRequest,
  token?: string | null
): Promise<{ report_id: string | null; pdf_url: string | null; pdf_size_bytes: number; pages: number }> {
  const res = await fetch(`${API}/api/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'White-label PDF generation failed')
  }
  return res.json()
}

// ── Vault ──────────────────────────────────────────────────────────────────────

export interface VaultRecord {
  id: string
  dna_score: number
  investor_type: string
  recommendation: string
  share_token: string
  total_value: number
  created_at: string
}

export interface SubscriptionInfo {
  subscription_tier: 'free' | 'pro'
  is_pro: boolean
  advisor_name: string | null
  firm_name: string | null
}

/**
 * Associate an anonymous dna_scores record with the now-authenticated user.
 * Call this once after first sign-in if localStorage contains a record_id.
 */
export async function claimAnonymousRecord(
  recordId: string,
  token: string
): Promise<{ claimed: boolean; record_id: string }> {
  const res = await fetch(`${API}/api/vault/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ record_id: recordId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Claim failed')
  }
  return res.json()
}

export async function getVaultHistory(
  token: string
): Promise<{ history: VaultRecord[] }> {
  const res = await fetch(`${API}/api/vault/history`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Could not load vault history')
  return res.json()
}

export async function getSubscription(
  token: string
): Promise<SubscriptionInfo> {
  const res = await fetch(`${API}/api/vault/subscription`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return { subscription_tier: 'free', is_pro: false, advisor_name: null, firm_name: null }
  return res.json()
}

export async function createStripePortal(
  returnUrl: string,
  token: string
): Promise<{ portal_url: string }> {
  const res = await fetch(`${API}/api/vault/stripe-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ return_url: returnUrl }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Could not open billing portal')
  }
  return res.json()
}
