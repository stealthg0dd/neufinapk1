import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.RAILWAY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await params;
  const token = req.headers.get("authorization") ?? "";
  const res = await fetch(`${BACKEND}/api/developer/keys/${keyId}`, {
    method: "DELETE",
    headers: { authorization: token },
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
