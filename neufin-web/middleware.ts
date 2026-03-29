import { NextRequest, NextResponse } from 'next/server'

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
    const loginUrl = new URL('/auth', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  console.log('[Middleware] Auth cookie found — allowing access')
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
