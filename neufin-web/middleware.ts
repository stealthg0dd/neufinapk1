import { NextRequest, NextResponse } from 'next/server'

const PROTECTED = ['/dashboard']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!PROTECTED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Read access token from cookie (Supabase sets sb-<project>-auth-token)
  // We check the auth-token cookie that the Supabase client persists
  const token = request.cookies.get('neufin-auth')?.value

  if (!token) {
    // No cookie — check Authorization header (for API clients)
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      const loginUrl = new URL('/auth', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
