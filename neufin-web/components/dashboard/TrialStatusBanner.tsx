'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { apiGet } from '@/lib/api-client'

type SubscriptionStatus = {
  plan?: 'free' | 'retail' | 'advisor' | 'enterprise'
  subscription_tier?: string
  status?: 'trial' | 'active' | 'expired'
  trial_days_remaining?: number
  days_remaining?: number
  trial_ends_at?: string
}

const CACHE_KEY = 'neufin:subscription-status:cache'
const CACHE_TTL_MS = 5 * 60 * 1000

function readCached(): SubscriptionStatus | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; data: SubscriptionStatus }
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCached(data: SubscriptionStatus): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // ignore localStorage failures
  }
}

export function TrialStatusBanner() {
  const pathname = usePathname()
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    const cached = readCached()
    if (cached) setSubscription(cached)
    void (async () => {
      try {
        const fresh = await apiGet<SubscriptionStatus>('/api/subscription/status')
        if (cancelled) return
        setSubscription(fresh ?? null)
        if (fresh) writeCached(fresh)
      } catch {
        // keep cached value if available
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const banner = useMemo(() => {
    if (!subscription) return null
    const plan = (subscription.plan ?? subscription.subscription_tier ?? 'free').toString().toLowerCase()
    if (plan === 'advisor' || plan === 'enterprise') return null

    const daysRemaining = subscription.trial_days_remaining ?? subscription.days_remaining ?? null
    const status = subscription.status ?? (daysRemaining !== null && daysRemaining <= 0 ? 'expired' : 'trial')

    if (status === 'expired' || (daysRemaining !== null && daysRemaining <= 0)) {
      return {
        className: 'border-red-500/30 bg-red-500/10 text-red-100',
        text: 'Trial ended · Your data is saved · Upgrade to run new analysis →',
      }
    }

    if (daysRemaining !== null && daysRemaining < 3) {
      return {
        className: 'border-amber-500/35 bg-amber-500/12 text-amber-100',
        text: `14-day free trial · ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining · Upgrade before trial ends →`,
      }
    }

    const remainingText = daysRemaining !== null ? `${daysRemaining} days remaining` : 'active'
    return {
      className: 'border-cyan-500/25 bg-emerald-500/10 text-emerald-100',
      text: `14-day free trial · ${remainingText} · All features included`,
    }
  }, [subscription])

  if (pathname === '/dashboard/billing' || !banner) return null

  return (
    <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${banner.className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{banner.text}</p>
        <Link
          href="/dashboard/billing"
          className="shrink-0 rounded-md border border-current/30 px-3 py-1 text-xs font-medium hover:bg-white/10"
        >
          Upgrade
        </Link>
      </div>
    </div>
  )
}
