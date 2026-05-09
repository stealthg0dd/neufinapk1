import { NextRequest } from "next/server";
import { proxyToRailway } from "@/lib/proxy";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToRailway(req, `/api/advisor/clients/${encodeURIComponent(id)}`, "GET");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToRailway(req, `/api/advisor/clients/${encodeURIComponent(id)}`, "PATCH");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToRailway(
    req,
    `/api/advisor/clients/${encodeURIComponent(id)}`,
    "DELETE",
  );
}
