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

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // ── 0. Check for provider-level error in URL params ────────────────────
    // Supabase appends ?error=access_denied&error_description=... when the
    // user cancels the OAuth consent screen or the provider rejects the grant.
    const urlError       = searchParams.get('error')
    const urlErrorDesc   = searchParams.get('error_description')
    if (urlError) {
      logger.error({ tag: TAG, urlError, urlErrorDesc }, 'auth.callback_provider_error')
      setError(urlErrorDesc ?? urlError)
      return
    }

    let done = false

    /** Claim any anonymous DNA record then navigate to `next`. */
    async function finishAndRedirect(accessToken: string | undefined, expiresIn?: number | null) {
      if (done) return
      done = true
      logger.info({ tag: TAG, hasToken: Boolean(accessToken), next, expiresIn }, 'auth.callback_finish_redirect')
      debugAuth('auth/callback:finishAndRedirect:start')

      // ── Sync token to cookie BEFORE navigating so middleware can read it ──
      // window.location.href causes a full page reload; the cookie must be set
      // in the browser's cookie jar first so the very next HTTP request carries it.
      syncAuthCookie(accessToken ? { access_token: accessToken } : null)

      if (accessToken) {
        const raw = localStorage.getItem('dnaResult')
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed?.record_id && !parsed?.user_id_claimed) {
              logger.info({ tag: TAG, recordId: parsed.record_id }, 'auth.callback_claim_start')
              await claimAnonymousRecord(parsed.record_id, accessToken)
              localStorage.setItem(
                'dnaResult',
                JSON.stringify({ ...parsed, user_id_claimed: true }),
              )
              logger.info({ tag: TAG, recordId: parsed.record_id }, 'auth.callback_claim_complete')
            }
          } catch (claimErr) {
            logger.warn({ tag: TAG, error: claimErr }, 'auth.callback_claim_failed')
          }
        }
      }

      // ── User routing ───────────────────────────────────────────────────────
      try {
        const { data: { user } } = await supabase.auth.getUser()
        logger.debug({ tag: TAG, userId: user?.id ?? null, userType: user?.user_metadata?.user_type ?? null }, 'auth.callback_user_loaded')

        if (user && !user.user_metadata?.onboarding_complete) {
          // New user: run onboarding flow first, then send to original destination.
          logger.info({ tag: TAG, next }, 'auth.callback_redirect_onboarding')
          localStorage.setItem('onboarding_next', next)
          const userTypeHint = searchParams.get('user_type')
          const qs = userTypeHint ? `?user_type=${userTypeHint}` : ''
          logger.info({ tag: TAG, target: `/onboarding${qs}` }, 'auth.callback_redirect')
          debugAuth('auth/callback:before-onboarding-redirect')
          // Full page reload so middleware cookie check passes immediately.
          window.location.href = `/onboarding${qs}`
          return
        }

        // Returning advisor: send to advisor dashboard unless a specific next is set.
        if (
          user?.user_metadata?.user_type === 'advisor' &&
          (next === '/dashboard' || next === '/vault')
        ) {
          logger.info({ tag: TAG }, 'auth.callback_redirect_advisor_dashboard')
          debugAuth('auth/callback:before-advisor-redirect')
          window.location.href = '/advisor/dashboard'
          return
        }
      } catch (checkErr) {
        logger.warn({ tag: TAG, error: checkErr }, 'auth.callback_routing_check_failed')
      }

      logger.info({ tag: TAG, target: next }, 'auth.callback_redirect_final')
      debugAuth('auth/callback:before-final-redirect')
      // Full page reload ensures the neufin-auth cookie is sent with the next
      // HTTP request so the Edge middleware validates the session correctly.
      window.location.href = next
    }

    // ── 1. Primary path: onAuthStateChange ────────────────────────────────
    // Supabase fires SIGNED_IN once the PKCE code has been successfully
    // exchanged for a session.  This is the canonical moment to proceed.
    logger.debug({ tag: TAG }, 'auth.callback_listener_register')
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug({ tag: TAG, event, hasSession: Boolean(session) }, 'auth.callback_state_change')

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          logger.info({ tag: TAG, event }, 'auth.callback_ready')
          subscription.unsubscribe()
          await finishAndRedirect(session.access_token, session.expires_in)
          return
        }

        // INITIAL_SESSION fires when the client finishes its startup check.
        // If it arrives with no session AND no SIGNED_IN has fired, the code
        // exchange either failed or was already consumed — show error state.
        if (event === 'INITIAL_SESSION' && !session && !done) {
          logger.warn({ tag: TAG }, 'auth.callback_initial_session_missing')
          subscription.unsubscribe()
          setError('Sign-in could not be completed. The link may have already been used or expired.')
        }
      },
    )

    // ── 2. Fast path: session already established (e.g. page refresh) ─────
    logger.debug({ tag: TAG }, 'auth.callback_fast_path_check')
    supabase.auth.getSession().then(async ({ data, error: sessionErr }) => {
      if (sessionErr) {
        logger.error({ tag: TAG, message: sessionErr.message }, 'auth.callback_session_error')
      }
      if (data.session) {
        logger.info({ tag: TAG }, 'auth.callback_fast_path_ready')
        subscription.unsubscribe()
        await finishAndRedirect(data.session.access_token, data.session.expires_in)
      } else {
        logger.debug({ tag: TAG }, 'auth.callback_fast_path_waiting')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

