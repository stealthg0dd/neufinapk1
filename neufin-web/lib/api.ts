// ── Plans & Subscription ──────────────────────────────────────────────────────

export interface Plan {
  name: string;
  price_monthly: number;
  stripe_price_id?: string;
  dna_analyses_per_month: number;
  swarm_analyses: boolean;
  advisor_reports: boolean;
  api_access: boolean;
  multi_client?: boolean;
  advisor_reports_per_month?: number;
  api_rate_limit_per_day?: number;
}

export interface PlanSubscriptionStatus {
  subscription_tier: string;
  plan_name: string;
  price_monthly: number;
  usage: {
    dna_analyses: number;
    swarm_analyses: number;
    api_calls: number;
  };
  limits: {
    dna_analyses_per_month: number;
  };
}

export async function getPlans(): Promise<Record<string, Plan>> {
  const res = await fetch(`${API}/api/plans`);
  if (!res.ok) throw new Error("Could not load plans");
  return res.json();
}

export async function getPlanSubscriptionStatus(
  token: string,
): Promise<PlanSubscriptionStatus> {
  const res = await fetch(`${API}/api/subscription/status`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load subscription status");
  return res.json();
}

export async function submitLead(body: {
  name: string;
  email: string;
  company: string;
  role: string;
  aum_range: string;
  message?: string;
}): Promise<{ created: boolean; lead_id: string | null }> {
  const res = await fetch(`${API}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Could not submit enquiry");
  }
  return res.json();
}

// ── Subscription status ─────────────────────────────────────────────────────
export async function getSubscriptionStatus(
  token?: string | null,
): Promise<{
  status: "trial" | "active" | "expired";
  days_remaining?: number;
}> {
  const res = await fetch(`${API}/api/auth/subscription-status`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not fetch subscription status");
  return res.json();
}
/**
 * Associate an anonymous portfolio with the now-authenticated user.
 * Call this after sign-in if localStorage contains a pending_portfolio_id.
 */
export async function claimAnonymousPortfolio(
  portfolioId: string,
  token: string,
): Promise<{ claimed: boolean; portfolio_id: string }> {
  const res = await fetch(`${API}/api/portfolio/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ portfolio_id: portfolioId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Portfolio claim failed");
  }
  return res.json();
}
// Empty string = relative URL → routes through Next.js /api/* rewrite proxy to Railway.
// In Vercel production, set NEXT_PUBLIC_API_URL=https://neufin-web.vercel.app so
// client-side fetch calls hit the same-origin proxy. Do NOT point directly at Railway.
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Absolute origin for server-side fetch to this deployment (RSC / ISR). Relative `/api` can throw without a base. */
function resolveServerFetchOrigin(): string {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) {
    try {
      return new URL(app.includes("://") ? app : `https://${app}`).origin;
    } catch {
      /* fall through */
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "";
}

/** Research + server fetches: use explicit API base, else same-origin absolute URL on Vercel. */
function researchRequestUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  // During server rendering/build, always prefer same-deployment origin.
  // This avoids static generation hitting stale NEXT_PUBLIC_API_URL hosts.
  if (typeof window === "undefined") {
    const origin = resolveServerFetchOrigin();
    if (origin) return `${origin}${p}`;
  }
  if (API) {
    const base = API.replace(/\/$/, "");
    return `${base}${p}`;
  }
  const origin = resolveServerFetchOrigin();
  if (origin) return `${origin}${p}`;
  return p;
}
// ── Auth helpers ───────────────────────────────────────────────────────────────

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── authFetch — centralised fetch with status-code handling ───────────────────
/**
 * Drop-in fetch wrapper. Handles these status codes globally:
 *  401 → sign out + redirect to /auth (expired session)
 *  402 → dispatch 'subscription:required' event
 *  404 → returns null (caller handles empty state)
 *  422 → throws with { status, details } for inline field errors
 *  429 → toast "Too many requests" and throws
 *  5xx → toast "Server error" + captures to Sentry, then throws
 *
 * Returns the raw Response on success (2xx) so callers can call .json() etc.
 * Returns null for 404 and 401/402 (after side-effects).
 */
export async function authFetch(
  url: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<Response | null> {
  const headers: Record<string, string> = {
    ...authHeaders(token),
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };
  const res = await fetch(url, { ...options, headers });

  if (res.ok) return res;

  switch (true) {
    case res.status === 401: {
      if (typeof window !== "undefined") {
        // Lazy-import to avoid circular deps and keep server bundle clean
        const { supabase } = await import("./supabase");
        await supabase.auth.signOut();
        window.location.href = "/login?reason=session_expired";
      }
      return null;
    }
    case res.status === 402: {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("subscription:required"));
      }
      return null;
    }
    case res.status === 404:
      return null;

    case res.status === 422: {
      const body = await res.json().catch(() => ({}));
      const err = Object.assign(new Error("Validation error"), {
        status: 422,
        details: body,
      });
      throw err;
    }
    case res.status === 429: {
      const { toast } = await import("react-hot-toast");
      toast.error("Too many requests — please wait a moment");
      throw new Error("Rate limited (429)");
    }
    default: {
      if (res.status >= 500) {
        const { toast } = await import("react-hot-toast");
        const { captureException } = await import("@sentry/nextjs");
        const err = new Error(`Server error ${res.status}`);
        captureException(err, { extra: { url, status: res.status } });
        toast.error("Server error — our team has been notified");
        throw err;
      }
      throw new Error(`Request failed: ${res.status}`);
    }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DNAAnalysisResponse {
  dna_score: number;
  investor_type: string;
  total_value: number;
  num_positions: number;
  num_priced?: number;
  max_position_pct: number;
  positions: Position[];
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  share_token: string;
  share_url: string;
  record_id: string | null;
  portfolio_id: string | null;
  /** Non-blocking warnings: stale prices, alias resolutions, excluded tickers */
  warnings?: string[];
  /** Tickers that could not be priced and were excluded from analysis */
  failed_tickers?: string[];
}

// Alias kept for backward compatibility with other pages
export type DNAResult = DNAAnalysisResponse;

export interface Position {
  symbol: string;
  shares: number;
  price: number;
  value: number;
  weight: number;
}

export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LinePoint {
  time: string;
  value: number;
}

// ── DNA ───────────────────────────────────────────────────────────────────────

export async function analyzeDNA(
  file: File,
  token?: string | null,
): Promise<DNAAnalysisResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/analyze-dna`, {
    method: "POST",
    body: form,
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Analysis failed");
  }
  return res.json();
}

// ── Charts ────────────────────────────────────────────────────────────────────

export async function getChartData(
  symbol: string,
  period = "3mo",
  token?: string | null,
): Promise<{ data: CandleData[] }> {
  const res = await fetch(
    `${API}/api/portfolio/chart/${symbol}?period=${period}`,
    {
      headers: authHeaders(token),
    },
  );
  if (!res.ok) throw new Error(`Chart data unavailable for ${symbol}`);
  return res.json();
}

export async function getPortfolioHistory(
  symbols: string[],
  shares: number[],
  period = "1mo",
  token?: string | null,
): Promise<{ history: LinePoint[] }> {
  const params = new URLSearchParams({
    symbols: symbols.join(","),
    shares: shares.join(","),
    period,
  });
  const res = await fetch(`/api/portfolio/value-history?${params}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Portfolio history unavailable");
  return res.json();
}

export async function getLeaderboard(limit = 10, token?: string | null) {
  const res = await fetch(`${API}/api/dna/leaderboard?limit=${limit}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Leaderboard unavailable");
  return res.json();
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface CheckoutRequest {
  plan: "single" | "unlimited";
  positions?: Position[];
  portfolio_id?: string;
  advisor_id?: string;
  ref_token?: string; // maps to backend CheckoutRequest.ref_token — applies 20% Stripe coupon
  success_url: string;
  cancel_url: string;
}

export interface AdvisorProfile {
  id?: string;
  advisor_name: string;
  firm_name: string;
  calendar_link: string;
  logo_base64: string | null;
  brand_color: string;
  white_label: boolean;
  subscription_tier: "free" | "pro";
}

export interface WhiteLabelReportRequest {
  portfolio_id: string;
  advisor_id?: string; // optional — backend defaults to authenticated user
  advisor_name?: string;
  logo_base64?: string | null;
  color_scheme?: { primary: string; secondary: string; accent: string } | null;
}

export async function createCheckout(
  body: CheckoutRequest,
  token?: string | null,
): Promise<{ checkout_url: string; report_id?: string }> {
  const res = await fetch("/api/reports/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Checkout failed");
  }
  return res.json();
}

export async function fulfillReport(
  reportId: string,
  token?: string | null,
): Promise<{ pdf_url: string }> {
  const res = await fetch(`/api/reports/fulfill?report_id=${reportId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Report not yet ready — retry in a moment");
  }
  return res.json();
}

/**
 * Persist a referral code from ?ref= URL parameter into localStorage.
 * Call this once on page load in landing/upload pages.
 */
export function captureReferral(ref: string): void {
  if (ref && typeof window !== "undefined") {
    localStorage.setItem("ref_token", ref);
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
  token?: string | null,
): Promise<void> {
  const origin = window.location.origin;
  const refToken = localStorage.getItem("ref_token") ?? undefined;
  const parsedResult = (() => {
    try {
      return JSON.parse(localStorage.getItem("dnaResult") || "null");
    } catch {
      return null;
    }
  })();
  const positions = Array.isArray(parsedResult?.positions)
    ? parsedResult.positions.map((p: any) => ({
        symbol: p.symbol,
        shares: p.shares,
        price: p.price,
        value: p.value,
        weight: p.weight,
      }))
    : undefined;
  // Prefer the stored portfolio_id (correct portfolios table UUID) over
  // record_id (which is the dna_scores table ID and cannot be used as portfolio_id)
  const storedPortfolioId = (parsedResult as any)?.portfolio_id as
    | string
    | null
    | undefined;

  const { stripeSuccessUrlReports } =
    await import("@/lib/stripe-checkout-urls");
  const data = await createCheckout(
    {
      plan: "single",
      ...(storedPortfolioId
        ? { portfolio_id: storedPortfolioId }
        : positions?.length
          ? { positions }
          : { portfolio_id: recordId }),
      ref_token: refToken, // backend field name
      success_url: stripeSuccessUrlReports(origin),
      cancel_url: `${origin}/results`,
    },
    token,
  );
  if (data.report_id) {
    localStorage.setItem("pendingReportId", data.report_id);
  }
  window.location.href = data.checkout_url;
}

// ── Advisor ────────────────────────────────────────────────────────────────────

export async function getAdvisorProfile(
  advisorId: string,
  token?: string | null,
): Promise<AdvisorProfile> {
  const res = await fetch(`${API}/api/advisors/${advisorId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Could not load advisor profile");
  }
  return res.json();
}

export async function upsertAdvisorProfile(
  body: Partial<AdvisorProfile>,
  token?: string | null,
): Promise<AdvisorProfile> {
  const res = await fetch(`${API}/api/advisors/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Could not save advisor profile");
  }
  return res.json();
}

export async function getAdvisorReports(
  advisorId: string,
  token?: string | null,
): Promise<{
  reports: Array<{
    id: string;
    portfolio_id: string;
    pdf_url: string | null;
    is_paid: boolean;
    created_at: string;
  }>;
}> {
  const res = await fetch(`${API}/api/reports/advisor/${advisorId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load advisor reports");
  return res.json();
}

export async function generateWhiteLabelReport(
  body: WhiteLabelReportRequest,
): Promise<{
  report_id: string | null;
  pdf_url: string | null;
  pdf_size_bytes: number;
  pages: number;
}> {
  // Use apiFetch so getSession() auto-refreshes the token before every request.
  // The old raw fetch() with a passed-in token could silently send an expired JWT.
  const { apiFetch: _apiFetch } = await import("./api-client");
  const res = await _apiFetch("/api/reports/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      (err as { detail?: string }).detail ||
        "White-label PDF generation failed",
    );
  }
  return res.json() as Promise<{
    report_id: string | null;
    pdf_url: string | null;
    pdf_size_bytes: number;
    pages: number;
  }>;
}

// ── Vault ──────────────────────────────────────────────────────────────────────

export interface VaultRecord {
  id: string;
  dna_score: number;
  investor_type: string;
  recommendation: string;
  share_token: string;
  total_value: number;
  created_at: string;
}

export interface SubscriptionInfo {
  subscription_tier: "free" | "retail" | "advisor" | "enterprise" | "pro";
  subscription_status: "free" | "trial" | "active" | "expired";
  trial_started_at: string;
  is_pro: boolean;
  advisor_name: string | null;
  firm_name: string | null;
  /** NeuFin internal admin (user_profiles.is_admin) */
  is_admin?: boolean;
  role?: string;
}

/**
 * Associate an anonymous dna_scores record with the now-authenticated user.
 * Call this once after first sign-in if localStorage contains a record_id.
 */
export async function claimAnonymousRecord(
  recordId: string,
  token: string,
): Promise<{ claimed: boolean; record_id: string }> {
  const res = await fetch(`${API}/api/vault/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ record_id: recordId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Claim failed");
  }
  return res.json();
}

export async function getVaultHistory(
  token: string,
): Promise<{ history: VaultRecord[] }> {
  const res = await fetch(`${API}/api/vault/history`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load vault history");
  return res.json();
}

export async function getSubscription(
  token: string,
): Promise<SubscriptionInfo> {
  const res = await fetch(`${API}/api/vault/subscription`, {
    headers: authHeaders(token),
  });
  if (!res.ok)
    return {
      subscription_tier: "free",
      subscription_status: "free",
      trial_started_at: "",
      is_pro: false,
      advisor_name: null,
      firm_name: null,
      is_admin: false,
      role: "user",
    };
  return res.json();
}

export async function createStripePortal(
  returnUrl: string,
  token: string,
): Promise<{ portal_url: string }> {
  const res = await fetch(`${API}/api/vault/stripe-portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ return_url: returnUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Could not open billing portal");
  }
  return res.json();
}

// ── Admin Leads ──────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
  role?: string;
  aum_range?: string;
  source?: string;
  status:
    | "new"
    | "contacted"
    | "demo_scheduled"
    | "demo_done"
    | "proposal_sent"
    | "won"
    | "lost"
    | "nurture";
  notes?: string;
  interested_plan?: string;
  created_at: string;
  updated_at?: string;
  contacted_at?: string;
  won_at?: string;
}

export interface LeadStats {
  total: number;
  by_status: Record<string, number>;
  conversion_rate: number;
  this_week: number;
  last_week: number;
  won_this_month: number;
  pipeline_mrr: number;
}

export async function getAdminLeads(
  token: string,
  params?: { status?: string; page?: number; per_page?: number },
): Promise<{ leads: Lead[]; total: number; page: number }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const res = await fetch(`${API}/api/admin/leads?${qs}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load leads");
  return res.json();
}

export async function updateLeadStatus(
  leadId: string,
  data: { status?: string; notes?: string },
  token: string,
): Promise<Lead> {
  const res = await fetch(`${API}/api/admin/leads/${leadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Could not update lead");
  return res.json();
}

export async function getLeadStats(token: string): Promise<LeadStats> {
  const res = await fetch(`${API}/api/admin/leads/stats`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load lead stats");
  return res.json();
}

// ── Advisor Clients ───────────────────────────────────────────────────────────

export interface AdvisorClient {
  id: string;
  client_name: string;
  client_email?: string;
  notes?: string;
  portfolio_id?: string;
  dna_score?: number;
  last_analysis?: string;
  created_at: string;
}

export async function getAdvisorClients(
  token: string,
): Promise<AdvisorClient[]> {
  const res = await fetch(`${API}/api/advisor/clients`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load clients");
  const data = await res.json();
  return data.clients ?? data ?? [];
}

export async function addAdvisorClient(
  client: { client_name: string; client_email?: string; notes?: string },
  token: string,
): Promise<AdvisorClient> {
  const res = await fetch(`${API}/api/advisor/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(client),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Could not add client");
  }
  return res.json();
}

export async function getClientReports(clientId: string, token: string) {
  const res = await fetch(`${API}/api/advisor/clients/${clientId}/reports`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load client reports");
  return res.json();
}

export async function runClientAnalysis(clientId: string, token: string) {
  const res = await fetch(`${API}/api/advisor/clients/${clientId}/analysis`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not run analysis");
  return res.json();
}

// ── Developer / API Keys ───────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  key_prefix?: string;
  created_at: string;
  last_used_at?: string;
  is_active: boolean;
  rate_limit_per_day: number;
}

export async function getDeveloperKeys(token: string): Promise<ApiKey[]> {
  const res = await fetch(`${API}/api/developer/keys`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not load API keys");
  const data = await res.json();
  return data.keys ?? data ?? [];
}

export async function createDeveloperKey(
  name: string,
  token: string,
): Promise<{ key: ApiKey; raw_key: string }> {
  const res = await fetch(`${API}/api/developer/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Could not create key");
  }
  return res.json();
}

export async function deleteDeveloperKey(
  keyId: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${API}/api/developer/keys/${keyId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Could not revoke key");
}

// ── Research Layer ────────────────────────────────────────────────────────────

export interface MarketRegime {
  regime: string;
  confidence: number;
  started_at: string;
  supporting_signals?: Record<string, unknown>;
}

export interface ResearchNote {
  id: string;
  note_type: string;
  title: string;
  executive_summary: string;
  full_content?: string;
  key_findings?: Array<{
    finding: string;
    data_support: string;
    implication: string;
  }>;
  affected_sectors?: string[];
  regime?: string;
  time_horizon?: string;
  confidence_score?: number;
  generated_at: string;
  is_public: boolean;
}

const RESEARCH_FETCH_MS = 3000;

export async function getResearchRegime(): Promise<MarketRegime | null> {
  try {
    const res = await fetch(researchRequestUrl("/api/research/regime"), {
      cache: "no-store",
      signal: AbortSignal.timeout(RESEARCH_FETCH_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export async function getResearchNotes(
  token?: string | null,
  page = 1,
  perPage = 10,
): Promise<ResearchNote[]> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(
      researchRequestUrl(
        `/api/research/notes?page=${page}&per_page=${perPage}`,
      ),
      {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(RESEARCH_FETCH_MS),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data?.notes ?? data;
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function getResearchNote(
  noteId: string,
  token?: string | null,
): Promise<ResearchNote | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(
      researchRequestUrl(`/api/research/notes/${noteId}`),
      {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(RESEARCH_FETCH_MS),
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
