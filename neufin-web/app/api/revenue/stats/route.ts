/**
 * GET /api/revenue/stats
 *
 * Returns NeuFin revenue dashboard data:
 *   - Monthly Stripe revenue (this month + last month)
 *   - Subscriber counts by tier
 *   - Recent report purchases
 *   - Conversion funnel from Supabase
 *
 * Server-side only — uses STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2026-03-25.dahlia",
  });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function endOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59);
}

async function stripeMonthRevenue(from: Date, to: Date): Promise<number> {
  try {
    let total = 0;
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const list = await getStripe().paymentIntents.list({
        created: {
          gte: Math.floor(from.getTime() / 1000),
          lte: Math.floor(to.getTime() / 1000),
        },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const pi of list.data) {
        if (pi.status === "succeeded") total += pi.amount;
      }
      hasMore = list.has_more;
      startingAfter = list.data[list.data.length - 1]?.id;
    }
    return total / 100.0;
  } catch {
    return 0;
  }
}

async function safeCount(
  table: string,
  filter?: Record<string, string>,
): Promise<number> {
  try {
    let q = getSupabaseAdmin()
      .from(table)
      .select("id", { count: "exact", head: true });
    if (filter) {
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    }
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function safeCountGte(
  table: string,
  dateField: string,
  since: string,
  filter?: Record<string, string>,
): Promise<number> {
  try {
    let q = getSupabaseAdmin()
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte(dateField, since);
    if (filter) {
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    }
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  // Validate advisor auth
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!token) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Missing token",
        trace_id: "",
        timestamp: new Date().toISOString(),
      },
      { status: 401 },
    );
  }
  const {
    data: { user },
    error: authErr,
  } = await getSupabaseAdmin().auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Invalid token",
        trace_id: "",
        timestamp: new Date().toISOString(),
      },
      { status: 401 },
    );
  }
  const { data: profile } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "advisor") {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "Advisor role required",
        trace_id: "",
        timestamp: new Date().toISOString(),
      },
      { status: 403 },
    );
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevStart = startOfPrevMonth(now);
  const prevEnd = endOfPrevMonth(now);
  const monthISO = monthStart.toISOString();

  // Run all data fetches in parallel
  const [
    revenueThisMonth,
    revenueLastMonth,
    activeCount,
    trialCount,
    expiredCount,
    recentPurchasesResult,
    signups,
    dnaScores,
    purchases,
  ] = await Promise.all([
    stripeMonthRevenue(monthStart, now),
    stripeMonthRevenue(prevStart, prevEnd),
    safeCount("user_profiles", { subscription_status: "active" }),
    safeCount("user_profiles", { subscription_status: "trial" }),
    safeCount("user_profiles", { subscription_status: "expired" }),
    getSupabaseAdmin()
      .from("advisor_reports")
      .select("advisor_id, plan_type, amount_cents, created_at")
      .eq("is_paid", true)
      .order("created_at", { ascending: false })
      .limit(20),
    safeCountGte("user_profiles", "created_at", monthISO),
    safeCountGte("dna_scores", "created_at", monthISO),
    safeCountGte("advisor_reports", "created_at", monthISO, {
      is_paid: "true",
    }),
  ]);

  // Enrich recent purchases with email from user_profiles
  const advisorIds = [
    ...new Set(
      (recentPurchasesResult.data ?? []).map(
        (r: { advisor_id: string }) => r.advisor_id,
      ),
    ),
  ];
  const { data: emailProfiles } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("id, email")
    .in("id", advisorIds);

  const emailMap: Record<string, string> = {};
  for (const p of emailProfiles ?? []) {
    emailMap[(p as { id: string; email: string }).id] =
      (p as { id: string; email: string }).email ?? "";
  }

  type PurchaseRow = {
    advisor_id: string;
    plan_type: string | null;
    amount_cents: number | null;
    created_at: string;
  };
  const recentPurchases = (recentPurchasesResult.data ?? []).map(
    (r: PurchaseRow) => ({
      user_id: r.advisor_id,
      email: emailMap[r.advisor_id] ?? "",
      plan_type: r.plan_type ?? "single",
      amount_usd: (r.amount_cents ?? 0) / 100.0,
      purchased_at: r.created_at,
    }),
  );

  return NextResponse.json({
    revenue_this_month_usd: revenueThisMonth,
    revenue_last_month_usd: revenueLastMonth,
    active_subscribers: activeCount,
    trial_users: trialCount,
    expired_users: expiredCount,
    recent_purchases: recentPurchases,
    funnel: {
      signups,
      dna_scores: dnaScores,
      swarm_runs: 0,
      purchases,
    },
  });
}
