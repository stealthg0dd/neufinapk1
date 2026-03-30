import { NextRequest, NextResponse } from 'next/server'

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
    console.warn('[Middleware] Supabase env missing; denying protected request')
    return false
  }

  if (isJwtExpired(token)) {
    console.log('[Middleware] Token is expired or malformed')
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
      console.log('[Middleware] Supabase session validation failed:', response.status)
      return false
    }

    return true
  } catch (error) {
    console.error('[Middleware] Supabase session validation error:', error)
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
  console.log('[Middleware] Path:', pathname)
  console.log('[Middleware] All cookies:', request.cookies.getAll().map(c => c.name))

  const authCookie = request.cookies.get('neufin-auth')
  console.log('[Middleware] neufin-auth cookie:', {
    exists: !!authCookie,
    value: authCookie?.value ? `${authCookie.value.substring(0, 20)}...` : null,
  })

  if (!authCookie?.value) {
    console.log('[Middleware] No auth cookie — redirecting to /auth')
    return redirectToAuth(request, pathname)
  }

  const isValid = await hasValidSupabaseSession(authCookie.value)
  if (!isValid) {
    console.log('[Middleware] Invalid auth cookie — clearing and redirecting to /auth')
    return redirectToAuth(request, pathname, true)
  }

  console.log('[Middleware] Token found, allowing access')
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
