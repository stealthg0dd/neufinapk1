'use client'

/**
 * First-party analytics — no third-party trackers.
 * Events are posted to /api/analytics/track on the backend
 * and stored in the analytics_events Supabase table.
 *
 * Usage:
 *   const { track } = useAnalytics()
 *   track('pdf_downloaded', { report_id: '...' })
 *
 * Or standalone:
 *   trackEvent('upload_started')
 */

import { useCallback, useEffect, useRef } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || ''

// ── Session ID — stable per browser tab ───────────────────────────────────────

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'neufin_session_id'
  let sid = sessionStorage.getItem(key)
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem(key, sid)
  }
  return sid
}

// ── Core fire-and-forget send ─────────────────────────────────────────────────

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return
  // Use sendBeacon when available (survives page unload)
  const payload = JSON.stringify({
    event,
    properties: properties ?? {},
    session_id: getSessionId(),
  })
  const url = `${API}/api/analytics/track`
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
  } else {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
      .catch(() => {})
  }
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useAnalytics() {
  const track = useCallback(
    (event: string, properties?: Record<string, unknown>) => trackEvent(event, properties),
    []
  )
  return { track }
}

// ── Page-view tracker component ───────────────────────────────────────────────

/**
 * Drop <PageView page="results" /> anywhere to auto-track page views.
 * Uses a ref to prevent double-firing in React StrictMode.
 */
export function PageView({ page, properties }: { page: string; properties?: Record<string, unknown> }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackEvent('page_view', { page, ...properties })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

// ── Conversion funnel events (typed constants) ────────────────────────────────

export const EVENTS = {
  UPLOAD_STARTED:       'upload_started',
  UPLOAD_COMPLETE:      'upload_complete',
  CHECKOUT_CLICKED:     'checkout_clicked',
  PAYMENT_SUCCEEDED:    'payment_succeeded',
  PDF_DOWNLOADED:       'pdf_downloaded',
  SHARE_CLICKED:        'share_clicked',
  REFERRAL_LINK_COPIED: 'referral_link_copied',
  ADVISOR_CTA_CLICKED:  'advisor_cta_clicked',
  LEADERBOARD_VIEWED:   'leaderboard_viewed',
  MARKET_PAGE_VIEWED:   'market_page_viewed',
} as const

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS]
