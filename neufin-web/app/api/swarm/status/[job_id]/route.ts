import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ job_id: string }> },
) {
  const { job_id } = await context.params;
  return proxyToRailway(req, `/api/swarm/status/${job_id}`, "GET");
}
