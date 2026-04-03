'use client'

/**
 * PostHog provider for NeuFin Web.
 *
 * Wraps the app in PostHogProvider from posthog-js/react and initialises
 * the PostHog client once on the client side.
 *
 * Re-exports PostHogProvider so the root layout only needs one import:
 *   import { PostHogProvider } from '@/lib/posthog'
 *
 * Also exports useAnalytics for components that need event tracking:
 *   const { track } = useAnalytics()
 */

import posthog from 'posthog-js'
import { PostHogProvider as _PostHogProvider, usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'

const POSTHOG_KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY  ?? ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return
    if (posthog.__loaded) return
    posthog.init(POSTHOG_KEY, {
      api_host:          POSTHOG_HOST,
      capture_pageview:  false, // handled manually in analytics.ts
      capture_pageleave: true,
      autocapture:       false,
      persistence:       'localStorage',
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') ph.debug()
      },
    })
  }, [])

  return _PostHogProvider({ client: posthog, children })
}

/** Thin hook — returns `track` as an alias for PostHog `capture`. */
export function useAnalytics() {
  const ph = usePostHog()
  return {
    track: (event: string, properties?: Record<string, unknown>) => {
      ph?.capture(event, properties)
    },
  }
}
