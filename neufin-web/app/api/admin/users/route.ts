/**
 * GET /api/admin/users
 *
 * Proxies to FastAPI (ops: advisor OR is_admin) and maps to UserAdminRow[]
 * for backward compatibility with /dashboard/admin.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND = () => process.env.NEXT_PUBLIC_API_URL ?? "";

export interface UserAdminRow {
  id: string;
  email: string;
  name?: string;
  firm_name?: string | null;
  subscription_status: string;
  subscription_tier?: string | null;
  trial_started_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  dna_score_count: number;
  reports_purchased: number;
  role: string | null;
}

function mapRow(p: Record<string, unknown>): UserAdminRow {
  return {
    id: String(p.id),
    email: String(p.email ?? ""),
    name: String(p.name ?? ""),
    firm_name: (p.firm_name as string) ?? null,
    subscription_status: String(p.subscription_status ?? p.status ?? "unknown"),
    subscription_tier:
      (p.subscription_tier as string) ?? (p.plan as string) ?? null,
    trial_started_at: (p.trial_started_at as string) ?? null,
    created_at: (p.created_at as string) ?? null,
    last_sign_in_at:
      (p.last_sign_in_at as string) ?? (p.last_active_at as string) ?? null,
    dna_score_count: Number(p.dna_score_count ?? p.analyses_used ?? 0),
    reports_purchased: Number(p.reports_purchased ?? 0),
    role: (p.role as string) ?? null,
  };
}

export async function GET(req: NextRequest) {
  const base = BACKEND();
  if (!base) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 503 },
    );
  }
  const qs = req.nextUrl.search;
  const auth = req.headers.get("authorization") ?? "";
  const res = await fetch(`${base.replace(/\/$/, "")}/api/admin/users${qs}`, {
    method: "GET",
    headers: { authorization: auth },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  const items = Array.isArray(data) ? data : (data.items ?? []);
  const rows: UserAdminRow[] = (items as Record<string, unknown>[]).map(mapRow);
  return NextResponse.json(rows);
}
