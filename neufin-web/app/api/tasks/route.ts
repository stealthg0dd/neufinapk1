/**
 * Supabase tasks proxy — service-role key stays server-side.
 * Returns blocked + pending tasks, newest first, limit 20.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co   (or SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY=<service role key>
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
 */

import { NextRequest, NextResponse } from "next/server";
import type { TaskRecord } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

const SUPA_URL = (
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  ""
).replace(/\/$/, "");
const SUPA_KEY =
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";
const SUPA_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function resolveAdminEmail(token: string): Promise<string | null> {
  if (!SUPA_URL || !SUPA_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPA_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { email?: string };
    return (user.email ?? "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Require a valid session JWT from cookie or Authorization header
  const token =
    request.cookies.get("neufin-auth")?.value ??
    request.headers.get("authorization")?.replace(/^Bearer /, "") ??
    "";

  if (!token) {
    return NextResponse.json({ tasks: [], error: "Unauthorized" }, { status: 401 });
  }

  const email = await resolveAdminEmail(token);
  if (!email) {
    return NextResponse.json({ tasks: [], error: "Unauthorized" }, { status: 401 });
  }

  // If ADMIN_EMAILS is configured, enforce the allowlist; otherwise any valid session passes
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ tasks: [], error: "Forbidden" }, { status: 403 });
  }

  if (!SUPA_URL || !SUPA_KEY) {
    return NextResponse.json(
      {
        tasks: [],
        error: "Supabase env vars not configured (SUPABASE_SERVICE_KEY)",
      },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/tasks?status=in.("blocked","pending")&order=created_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { tasks: [], error: `Supabase ${res.status}: ${txt.slice(0, 200)}` },
        { status: res.status },
      );
    }

    const tasks = (await res.json()) as TaskRecord[];
    return NextResponse.json({ tasks });
  } catch (e) {
    return NextResponse.json(
      { tasks: [], error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
