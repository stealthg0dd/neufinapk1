'use client'

/**
 * OnboardingGate
 * --------------
 * Invisible client component placed in the dashboard layout.
 * After authentication is confirmed it checks whether the user
 * has completed onboarding.  If onboarding_completed === false
 * the user is redirected to /onboarding.
 *
 * Existing users (onboarding_completed = null due to backfill migration)
 * are NOT redirected — the migration sets them to true.
 */

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { apiGet } from '@/lib/api-client'

interface WLResponse {
  onboarding_completed: boolean
}

export function OnboardingGate() {
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Don't re-check if already on /onboarding
    if (pathname?.startsWith('/onboarding')) return

    apiGet<WLResponse>('/api/profile/white-label')
      .then((data) => {
        if (data.onboarding_completed === false) {
          router.push('/onboarding')
        }
      })
      .catch(() => {
        // Network error or unauthenticated — let client-side auth handle it
      })
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
