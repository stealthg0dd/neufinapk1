import { NextRequest, NextResponse } from "next/server";

function backendBase(): string {
  return (
    process.env.RAILWAY_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    ""
  );
}

function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.trim()) return auth;

  const cookieToken = req.cookies.get("neufin-auth")?.value?.trim();
  if (!cookieToken) return null;
  return cookieToken.startsWith("Bearer ")
    ? cookieToken
    : `Bearer ${cookieToken}`;
}

/**
 * Forward an authenticated request to the FastAPI backend (Railway).
 * The browser sends `Authorization: Bearer …`; we pass it through unchanged.
 */
export async function proxyBackendJson(
  req: NextRequest,
  backendPath: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  const base = backendBase();
  if (!base) {
    return NextResponse.json(
      {
        error: "server_misconfigured",
        message: "RAILWAY_API_URL is not set",
      },
      { status: 503 },
    );
  }
  const url = `${base.replace(/\/$/, "")}${backendPath.startsWith("/") ? backendPath : `/${backendPath}`}`;
  const headers = new Headers(init.headers);
  const auth = extractBearerToken(req);
  if (auth) headers.set("authorization", auth);
  if (
    init.body !== undefined &&
    init.body !== null &&
    init.body !== "" &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
