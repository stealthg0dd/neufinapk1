import type { Session } from '@supabase/supabase-js'
import { logger } from './logger'

/**
 * Mirrors the Supabase access token into a browser cookie so Next.js middleware
 * can read auth state on protected-route requests.
 */
export function syncAuthCookie(session: Pick<Session, 'access_token'> | null): void {
  if (typeof window === 'undefined') return

  const cookieName = 'neufin-auth'
  logger.debug({ hasToken: Boolean(session?.access_token) }, 'auth.cookie_sync')

  if (session?.access_token) {
    const maxAge = 60 * 60 * 24 * 7
    const cookieValue = session.access_token

    document.cookie = `${cookieName}=${cookieValue}; path=/; max-age=${maxAge}; SameSite=Lax`

    logger.debug({
      name: cookieName,
      length: cookieValue.length,
      expires: new Date(Date.now() + maxAge * 1000).toISOString(),
    }, 'auth.cookie_set')
  } else {
    document.cookie = `${cookieName}=; path=/; max-age=0`
    logger.debug({ name: cookieName }, 'auth.cookie_cleared')
  }
}
