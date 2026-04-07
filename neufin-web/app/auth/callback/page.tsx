'use client'

export const dynamic = 'force-dynamic'

/**
 * OAuth / Magic-Link callback handler.
 *
 * With detectSessionInUrl:true, the Supabase client auto-exchanges the
 * PKCE ?code= or parses the implicit #access_token= on page load.
 * We just wait for the SIGNED_IN event and redirect to the next page.
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
    // Check for provider-level error in URL params
    const urlError = searchParams.get('error')
    const urlErrorDesc = searchParams.get('error_description')
    if (urlError) {
      logger.error({ tag: TAG, urlError, urlErrorDesc }, 'auth.callback_provider_error')
      window.location.href = `/login?error=${encodeURIComponent(urlErrorDesc ?? urlError)}`
      return
    }

    let cancelled = false

    const finish = (session: { access_token: string; refresh_token: string }) => {
      if (cancelled) return
      syncAuthCookie(session as Parameters<typeof syncAuthCookie>[0])
      const method = sessionStorage.getItem('neufin_auth_method') ?? 'google'
      sessionStorage.removeItem('neufin_auth_method')
      capture('user_logged_in', { method })
      window.location.href = next
    }

    // Fast path: session may already be set by detectSessionInUrl auto-exchange
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data?.session) {
        finish(data.session)
        return
      }

      // Primary path: wait for auto-exchange to fire SIGNED_IN event
      // (detectSessionInUrl:true handles the ?code= or #access_token= exchange)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          subscription.unsubscribe()
          finish(session)
        }
        if (event === 'SIGNED_OUT') {
          subscription.unsubscribe()
          logger.error({ tag: TAG }, 'auth.callback_signed_out')
          window.location.href = '/login?error=oauth_failed'
        }
      })

      // Timeout fallback: if no event fires in 10s, redirect to login
      const timeout = setTimeout(() => {
        if (cancelled) return
        subscription.unsubscribe()
        logger.error({ tag: TAG }, 'auth.callback_timeout')
        window.location.href = '/login?error=timeout'
      }, 10_000)

      return () => {
        clearTimeout(timeout)
        subscription.unsubscribe()
      }
    })

    return () => { cancelled = true }
  }, [next, searchParams, capture])

  return <Spinner />
}
