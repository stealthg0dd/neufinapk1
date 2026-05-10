import { NextRequest, NextResponse } from "next/server";

const RAILWAY_BASE =
  process.env.RAILWAY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://neufin101-production.up.railway.app";

// Validate at startup
try {
  new URL(RAILWAY_BASE);
} catch {
  console.error(
    `[proxy] RAILWAY_API_URL is not a valid URL: "${RAILWAY_BASE}". ` +
      "Falling back to hardcoded Railway URL.",
  );
}

/** Extract Supabase JWT for upstream Railway calls (header first, then cookie). */
export function bearerTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() || null;
  }

  const cookie = req.cookies.get("neufin-auth")?.value;
  if (!cookie) return null;

  try {
    const parsed = JSON.parse(cookie);
    const candidate: string | null =
      parsed?.access_token || parsed?.token || null;
    if (!candidate) return null;
    try {
      const parts = candidate.split(".");
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      ) as { exp?: number };
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        console.warn(
          "[proxy] neufin-auth cookie token is expired — no auth forwarded",
        );
        return null;
      }
    } catch {
      // Can't decode JWT — use it anyway and let Railway decide
    }
    return candidate;
  } catch {
    return cookie;
  }
}

export async function proxyToRailway(
  req: NextRequest,
  backendPath: string,
  method?: string,
): Promise<NextResponse> {
  const url = `${RAILWAY_BASE}${backendPath}`;
  const m = method || req.method;

  const bearerToken = bearerTokenFromRequest(req);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  let body: string | undefined;
  if (m !== "GET" && m !== "HEAD") {
    try {
      body = await req.text();
    } catch {
      body = undefined;
    }
  }

  try {
    const upstream = await fetch(url, {
      method: m,
      headers,
      body,
      signal: AbortSignal.timeout(90000), // 90s for swarm
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error(`[proxy] ${m} ${url} failed:`, err);
    return NextResponse.json(
      { error: "Upstream service unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

/** POST to Railway and return binary (e.g. PDF); forwards auth only, no JSON body. */
export async function proxyBinaryPost(
  req: NextRequest,
  backendPath: string,
): Promise<NextResponse> {
  const url = `${RAILWAY_BASE}${backendPath}`;
  const bearerToken = bearerTokenFromRequest(req);
  const headers: Record<string, string> = {};
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(120000),
    });
    const buf = await upstream.arrayBuffer();
    const out = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) out.set("content-type", ct);
    const cd = upstream.headers.get("content-disposition");
    if (cd) out.set("content-disposition", cd);
    return new NextResponse(buf, { status: upstream.status, headers: out });
  } catch (err) {
    console.error(`[proxy] POST ${url} failed:`, err);
    return NextResponse.json(
      { error: "Upstream service unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}

/** GET from Railway and return binary (e.g. PDF); forwards auth only. */
export async function proxyBinaryGet(
  req: NextRequest,
  backendPath: string,
): Promise<NextResponse> {
  const url = `${RAILWAY_BASE}${backendPath}`;
  const bearerToken = bearerTokenFromRequest(req);
  const headers: Record<string, string> = {};
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(120000),
    });
    const buf = await upstream.arrayBuffer();
    const out = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) out.set("content-type", ct);
    const cd = upstream.headers.get("content-disposition");
    if (cd) out.set("content-disposition", cd);
    return new NextResponse(buf, { status: upstream.status, headers: out });
  } catch (err) {
    console.error(`[proxy] GET ${url} failed:`, err);
    return NextResponse.json(
      { error: "Upstream service unavailable", detail: String(err) },
      { status: 502 },
    );
  }
}
