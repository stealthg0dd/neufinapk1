import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToRailway(
    req,
    `/api/advisor/meeting-prep/${encodeURIComponent(id)}`,
    "PATCH",
  );
}
