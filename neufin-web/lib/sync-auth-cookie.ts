import type { Session } from '@supabase/supabase-js'

/**
 * Mirrors the Supabase access token into a browser cookie so Next.js middleware
 * can read auth state on protected-route requests.
 */
export function syncAuthCookie(session: Pick<Session, 'access_token'> | null): void {
  if (typeof window === 'undefined') return

  const cookieName = 'neufin-auth'
  console.log('[AuthContext] syncAuthCookie called - token exists:', Boolean(session?.access_token))

  if (session?.access_token) {
    const maxAge = 60 * 60 * 24 * 7
    const cookieValue = session.access_token

    console.log('[AuthContext] Setting neufin-auth cookie')
    document.cookie = `${cookieName}=${cookieValue}; path=/; max-age=${maxAge}; SameSite=Lax`

    console.log('[AuthContext] Cookie set:', {
      name: cookieName,
      length: cookieValue.length,
      expires: new Date(Date.now() + maxAge * 1000).toISOString(),
    })
  } else {
    document.cookie = `${cookieName}=; path=/; max-age=0`
    console.log('[AuthContext] Cookie cleared')
  }
}
