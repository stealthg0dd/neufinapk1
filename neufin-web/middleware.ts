import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://apis.google.com https://us.posthog.com",
  "script-src-elem 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com https://apis.google.com https://us.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.railway.app https://api.stripe.com https://us.i.posthog.com https://*.sentry.io https://polygon.io https://finnhub.io https://financialmodelingprep.com https://api.twelvedata.com https://www.google-analytics.com https://google-analytics.com https://www.google.com https://google.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) {
  // Keep middleware logging runtime-safe for Edge by using console only.
  if (level === 'debug' && process.env.NODE_ENV === 'production') return
  const payload = data === undefined ? message : `${message} ${JSON.stringify(data)}`
  if (level === 'error') console.error(payload)
  else if (level === 'warn') console.warn(payload)
  else console.log(payload)
}

// ── Public path prefixes — skip auth check entirely ───────────────────────
const PUBLIC_PREFIXES = [
  // Note: do not use '/' here — every pathname starts with '/' and would skip auth.
  '/auth',          // /auth  +  /auth/callback
  '/login',
  '/signup',
  '/onboarding',    // new-user onboarding flow (auth checked client-side)
  '/pricing',
  '/contact-sales',
  '/upload',
  '/results',
  '/features',
  '/blog',
  '/market',
  '/leaderboard',
  '/research',
  '/feedback',
  '/privacy',
  '/share',
  '/referrals',
  '/reports',
  '/api/research',
  '/api/feedback',
  '/api/plans',
  '/api',           // API routes handle their own auth
  '/favicon',
  '/icon',
  '/og',
  '/manifest',
  '/sitemap',
  '/robots',
  '/llms',
]

// ── Admin portal — require valid session AND is_admin on user_profiles ─────
const ADMIN_ONLY_PREFIXES = ['/admin']

// ── Advisor-only paths — require valid session AND advisor role ────────────
const ADVISOR_ONLY_PREFIXES = [
  '/dashboard/admin',
  '/dashboard/revenue',
]

function isJwtExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.')
    if (!payload) return true

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(padded)) as { exp?: number }

    return !decoded.exp || decoded.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

async function hasValidSupabaseSession(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    log('warn', 'middleware.supabase_env_missing')
    return false
  }

  if (isJwtExpired(token)) {
    log('debug', 'middleware.token_expired_or_malformed')
    return false
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      log('warn', 'middleware.supabase_session_invalid', { status: response.status })
      return false
    }

    return true
  } catch (error) {
    log('error', 'middleware.supabase_session_error', error)
    return false
  }
}

async function hasAdminRole(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) return false
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!userRes.ok) return false
    const userJson = await userRes.json() as { id?: string }
    const userId = userJson.id
    if (!userId) return false

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=is_admin&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        cache: 'no-store',
      },
    )
    if (!profileRes.ok) return false
    const profiles = await profileRes.json() as { is_admin?: boolean }[]
    return profiles[0]?.is_admin === true
  } catch (error) {
    log('error', 'middleware.admin_check_error', error)
    return false
  }
}

async function hasAdvisorRole(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false
  try {
    // Get user from token
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!userRes.ok) return false
    const userJson = await userRes.json() as { id?: string }
    const userId = userJson.id
    if (!userId) return false

    // Check user_profiles.role via REST API with service key
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        cache: 'no-store',
      },
    )
    if (!profileRes.ok) return false
    const profiles = await profileRes.json() as { role?: string }[]
    return profiles[0]?.role === 'advisor'
  } catch (error) {
    log('error', 'middleware.advisor_check_error', error)
    return false
  }
}

function redirectToDashboard(request: NextRequest): NextResponse {
  const dashboardUrl = new URL('/dashboard', request.url)
  const res = NextResponse.redirect(dashboardUrl)
  res.headers.set('Content-Security-Policy', CSP)
  return res
}

function redirectToAuth(request: NextRequest, pathname: string, clearCookie = false): NextResponse {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', pathname)

  const response = NextResponse.redirect(loginUrl)
  response.headers.set('Content-Security-Policy', CSP)
  if (clearCookie) {
    response.cookies.set('neufin-auth', '', {
      path: '/',
      maxAge: 0,
    })
  }

  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Landing page: always public ───────────────────────────────────────────
  if (pathname === '/') {
    const res = NextResponse.next()
    res.headers.set('Content-Security-Policy', CSP)
    return res
  }

  // ── All other explicitly public paths ─────────────────────────────────────
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next()
    res.headers.set('Content-Security-Policy', CSP)
    return res
  }

  // ── Protected path — check cookie ─────────────────────────────────────────
  log('debug', 'middleware.protected_path', {
    pathname,
    cookies: request.cookies.getAll().map((c) => c.name),
  })

  // Read neufin-auth cookie (must match syncAuthCookie)
  let authCookie = request.cookies.get('neufin-auth')
  log('debug', 'middleware.auth_cookie', {
    exists: !!authCookie,
    value: authCookie?.value ? `${authCookie.value.substring(0, 20)}...` : null,
  })

  // Fallback: check Authorization header for API routes if no cookie
  let token = authCookie?.value
  if (!token && pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
      log('debug', 'middleware.authorization_header_fallback', { pathname })
    }
  }

  if (!token) {
    log('info', 'middleware.redirect_no_cookie', { pathname })
    return redirectToAuth(request, pathname)
  }

  const isValid = await hasValidSupabaseSession(token)
  if (!isValid) {
    log('info', 'middleware.redirect_invalid_cookie', { pathname })
    return redirectToAuth(request, pathname, true)
  }

  // ── Internal admin portal (/admin/*): is_admin only ───────────────────────
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const isAdmin = await hasAdminRole(token)
    if (!isAdmin) {
      log('info', 'middleware.redirect_non_admin', { pathname })
      return redirectToDashboard(request)
    }
  }

  // ── Advisor-only paths: additional role check ─────────────────────────────
  if (ADVISOR_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const isAdvisor = await hasAdvisorRole(token)
    if (!isAdvisor) {
      log('info', 'middleware.redirect_non_advisor', { pathname })
      return redirectToDashboard(request)
    }
  }

  log('info', 'middleware.allow_request', { pathname })
  const res = NextResponse.next()
  res.headers.set('Content-Security-Policy', CSP)
  return res
}

export const config = {
  matcher: [
    // Run on app routes; skip internals and static/metadata assets to avoid redirect loops.
    '/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|sitemap|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json)$).*)',
  ],
}
