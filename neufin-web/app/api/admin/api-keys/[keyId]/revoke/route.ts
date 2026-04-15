import { NextRequest } from "next/server";
import { proxyBackendJson } from "@/lib/admin-backend-proxy";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await params;
  return proxyBackendJson(
    req,
    `/api/admin/api-keys/${encodeURIComponent(keyId)}/revoke`,
    {
      method: "POST",
    },
  );
}
