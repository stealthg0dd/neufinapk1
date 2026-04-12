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

type BannerState =
  | null
  | { kind: 'expired'; message: string }
  | { kind: 'active'; days: number }

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

  const banner: BannerState = useMemo(() => {
    if (!subscription) return null
    const plan = (subscription.plan ?? subscription.subscription_tier ?? 'free').toString().toLowerCase()
    if (plan === 'advisor' || plan === 'enterprise') return null

    const daysRemaining = subscription.trial_days_remaining ?? subscription.days_remaining ?? null
    const status = subscription.status ?? (daysRemaining !== null && daysRemaining <= 0 ? 'expired' : 'trial')

    if (status === 'expired' || (daysRemaining !== null && daysRemaining <= 0)) {
      return {
        kind: 'expired' as const,
        message: 'Trial ended — your data is saved.',
      }
    }

    return {
      kind: 'active' as const,
      days: daysRemaining ?? 14,
    }
  }, [subscription])

  if (pathname === '/dashboard/billing' || !banner) return null

  if (banner.kind === 'expired') {
    return (
      <div className="mb-4 flex h-10 max-h-10 items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 text-[12px] text-red-800">
        <p className="truncate font-medium">{banner.message}</p>
        <Link href="/dashboard/billing" className="shrink-0 font-semibold text-red-900 underline underline-offset-2 hover:text-red-950">
          Upgrade
        </Link>
      </div>
    )
  }

  return (
    <div className="mb-4 flex h-10 max-h-10 items-center justify-between gap-3 border-b border-[#BFDBFE] bg-[#EFF6FF] px-4 text-[12px] text-[#1D4ED8]">
      <p className="min-w-0 truncate">
        <span className="font-medium">Trial active</span>
        <span className="text-[#1D4ED8]/90"> — {banner.days} days remaining · </span>
        <Link href="/dashboard/billing" className="font-semibold underline underline-offset-2 hover:text-blue-900">
          Upgrade
        </Link>
      </p>
    </div>
  )
}
