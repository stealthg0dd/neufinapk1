'use client'

/**
 * NeuFin analytics — thin wrapper around PostHog that auto-enriches
 * every event with session_id, environment, and (when authenticated) user_id.
 *
 * Usage:
 *   const { capture } = useNeufinAnalytics()
 *   capture('csv_upload_started', {})
 *
 * Performance timing:
 *   perfTimer.start('dna_score')
 *   const ms = perfTimer.end('dna_score')   // null if never started
 *   captureSentrySlowOp('dna_score', ms)    // sends to Sentry if > 30 s
 */

import { usePostHog } from 'posthog-js/react'
import { useAuth } from '@/lib/auth-context'
import * as Sentry from '@sentry/nextjs'

const ENV =
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  process.env.NODE_ENV ??
  'development'

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  const key = '__neufin_sid'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

// ── Performance timing ────────────────────────────────────────────────────────

const _timers = new Map<string, number>()

export const perfTimer = {
  start(key: string): void {
    if (typeof window !== 'undefined') _timers.set(key, performance.now())
  },
  end(key: string): number | null {
    const t = _timers.get(key)
    if (t == null) return null
    const ms = Math.round(performance.now() - t)
    _timers.delete(key)
    return ms
  },
}

/** Sends a Sentry warning when an operation exceeds 30 seconds. */
export function captureSentrySlowOp(operationName: string, durationMs: number | null): void {
  if (durationMs != null && durationMs > 30_000) {
    Sentry.captureMessage(`Slow operation: ${operationName} took ${durationMs}ms`, {
      level: 'warning',
      extra: { duration_ms: durationMs, operation: operationName },
    })
  }
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useNeufinAnalytics() {
  const ph = usePostHog()
  const { user } = useAuth()
  const userId = user?.id ?? null

  function capture(event: string, props: Record<string, unknown> = {}): void {
    ph?.capture(event, {
      session_id: getSessionId(),
      environment: ENV,
      ...(userId ? { user_id: userId } : {}),
      ...props,
    })
  }

  return { capture }
}
