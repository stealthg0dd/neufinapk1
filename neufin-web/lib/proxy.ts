import { NextRequest, NextResponse } from 'next/server'

const RAILWAY_BASE = process.env.RAILWAY_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'https://neufin101-production.up.railway.app'

// Validate at startup
try {
  new URL(RAILWAY_BASE)
} catch {
  console.error(
    `[proxy] RAILWAY_API_URL is not a valid URL: "${RAILWAY_BASE}". ` +
    `Falling back to hardcoded Railway URL.`
  )
}

export async function proxyToRailway(
  req: NextRequest,
  backendPath: string,
  method?: string
): Promise<NextResponse> {
  const url = `${RAILWAY_BASE}${backendPath}`
  const m = method || req.method

  // Auth token extraction — Authorization header takes priority over cookie.
  // The Authorization header always carries the fresh Supabase session token
  // (api-client.ts calls getSession() which auto-refreshes).
  // The neufin-auth cookie can contain stale/expired JWTs from previous sessions,
  // causing Railway to return 401 even when the browser has a valid token.
  let bearerToken: string | null = null

  // 1. Authorization header wins (always freshest token)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    bearerToken = authHeader.slice(7).trim() || null
  }

  // 2. Fall back to cookie only if no Authorization header present
  if (!bearerToken) {
    const cookie = req.cookies.get('neufin-auth')?.value
    if (cookie) {
      try {
        const parsed = JSON.parse(cookie)
        const candidate: string | null = parsed?.access_token || parsed?.token || null
        if (candidate) {
          // Skip obviously-expired tokens so we fail fast with a clear error
          // rather than forwarding a bad token and getting a confusing 401/500.
          try {
            const parts = candidate.split('.')
            const payload = JSON.parse(
              atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
            ) as { exp?: number }
            if (payload.exp && Date.now() / 1000 > payload.exp) {
              console.warn('[proxy] neufin-auth cookie token is expired — no auth forwarded')
            } else {
              bearerToken = candidate
            }
          } catch {
            // Can't decode JWT — use it anyway and let Railway decide
            bearerToken = candidate
          }
        }
      } catch {
        // Cookie is a raw string, not JSON
        bearerToken = cookie
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`

  let body: string | undefined
  if (m !== 'GET' && m !== 'HEAD') {
    try { body = await req.text() } catch { body = undefined }
  }

  try {
    const upstream = await fetch(url, {
      method: m,
      headers,
      body,
      signal: AbortSignal.timeout(90000), // 90s for swarm
    })

    const text = await upstream.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    console.error(`[proxy] ${m} ${url} failed:`, err)
    return NextResponse.json(
      { error: 'Upstream service unavailable', detail: String(err) },
      { status: 502 }
    )
  }
}
