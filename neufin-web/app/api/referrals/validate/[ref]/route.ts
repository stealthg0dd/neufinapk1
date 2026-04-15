import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";
export async function GET(
  req: NextRequest,
  { params }: { params: { ref: string } },
) {
  return proxyToRailway(req, `/api/referrals/validate/${params.ref}`, "GET");
}
