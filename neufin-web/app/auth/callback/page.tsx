'use client'

export const dynamic = 'force-dynamic'

/**
 * OAuth / Magic-Link callback handler.
 *
 * Supabase redirects here after:
 *   - Google OAuth sign-in  (PKCE: ?code=... in the URL)
 *   - Magic link click from email  (hash fragment: #access_token=...)
 *
 * Flow:
 *   1. Fast path — if a session is already established on mount, redirect immediately.
 *   2. Primary path — wait for SIGNED_IN / TOKEN_REFRESHED via onAuthStateChange.
 *      The Supabase JS client v2 exchanges the PKCE code automatically when it
 *      initialises with detectSessionInUrl:true (the default).
 *   3. Error path — if the URL contains ?error= (provider cancelled / denied),
 *      or the code exchange fails, redirects to /auth?error=<message>.
 *      The auth page reads this param and displays it to the user.
 *
 * The previous 10-second timeout was removed: it caused a race condition where
 * the redirect fired before the PKCE exchange completed on slow connections,
 * landing the user on a protected page with no session.
 */

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { syncAuthCookie } from '@/lib/sync-auth-cookie'
import { logger } from '@/lib/logger'
import { useNeufinAnalytics } from '@/lib/analytics'

const TAG = '[AuthCallback]'

const Spinner = () => (
  <div className="min-h-screen bg-gray-950 flex items-center justify-center">
    <div className="text-center space-y-3">
      <div className="w-8 h-8 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin mx-auto" />
      <p className="text-gray-500 text-sm">Signing you in…</p>
    </div>
  </div>
)

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthCallbackContent />
    </Suspense>
  )
}

function AuthCallbackContent() {
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') || '/dashboard'
  const { capture }  = useNeufinAnalytics()

  useEffect(() => {
    // ── 0. Check for provider-level error in URL params ───────────────
    const urlError = searchParams.get('error')
    const urlErrorDesc = searchParams.get('error_description')
    if (urlError) {
      logger.error({ tag: TAG, urlError, urlErrorDesc }, 'auth.callback_provider_error')
      window.location.href = `/auth?error=${encodeURIComponent(urlErrorDesc ?? urlError)}`
      return
    }

    let cancelled = false;
    (async () => {
      // ── 1. Exchange code for session (primary path) ──
      const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href)
      if (cancelled) return
      if (error) {
        logger.error({ tag: TAG, error }, 'auth.callback_exchange_error')
        window.location.href = `/auth?error=oauth_failed`
        return
      }
      if (data?.session) {
        syncAuthCookie(data.session)
        const method = sessionStorage.getItem('neufin_auth_method') ?? 'google'
        sessionStorage.removeItem('neufin_auth_method')
        capture('user_logged_in', { method })
        window.location.href = next
        return
      }
      window.location.href = `/auth?error=oauth_failed`
    })()
    return () => { cancelled = true }
  }, [next, searchParams, capture])

  return <Spinner />
}
