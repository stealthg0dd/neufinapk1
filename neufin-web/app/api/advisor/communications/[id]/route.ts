import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return proxyToRailway(
    req,
    `/api/advisor/communications/${encodeURIComponent(id)}`,
    "PATCH",
  );
}
