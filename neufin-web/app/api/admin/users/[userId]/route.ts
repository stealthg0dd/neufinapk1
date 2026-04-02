/**
 * POST /api/admin/users/[userId]/extend-trial
 *   Body: { days: number }
 *   Extends the user's trial by N days.
 *
 * POST /api/admin/users/[userId]/resend-onboarding
 *   Resends the onboarding email via Supabase magic link.
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

function errorResp(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message, trace_id: crypto.randomUUID(), timestamp: new Date().toISOString() },
    { status },
  )
}

async function getAdvisorUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? ""
  if (!token) return null
  const { data: { user } } = await getSupabaseAdmin().auth.getUser(token)
  if (!user) return null
  const { data: profile } = await getSupabaseAdmin().from("user_profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "advisor") return null
  return user
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params
  const url = req.nextUrl

  const adminUser = await getAdvisorUser(req)
  if (!adminUser) return errorResp(401, "unauthorized", "Advisor auth required")

  // ── extend-trial ────────────────────────────────────────────────────────────
  if (url.pathname.endsWith("/extend-trial")) {
    const body = await req.json().catch(() => ({})) as { days?: number }
    const days = Number(body.days ?? 7)
    if (isNaN(days) || days < 1 || days > 365) {
      return errorResp(400, "bad_request", "days must be 1-365")
    }
    // Set trial_started_at to (now + days - 14) so the 14-day trial ends `days` from now
    const newStart = new Date(Date.now() + days * 86400_000 - 14 * 86400_000)
    const { error } = await getSupabaseAdmin()
      .from("user_profiles")
      .update({ trial_started_at: newStart.toISOString(), subscription_status: "trial" })
      .eq("id", userId)
    if (error) return errorResp(500, "db_error", error.message)
    const newTrialEnds = new Date(newStart.getTime() + 14 * 86400_000).toISOString()
    return NextResponse.json({ ok: true, new_trial_ends: newTrialEnds })
  }

  // ── resend-onboarding ───────────────────────────────────────────────────────
  if (url.pathname.endsWith("/resend-onboarding")) {
    // Fetch user email from user_profiles
    const { data: profile } = await getSupabaseAdmin()
      .from("user_profiles")
      .select("email")
      .eq("id", userId)
      .single()

    if (!profile?.email) {
      return errorResp(404, "not_found", "User profile or email not found")
    }

    try {
      // Send a magic link to the user's email (Supabase admin API)
      const { error } = await getSupabaseAdmin().auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback` },
      })
      if (error) throw error
      return NextResponse.json({ ok: true, queued: true, email: profile.email })
    } catch (e) {
      // Best effort — log and return partial success
      console.error("resend_onboarding_failed", e)
      return NextResponse.json({ ok: true, queued: false, note: "Email queueing failed; check Supabase logs" })
    }
  }

  return errorResp(404, "not_found", "Unknown action")
}
