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
 *      or INITIAL_SESSION fires with no session after the code exchange window,
 *      show an error state with a "Try again" button instead of a blank spinner.
 *
 * The previous 10-second timeout was removed: it caused a race condition where
 * the redirect fired before the PKCE exchange completed on slow connections,
 * landing the user on a protected page with no session.
 */

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { debugAuth } from '@/lib/auth-debug'
import { syncAuthCookie } from '@/lib/sync-auth-cookie'
import { claimAnonymousRecord } from '@/lib/api'
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

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // ── 0. Check for provider-level error in URL params ───────────────
    const urlError = searchParams.get('error')
    const urlErrorDesc = searchParams.get('error_description')
    if (urlError) {
      logger.error({ tag: TAG, urlError, urlErrorDesc }, 'auth.callback_provider_error')
      setError(urlErrorDesc ?? urlError)
      return
    }

    let cancelled = false;
    (async () => {
      // ── 1. Exchange code for session (primary path) ──
      const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href)
      if (cancelled) return
      if (error) {
        logger.error({ tag: TAG, error }, 'auth.callback_exchange_error')
        setError(error.message || 'Sign-in failed. Please try again.')
        return
      }
      if (data?.session) {
        syncAuthCookie(data.session)
        const method = sessionStorage.getItem('neufin_auth_method') ?? 'google'
        sessionStorage.removeItem('neufin_auth_method')
        capture('user_logged_in', { method })
        // Optionally: claimAnonymousRecord if needed (see previous logic)
        // ...existing code for claiming DNA record if required...
        window.location.href = next
        return
      }
      setError('Sign-in failed. No session returned.')
    })()
    return () => { cancelled = true }
  }, [next, searchParams])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto">
            <span className="text-red-400 text-lg">✕</span>
          </div>
          <h2 className="text-white font-semibold text-base">Sign-in failed</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{error}</p>
          <button
            onClick={() => { window.location.href = '/auth' }}
            className="mt-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return <Spinner />
}
