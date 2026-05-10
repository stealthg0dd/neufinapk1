import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.toString();
  const path = q
    ? `/api/advisor/communications?${q}`
    : "/api/advisor/communications";
  return proxyToRailway(req, path, "GET");
}
