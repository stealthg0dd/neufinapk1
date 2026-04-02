/**
 * GET /api/admin/users
 *
 * Lists all NeuFin user profiles for the internal ops admin panel.
 * Server-side only — uses SUPABASE_SERVICE_ROLE_KEY (never sent to browser).
 *
 * Query params:
 *   ?plan=trial|active|expired   (optional filter)
 *
 * Returns: UserAdminRow[]
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface UserAdminRow {
  id:                  string
  email:               string
  subscription_status: string
  trial_started_at:    string | null
  created_at:          string | null
  last_sign_in_at:     string | null
  dna_score_count:     number
  reports_purchased:   number
  role:                string | null
}

export async function GET(req: NextRequest) {
  // Verify advisor auth via Bearer token
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? ""
  if (!token) {
    return NextResponse.json({ error: "unauthorized", message: "Missing token", trace_id: "", timestamp: new Date().toISOString() }, { status: 401 })
  }

  // Validate token + check advisor role
  const { data: { user }, error: authErr } = await getSupabaseAdmin().auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized", message: "Invalid token", trace_id: "", timestamp: new Date().toISOString() }, { status: 401 })
  }

  const { data: profile } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "advisor") {
    return NextResponse.json({ error: "forbidden", message: "Advisor role required", trace_id: "", timestamp: new Date().toISOString() }, { status: 403 })
  }

  const planFilter = req.nextUrl.searchParams.get("plan")

  // Fetch user_profiles (limit 200)
  let query = getSupabaseAdmin()
    .from("user_profiles")
    .select("id, email, subscription_status, trial_started_at, created_at, last_sign_in_at, role")
    .order("created_at", { ascending: false })
    .limit(200)

  if (planFilter) {
    query = query.eq("subscription_status", planFilter)
  }

  const { data: profiles, error: profilesErr } = await query
  if (profilesErr) {
    return NextResponse.json({ error: "db_error", message: profilesErr.message, trace_id: "", timestamp: new Date().toISOString() }, { status: 500 })
  }

  // Enrich with DNA score counts and report counts
  const userIds = (profiles ?? []).map((p: {id: string}) => p.id)

  const [dnaCounts, reportCounts] = await Promise.all([
    getSupabaseAdmin()
      .from("dna_scores")
      .select("user_id")
      .in("user_id", userIds),
    getSupabaseAdmin()
      .from("advisor_reports")
      .select("advisor_id")
      .eq("is_paid", true)
      .in("advisor_id", userIds),
  ])

  const dnaMap: Record<string, number> = {}
  for (const row of dnaCounts.data ?? []) {
    dnaMap[(row as {user_id: string}).user_id] = (dnaMap[(row as {user_id: string}).user_id] ?? 0) + 1
  }

  const reportMap: Record<string, number> = {}
  for (const row of reportCounts.data ?? []) {
    reportMap[(row as {advisor_id: string}).advisor_id] = (reportMap[(row as {advisor_id: string}).advisor_id] ?? 0) + 1
  }

  const rows: UserAdminRow[] = (profiles ?? []).map((p: Record<string, string|null>) => ({
    id:                  p.id as string,
    email:               p.email ?? "",
    subscription_status: p.subscription_status ?? "unknown",
    trial_started_at:    p.trial_started_at ?? null,
    created_at:          p.created_at ?? null,
    last_sign_in_at:     p.last_sign_in_at ?? null,
    dna_score_count:     dnaMap[p.id as string] ?? 0,
    reports_purchased:   reportMap[p.id as string] ?? 0,
    role:                p.role ?? null,
  }))

  return NextResponse.json(rows)
}
