import { NextRequest } from "next/server";
import { proxyBackendJson } from "@/lib/admin-backend-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return proxyBackendJson(req, "/api/admin/control-tower/refresh", {
    method: "POST",
  });
}
