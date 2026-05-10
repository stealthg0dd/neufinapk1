import { NextRequest } from "next/server";
import { proxyBinaryGet } from "@/lib/proxy";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<unknown> },
) {
  const p = (await ctx.params) as Record<string, string | string[] | undefined>;
  const raw = p.id;
  const id = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  return proxyBinaryGet(
    req,
    `/api/advisor/communications/${encodeURIComponent(id)}/pdf`,
  );
}
