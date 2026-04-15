import { NextRequest, NextResponse } from "next/server";

function backendBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "";
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
        message: "NEXT_PUBLIC_API_URL is not set",
      },
      { status: 503 },
    );
  }
  const url = `${base.replace(/\/$/, "")}${backendPath.startsWith("/") ? backendPath : `/${backendPath}`}`;
  const headers = new Headers(init.headers);
  const auth = req.headers.get("authorization");
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
