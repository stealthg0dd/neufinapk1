import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";

export async function POST(req: NextRequest) {
  return proxyToRailway(req, "/api/leads", "POST");
}
