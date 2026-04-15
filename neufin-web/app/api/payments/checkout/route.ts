import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function resolveServerFetchOrigin(req: NextRequest): string {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) {
    try {
      return new URL(app.includes("://") ? app : `https://${app}`).origin;
    } catch {
      /* fall through */
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return req.nextUrl.origin;
}

function resolveBackendBase(req: NextRequest): string {
  const raw =
    process.env.RAILWAY_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw) {
    try {
      return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
    } catch {
      console.error("[payments/checkout] invalid backend URL env:", raw);
    }
  }
  return resolveServerFetchOrigin(req);
}

function resolvePriceId(plan: "single" | "unlimited"): string | undefined {
  if (plan === "single") {
    return (
      process.env.STRIPE_PRICE_SINGLE_REPORT ||
      process.env.STRIPE_PRICE_ADVISOR_REPORT_ONETIME
    );
  }
  return process.env.STRIPE_PRICE_ADVISOR_MONTHLY;
}

/**
 * Proxies subscription checkout to the Railway backend.
 * Backend exposes POST /api/reports/checkout with plan: "single" | "unlimited".
 */
export async function POST(req: NextRequest) {
  const requiredEnvs = [
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ];
  for (const key of requiredEnvs) {
    if (!process.env[key]) {
      console.error(`[checkout] Missing env var: ${key}`);
      return NextResponse.json(
        { error: `Server misconfigured: ${key} missing` },
        { status: 500 },
      );
    }
  }

  const backend = resolveBackendBase(req);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const authHeaderToken = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const cookieStore = await cookies();
  const supabaseCookieNames = cookieStore
    .getAll()
    .map((c) => c.name)
    .filter((name) => /^sb-.*-auth-token$/.test(name));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[payments/checkout] Missing Supabase envs for SSR auth client",
      {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseAnonKey: Boolean(supabaseAnonKey),
      },
    );
    return NextResponse.json({ detail: "Auth misconfigured" }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } catch {
            // Route handlers may not always be able to mutate cookies; read path is enough here.
          }
        }
      },
    },
  });

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const sessionToken = sessionData.session?.access_token ?? null;
  let token = sessionToken ?? authHeaderToken ?? null;

  if (!token) {
    console.error("[payments/checkout] auth_missing_cookie", {
      hasLegacyNeufinCookie: Boolean(cookieStore.get("neufin-auth")?.value),
      hasSupabaseAuthCookie: supabaseCookieNames.length > 0,
      hasAuthorizationHeader: Boolean(authHeaderToken),
      authCookieNames: supabaseCookieNames,
      allCookieNames: cookieStore.getAll().map((c) => c.name),
    });
    return NextResponse.json(
      { detail: "Unauthorized: Missing Cookie" },
      { status: 401 },
    );
  }

  if (sessionError || !sessionData.session) {
    // We allow Authorization header fallback if present, but log clear diagnosis.
    console.error("[payments/checkout] auth_invalid_token", {
      hasAuthorizationHeader: Boolean(authHeaderToken),
      hasSupabaseAuthCookie: supabaseCookieNames.length > 0,
      authCookieNames: supabaseCookieNames,
      allCookieNames: cookieStore.getAll().map((c) => c.name),
      sessionError: sessionError?.message ?? null,
      tokenSource: sessionToken
        ? "supabase_session"
        : authHeaderToken
          ? "authorization_header"
          : "unknown",
    });
    if (!authHeaderToken) {
      return NextResponse.json(
        { detail: "Unauthorized: Invalid Token" },
        { status: 401 },
      );
    }
    token = authHeaderToken;
  }

  const plan = typeof body.plan === "string" ? body.plan : "unlimited";
  if (plan !== "single" && plan !== "unlimited") {
    return NextResponse.json(
      { detail: "plan must be single or unlimited" },
      { status: 400 },
    );
  }

  const priceId = resolvePriceId(plan);
  if (!priceId) {
    console.error("[payments/checkout] missing stripe price id", {
      plan,
      STRIPE_PRICE_SINGLE_REPORT: Boolean(
        process.env.STRIPE_PRICE_SINGLE_REPORT,
      ),
      STRIPE_PRICE_ADVISOR_REPORT_ONETIME: Boolean(
        process.env.STRIPE_PRICE_ADVISOR_REPORT_ONETIME,
      ),
      STRIPE_PRICE_ADVISOR_MONTHLY: Boolean(
        process.env.STRIPE_PRICE_ADVISOR_MONTHLY,
      ),
      STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    });
  }

  const payload = {
    plan,
    price_id: priceId,
    portfolio_id: body.portfolio_id,
    positions: body.positions,
    advisor_id: body.advisor_id ?? "anonymous",
    ref_token: body.ref_token,
    success_url:
      typeof body.success_url === "string" && body.success_url.length > 0
        ? body.success_url
        : `${req.nextUrl.origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:
      typeof body.cancel_url === "string" && body.cancel_url.length > 0
        ? body.cancel_url
        : `${req.nextUrl.origin}/pricing`,
  };

  try {
    const res = await fetch(`${backend}/api/reports/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text || res.statusText };
    }

    if (!res.ok) {
      console.error("[payments/checkout] upstream failure", {
        status: res.status,
        backend,
        detail:
          typeof data === "object" && data
            ? (data as { detail?: unknown }).detail
            : data,
        hasAuth: Boolean(token),
        hasSecret: Boolean(process.env.STRIPE_SECRET_KEY),
        hasAdvisorMonthlyPrice: Boolean(
          process.env.STRIPE_PRICE_ADVISOR_MONTHLY,
        ),
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[payments/checkout] request error", {
      backend,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { detail: "Checkout unavailable. Please try again shortly." },
      { status: 502 },
    );
  }
}
