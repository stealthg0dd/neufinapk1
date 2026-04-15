import { NextRequest } from "next/server";
import { proxyBackendJson } from "@/lib/admin-backend-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyBackendJson(req, "/api/admin/api-keys/issue", {
    method: "POST",
    body,
  });
}
