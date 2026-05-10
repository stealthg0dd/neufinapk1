import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.toString();
  const path = q
    ? `/api/advisor/clients?${q}`
    : "/api/advisor/clients";
  return proxyToRailway(req, path, "GET");
}

export async function POST(req: NextRequest) {
  return proxyToRailway(req, "/api/advisor/clients", "POST");
}
