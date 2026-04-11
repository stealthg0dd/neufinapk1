'use client'

/**
 * Redirects to /onboarding when subscription status reports onboarding_completed === false.
 */

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { apiGet } from '@/lib/api-client'

interface SubscriptionPayload {
  onboarding_completed?: boolean
}

export function OnboardingGate() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname?.startsWith('/onboarding')) return

    apiGet<SubscriptionPayload>('/api/subscription/status')
      .then((data) => {
        if (data && data.onboarding_completed === false) {
          router.push('/onboarding')
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
