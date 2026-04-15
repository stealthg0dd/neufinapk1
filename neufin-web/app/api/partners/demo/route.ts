import { NextRequest, NextResponse } from "next/server";

const RAILWAY_BASE =
  process.env.RAILWAY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://neufin101-production.up.railway.app";

/** Simple in-memory rate limiter — resets on cold start, acceptable for demo. */
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const DEMO_LIMIT = 10;
const WINDOW_MS = 3_600_000; // 1 hour

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Rate limiting ─────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const now = Date.now();
  const bucket = rateLimits.get(ip);

  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= DEMO_LIMIT) {
      return NextResponse.json(
        {
          error: "Demo rate limit reached.",
          message: `You've used all ${DEMO_LIMIT} free demo analyses. Sign up for full access.`,
        },
        { status: 429 },
      );
    }
    bucket.count++;
  } else {
    rateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }

  // ── Forward multipart/form-data directly — do NOT use proxyToRailway.
  //    proxyToRailway hardcodes Content-Type: application/json and reads the
  //    body as text, which destroys the multipart boundary.  /api/analyze-dna
  //    requires file: UploadFile so we must preserve the original Content-Type
  //    header (including the boundary) and stream the body as-is.
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const upstream = await fetch(`${RAILWAY_BASE}/api/analyze-dna`, {
      method: "POST",
      headers: {
        // Forward content-type with boundary intact — do NOT override with JSON
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      // NextRequest.body is a ReadableStream — pass it directly
      body: req.body,
      // @ts-expect-error — duplex required for streaming request bodies in Node 18+
      duplex: "half",
      signal: AbortSignal.timeout(30_000),
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
    console.error("[partners/demo] upstream error:", err);
    return NextResponse.json(
      { error: "Analysis service temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}
