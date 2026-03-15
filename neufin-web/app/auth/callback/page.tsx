'use client'

export const dynamic = 'force-dynamic'

/**
 * OAuth / Magic-Link callback handler.
 *
 * Supabase redirects here after:
 *   - Google OAuth sign-in
 *   - Magic link click from email
 *
 * The hash fragment (#access_token=...) is exchanged for a session,
 * then the user is forwarded to `?next=` (defaults to /vault).
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
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      if (token) {
        // Claim any anonymous record from localStorage
        const raw = localStorage.getItem('dnaResult')
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed?.record_id && !parsed?.user_id_claimed) {
              await claimAnonymousRecord(parsed.record_id, token)
              localStorage.setItem('dnaResult', JSON.stringify({ ...parsed, user_id_claimed: true }))
            }
          } catch {}
        }
      }
      router.replace(next)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <Spinner />
}
