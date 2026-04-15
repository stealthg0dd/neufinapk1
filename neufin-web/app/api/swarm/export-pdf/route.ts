import { NextRequest } from "next/server";
import { proxyBinaryPost } from "@/lib/proxy";

export async function POST(req: NextRequest) {
  return proxyBinaryPost(req, "/api/swarm/export-pdf");
}
