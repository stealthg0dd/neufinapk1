/**
 * NeuFin Mobile — PostHog analytics wrapper.
 *
 * Exposes a singleton `posthog` client and a `trackMobileEvent()` helper
 * that auto-enriches every event with `environment`.
 *
 * Usage:
 *   import { trackMobileEvent } from '@/lib/analytics'
 *   trackMobileEvent('screen_viewed', { screen_name: 'PortfolioSync' })
 *
 * Or use the React hook:
 *   import { usePostHog } from 'posthog-react-native'
 *   const ph = usePostHog()
 *   ph.capture('event', props)
 */

import PostHog from 'posthog-react-native'

const POSTHOG_KEY  = process.env.EXPO_PUBLIC_POSTHOG_KEY  ?? ''
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const ENV          = process.env.EXPO_PUBLIC_ENVIRONMENT  ?? 'production'

export const posthog = new PostHog(POSTHOG_KEY, {
  host: POSTHOG_HOST,
  // Flush immediately in development; batch in production
  flushAt: ENV === 'production' ? 20 : 1,
  flushInterval: ENV === 'production' ? 10_000 : 500,
})

function baseProps(): Record<string, unknown> {
  return { environment: ENV }
}

/** Fire a PostHog event with automatic base-property enrichment. */
export function trackMobileEvent(
  event: string,
  props: Record<string, unknown> = {},
): void {
  posthog.capture(event, { ...baseProps(), ...props } as Parameters<typeof posthog.capture>[1])
}
