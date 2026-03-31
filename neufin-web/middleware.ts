import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ── Public path prefixes — skip auth check entirely ───────────────────────
const PUBLIC_PREFIXES = [
  '/auth',          // /auth  +  /auth/callback
  '/upload',
  '/results',
  '/features',
  '/blog',
  '/market',
  '/leaderboard',
  '/research',
  '/privacy',
  '/share',
  '/referrals',
  '/reports',
  '/api',           // API routes handle their own auth
  '/favicon',
  '/og',
  '/manifest',
  '/sitemap',
  '/robots',
  '/llms',
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
    logger.warn({}, 'middleware.supabase_env_missing')
    return false
  }

  if (isJwtExpired(token)) {
    logger.debug({}, 'middleware.token_expired_or_malformed')
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
      logger.warn({ status: response.status }, 'middleware.supabase_session_invalid')
      return false
    }

    return true
  } catch (error) {
    logger.error({ error }, 'middleware.supabase_session_error')
    return false
  }
}

function redirectToAuth(request: NextRequest, pathname: string, clearCookie = false): NextResponse {
  const loginUrl = new URL('/auth', request.url)
  loginUrl.searchParams.set('next', pathname)

  const response = NextResponse.redirect(loginUrl)
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
  if (pathname === '/') return NextResponse.next()

  // ── All other explicitly public paths ─────────────────────────────────────
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // ── Protected path — check cookie ─────────────────────────────────────────
  logger.debug({ pathname, cookies: request.cookies.getAll().map(c => c.name) }, '[Middleware] protected_path')

  // Read neufin-auth cookie (must match syncAuthCookie)
  let authCookie = request.cookies.get('neufin-auth')
  logger.debug({
    exists: !!authCookie,
    value: authCookie?.value ? `${authCookie.value.substring(0, 20)}...` : null,
  }, '[Middleware] auth_cookie')

  // Fallback: check Authorization header for API routes if no cookie
  let token = authCookie?.value
  if (!token && pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
      logger.debug({ pathname }, '[Middleware] using Authorization header fallback')
    }
  }

  if (!token) {
    logger.info({ pathname }, '[Middleware] redirect_no_cookie')
    return redirectToAuth(request, pathname)
  }

  const isValid = await hasValidSupabaseSession(token)
  if (!isValid) {
    logger.info({ pathname }, '[Middleware] redirect_invalid_cookie')
    return redirectToAuth(request, pathname, true)
  }

  logger.info({ pathname }, '[Middleware] allow_request')
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
