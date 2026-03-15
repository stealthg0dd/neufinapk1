/**
 * useUser — Universal user state hook.
 *
 * Abstracts both guests (localStorage) and authenticated users (Supabase session)
 * into a single interface so components never need to branch on auth state.
 *
 * const { score, isPro, isGuest, user, token } = useUser()
 */

'use client'

import { useEffect, useState } from 'react'
import { useAuth } from './auth-context'
import { getSubscription, type SubscriptionInfo } from './api'

export interface UserState {
  /** Latest DNA score — from session DB or localStorage, whichever is available */
  score: number | null
  /** Investor type string */
  investorType: string | null
  /** Share token for the latest result */
  shareToken: string | null
  /** True when the user has a Pro subscription */
  isPro: boolean
  /** True when there's no authenticated session */
  isGuest: boolean
  /** Subscription tier string */
  subscriptionTier: 'free' | 'pro'
  /** Advisor/firm name if set */
  advisorName: string | null
  /** Raw auth state passthrough */
  user: ReturnType<typeof useAuth>['user']
  token: ReturnType<typeof useAuth>['token']
  loading: boolean
}

export function useUser(): UserState {
  const { user, token, loading: authLoading } = useAuth()

  const [score,            setScore]            = useState<number | null>(null)
  const [investorType,     setInvestorType]     = useState<string | null>(null)
  const [shareToken,       setShareToken]       = useState<string | null>(null)
  const [subscription,     setSubscription]     = useState<SubscriptionInfo | null>(null)
  const [subLoading,       setSubLoading]       = useState(false)

  // ── 1. Read latest score from localStorage (available for guests too) ────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem('dnaResult')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed.dna_score === 'number') {
        setScore(parsed.dna_score)
        setInvestorType(parsed.investor_type ?? null)
        setShareToken(parsed.share_token ?? null)
      }
    } catch {}
  }, [])

  // ── 2. Fetch subscription info when authenticated ────────────────────────────
  useEffect(() => {
    if (!token) { setSubscription(null); return }
    setSubLoading(true)
    getSubscription(token)
      .then(setSubscription)
      .catch(() => setSubscription(null))
      .finally(() => setSubLoading(false))
  }, [token])

  const isPro   = subscription?.is_pro ?? false
  const isGuest = !user

  return {
    score,
    investorType,
    shareToken,
    isPro,
    isGuest,
    subscriptionTier: subscription?.subscription_tier ?? 'free',
    advisorName:      subscription?.advisor_name ?? null,
    user,
    token,
    loading: authLoading || subLoading,
  }
}
