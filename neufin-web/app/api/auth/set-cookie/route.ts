import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * POST /api/auth/set-cookie
 *
 * Accepts { access_token, refresh_token } from the OAuth callback page and
 * writes both the Supabase SSR session cookies AND the `neufin-auth` cookie
 * that the Next.js middleware uses for route protection.
 *
 * Called by the client-side callback page BEFORE window.location.replace so
 * the very first server-side request to /dashboard has valid auth cookies.
 */
export async function POST(req: NextRequest) {
  let access_token: string | undefined
  let refresh_token: string | undefined

  try {
    const body = await req.json()
    access_token = body.access_token
    refresh_token = body.refresh_token
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400 })
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )

  // Set the session — this writes the Supabase SSR cookies (sb-*-auth-token).
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  // Also set the neufin-auth cookie that middleware and the proxy read.
  const response = NextResponse.json({ ok: true })
  const maxAge = 60 * 60 * 24 * 7 // 7 days
  response.cookies.set('neufin-auth', access_token, {
    path: '/',
    maxAge,
    httpOnly: false, // must be readable client-side for syncAuthCookie debug
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
