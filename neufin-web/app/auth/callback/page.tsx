'use client'

export const dynamic = 'force-dynamic'

/**
 * OAuth / Magic-Link callback handler.
 *
 * Supabase redirects here after:
 *   - Google OAuth sign-in  (PKCE: ?code=... in the URL)
 *   - Magic link click from email  (hash fragment: #access_token=...)
 *
 * The Supabase JS client v2 auto-exchanges the PKCE code or hash fragment
 * when it initialises on this page (detectSessionInUrl: true, the default).
 * We wait for the resulting SIGNED_IN event via onAuthStateChange rather
 * than calling getSession() immediately, which would race the code exchange.
 *
 * Fallback: if no SIGNED_IN fires within 10 s (e.g. the token was already
 * consumed), we check getSession() once and redirect regardless so the user
 * is never stuck on the spinner screen.
 */

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { claimAnonymousRecord } from '@/lib/api'

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

  useEffect(() => {
    let done = false

    /** Claim any anonymous DNA record then navigate to `next`. */
    async function finishAndRedirect(accessToken: string | undefined) {
      if (done) return
      done = true

      if (accessToken) {
        const raw = localStorage.getItem('dnaResult')
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed?.record_id && !parsed?.user_id_claimed) {
              await claimAnonymousRecord(parsed.record_id, accessToken)
              localStorage.setItem(
                'dnaResult',
                JSON.stringify({ ...parsed, user_id_claimed: true }),
              )
            }
          } catch {
            // non-fatal — proceed to redirect
          }
        }
      }

      router.replace(next)
    }

    // ── Primary path: listen for the SIGNED_IN event ───────────────────────
    // The Supabase client fires this after it has successfully exchanged the
    // PKCE code (or processed the hash-fragment token).  This is the reliable
    // moment to read the session and proceed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          subscription.unsubscribe()
          clearTimeout(fallbackTimer)
          await finishAndRedirect(session.access_token)
        }
      },
    )

    // ── Fast path: session already established (e.g. page refresh) ─────────
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        subscription.unsubscribe()
        clearTimeout(fallbackTimer)
        await finishAndRedirect(data.session.access_token)
      }
    })

    // ── Fallback: redirect after 10 s even if no session was established ───
    // Prevents the user from being stuck on the spinner if the OAuth state is
    // stale or the code was already consumed by a previous render.
    const fallbackTimer = setTimeout(async () => {
      subscription.unsubscribe()
      const { data } = await supabase.auth.getSession()
      await finishAndRedirect(data.session?.access_token)
    }, 10_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(fallbackTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <Spinner />
}

