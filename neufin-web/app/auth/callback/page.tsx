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
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { claimAnonymousRecord } from '@/lib/api'

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
  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') || '/vault'

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // ── 0. Check for provider-level error in URL params ────────────────────
    // Supabase appends ?error=access_denied&error_description=... when the
    // user cancels the OAuth consent screen or the provider rejects the grant.
    const urlError       = searchParams.get('error')
    const urlErrorDesc   = searchParams.get('error_description')
    if (urlError) {
      console.error(`${TAG} Provider error in URL: ${urlError} — ${urlErrorDesc}`)
      setError(urlErrorDesc ?? urlError)
      return
    }

    let done = false

    /** Claim any anonymous DNA record then navigate to `next`. */
    async function finishAndRedirect(accessToken: string | undefined) {
      if (done) return
      done = true
      console.log(`${TAG} finishAndRedirect — token present: ${Boolean(accessToken)}, next: ${next}`)

      if (accessToken) {
        const raw = localStorage.getItem('dnaResult')
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed?.record_id && !parsed?.user_id_claimed) {
              console.log(`${TAG} Claiming anonymous record: ${parsed.record_id}`)
              await claimAnonymousRecord(parsed.record_id, accessToken)
              localStorage.setItem(
                'dnaResult',
                JSON.stringify({ ...parsed, user_id_claimed: true }),
              )
              console.log(`${TAG} Anonymous record claimed ✓`)
            }
          } catch (claimErr) {
            // Non-fatal — log and proceed to redirect
            console.warn(`${TAG} claimAnonymousRecord failed (non-fatal):`, claimErr)
          }
        }
      }

      console.log(`${TAG} Redirecting to: ${next}`)
      router.replace(next)
    }

    // ── 1. Primary path: onAuthStateChange ────────────────────────────────
    // Supabase fires SIGNED_IN once the PKCE code has been successfully
    // exchanged for a session.  This is the canonical moment to proceed.
    console.log(`${TAG} Registering onAuthStateChange listener`)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`${TAG} onAuthStateChange: event=${event} session=${Boolean(session)}`)

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          console.log(`${TAG} ${event} — proceeding to redirect`)
          subscription.unsubscribe()
          await finishAndRedirect(session.access_token)
          return
        }

        // INITIAL_SESSION fires when the client finishes its startup check.
        // If it arrives with no session AND no SIGNED_IN has fired, the code
        // exchange either failed or was already consumed — show error state.
        if (event === 'INITIAL_SESSION' && !session && !done) {
          console.warn(`${TAG} INITIAL_SESSION with no session — code exchange may have failed`)
          subscription.unsubscribe()
          setError('Sign-in could not be completed. The link may have already been used or expired.')
        }
      },
    )

    // ── 2. Fast path: session already established (e.g. page refresh) ─────
    console.log(`${TAG} Checking existing session (fast path)`)
    supabase.auth.getSession().then(async ({ data, error: sessionErr }) => {
      if (sessionErr) {
        console.error(`${TAG} getSession error:`, sessionErr.message)
      }
      if (data.session) {
        console.log(`${TAG} Fast path — existing session found, redirecting`)
        subscription.unsubscribe()
        await finishAndRedirect(data.session.access_token)
      } else {
        console.log(`${TAG} Fast path — no session yet, waiting for SIGNED_IN event`)
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
            onClick={() => router.replace('/auth')}
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

