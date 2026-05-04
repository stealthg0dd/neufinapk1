/**
 * GET /api/admin/leads — proxy to backend admin leads endpoint
 * PATCH /api/admin/leads — proxy for updating a lead
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.RAILWAY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization") ?? "";
  const qs = req.nextUrl.search;
  const res = await fetch(`${BACKEND}/api/admin/leads${qs}`, {
    headers: { authorization: token },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
