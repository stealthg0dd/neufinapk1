import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params;
  return proxyToRailway(req, `/api/referrals/validate/${ref}`, "GET");
}
