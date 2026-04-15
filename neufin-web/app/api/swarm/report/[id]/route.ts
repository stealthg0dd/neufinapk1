import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return proxyToRailway(req, `/api/swarm/report/${params.id}`, "GET");
}
