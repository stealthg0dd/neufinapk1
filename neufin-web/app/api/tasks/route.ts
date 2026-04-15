/**
 * Supabase tasks proxy — service-role key stays server-side.
 * Returns blocked + pending tasks, newest first, limit 20.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co   (or SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY=<service role key>
 */

import { NextResponse } from "next/server";
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

export async function GET() {
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
