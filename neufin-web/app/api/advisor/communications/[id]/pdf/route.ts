import { NextRequest } from "next/server";
import { proxyBinaryGet } from "@/lib/proxy";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return proxyBinaryGet(
    req,
    `/api/advisor/communications/${encodeURIComponent(id)}/pdf`,
  );
}
