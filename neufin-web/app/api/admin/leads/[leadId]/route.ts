import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.RAILWAY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;
  const token = req.headers.get("authorization") ?? "";
  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/admin/leads/${leadId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
