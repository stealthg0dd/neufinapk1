import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";
export async function POST(req: NextRequest) {
  return proxyToRailway(req, "/api/portfolio/analyze");
}
export async function GET(req: NextRequest) {
  return proxyToRailway(req, "/api/portfolio/analyze", "GET");
}
