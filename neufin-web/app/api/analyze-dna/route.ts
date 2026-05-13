import { NextRequest, NextResponse } from "next/server";
import { bearerTokenFromRequest } from "@/lib/proxy";

const RAILWAY_BASE =
  process.env.RAILWAY_API_URL ||
  "https://neufin101-production.up.railway.app";

/**
 * Proxy POST /api/analyze-dna → Railway.
 *
 * Why this exists instead of relying on the next.config.js fallback rewrite:
 *   The rewrite runs on the server but only when NEXT_PUBLIC_API_URL is empty.
 *   If NEXT_PUBLIC_API_URL is accidentally set to the Railway URL in Vercel,
 *   the browser bundle calls Railway directly — which breaks on any network
 *   that can't resolve *.up.railway.app (corporate proxies, regional DNS gaps).
 *
 *   This route always intercepts /api/analyze-dna at the Vercel edge, so the
 *   browser never needs to reach Railway.  The Railway call is server→server.
 *
 * Multipart note: proxyToRailway() reads the body as text which destroys the
 * multipart boundary. We must preserve the original Content-Type header
 * (including boundary) and stream the body as-is.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";
  const bearerToken = bearerTokenFromRequest(req);

  const forwardHeaders: Record<string, string> = {};
  if (contentType) forwardHeaders["Content-Type"] = contentType;
  if (bearerToken) forwardHeaders["Authorization"] = `Bearer ${bearerToken}`;

  // Forward X-Forwarded-For so Railway can rate-limit guests by real IP
  const xff = req.headers.get("x-forwarded-for");
  if (xff) forwardHeaders["X-Forwarded-For"] = xff;

  try {
    const upstream = await fetch(`${RAILWAY_BASE}/api/analyze-dna`, {
      method: "POST",
      headers: forwardHeaders,
      body: req.body,
      // @ts-expect-error — duplex required for streaming request bodies in Node 18+
      duplex: "half",
      signal: AbortSignal.timeout(90_000),
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Normalize 402 detail so the browser always gets a consistent shape.
    // The Python backend returns: { detail: { code, message, checkout_url?, upgrade_url? } }
    // Flatten it so the frontend can read detail.message directly.
    if (upstream.status === 402) {
      const raw = data as Record<string, unknown>;
      const detail =
        typeof raw?.detail === "object" && raw.detail !== null
          ? (raw.detail as Record<string, unknown>)
          : null;

      return NextResponse.json(
        {
          success: false,
          error_code:
            (detail?.code as string) ?? "SUBSCRIPTION_REQUIRED",
          message:
            (detail?.message as string) ??
            "Subscription required to run this analysis.",
          checkout_url:
            (detail?.checkout_url as string) ??
            (detail?.upgrade_url as string) ??
            null,
          upgrade_url: (detail?.upgrade_url as string) ?? "/pricing",
        },
        { status: 402 },
      );
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("[analyze-dna proxy] upstream error:", err);
    // Distinguish DNS/network errors from Railway being up but erroring
    const isNetworkError =
      err instanceof TypeError &&
      (String(err.message).includes("fetch failed") ||
        String(err.message).includes("ENOTFOUND") ||
        String(err.message).includes("network"));

    return NextResponse.json(
      {
        success: false,
        error_code: isNetworkError ? "BACKEND_UNAVAILABLE" : "PROXY_ERROR",
        message: isNetworkError
          ? "Analysis service is temporarily unreachable. Please try again in a moment."
          : "An unexpected error occurred. Please try again.",
      },
      { status: 502 },
    );
  }
}
