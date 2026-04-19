import { NextRequest } from "next/server";
import { proxyBackendJson } from "@/lib/admin-backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.search;
  return proxyBackendJson(req, `/api/admin/control-tower${q}`, {
    method: "GET",
  });
}
