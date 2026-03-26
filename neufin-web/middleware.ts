import { NextRequest, NextResponse } from 'next/server'

// Routes that require authentication
const PROTECTED = ['/dashboard', '/vault', '/swarm']

// Backend auth-status probe URL
const API_AUTH_STATUS = 'https://neufin101-production.up.railway.app/api/auth/status'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!PROTECTED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // ── 1. Read the auth token ─────────────────────────────────────────────────
  // Try the Neufin auth cookie first (set on sign-in by the web app), then
  // fall back to Authorization header for API clients.
  const token =
    request.cookies.get('neufin-auth')?.value ||
    request.cookies.get('sb-access-token')?.value ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!token) {
    return redirectToAuth(request, pathname)
  }

  // ── 2. Validate the token against the backend ──────────────────────────────
  // A lightweight probe — avoids relying on cookie presence alone, which can
  // be stale after a password-change or remote sign-out.
  try {
    const res = await fetch(API_AUTH_STATUS, {
      headers: { Authorization: `Bearer ${token}` },
      // Short timeout — if the backend is unreachable, fall through to allow
      // the page to render (it will show its own auth guard client-side).
      signal: AbortSignal.timeout(3000),
    })

    if (res.ok) {
      const json = await res.json().catch(() => null)
      if (!json?.authenticated) {
        // Token present but rejected (expired, revoked, bad signature)
        // Redirect and let the client clear invalid tokens from localStorage.
        const loginUrl = new URL('/auth', request.url)
        loginUrl.searchParams.set('next', pathname)
        loginUrl.searchParams.set('reason', 'token_invalid')
        const response = NextResponse.redirect(loginUrl)
        // Clear the stale cookies
        response.cookies.delete('neufin-auth')
        response.cookies.delete('sb-access-token')
        return response
      }
      // Token is valid — proceed
      return NextResponse.next()
    }
  } catch {
    // Backend unreachable or timed out — allow the request through.
    // The page-level auth guard (client side) will handle the real enforcement.
    console.warn('[middleware] /api/auth/status unreachable — falling through')
  }

  // ── 3. Fallback: token present but status probe failed — allow through ─────
  return NextResponse.next()
}

function redirectToAuth(request: NextRequest, pathname: string) {
  const loginUrl = new URL('/auth', request.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/dashboard/:path*', '/vault/:path*', '/swarm/:path*'],
}
