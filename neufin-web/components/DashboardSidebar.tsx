'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  PieChart,
  BookOpen,
  FileText,
  CreditCard,
  Bot,
  LogOut,
  Code2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { apiGet } from '@/lib/api-client'
import type { User } from '@supabase/supabase-js'

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/portfolio', label: 'Portfolio', icon: PieChart },
  { href: '/swarm', label: 'Swarm IC', icon: Bot },
  { href: '/dashboard/research', label: 'Research', icon: BookOpen },
  { href: '/dashboard/reports', label: 'Reports', icon: FileText },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
]

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

type SubscriptionStatus = {
  plan?: 'free' | 'retail' | 'advisor' | 'enterprise'
  subscription_tier?: string
  status?: 'trial' | 'active' | 'expired'
  trial_days_remaining?: number
  days_remaining?: number
  trial_ends_at?: string
}

export default function DashboardSidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()
  const [subscription, setSubscription] = useState<SubscriptionStatus>({})

  const initials = useMemo(() => {
    const email = user?.email || 'NF'
    return email.slice(0, 2).toUpperCase()
  }, [user?.email])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiGet<SubscriptionStatus>(
          '/api/subscription/status',
        )
        if (!cancelled) setSubscription(res ?? {})
      } catch {
        if (!cancelled) setSubscription({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const plan = (subscription.plan ?? subscription.subscription_tier ?? 'free').toString().toLowerCase()
  const daysRemaining = subscription.trial_days_remaining ?? subscription.days_remaining ?? null
  const trialEndsAt = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null
  const isActivePaid = plan === 'advisor' || plan === 'enterprise'
  const isExpired = !isActivePaid && daysRemaining !== null && daysRemaining <= 0

  const planBadgeText = (() => {
    if (isActivePaid) {
      const dayText = daysRemaining !== null ? `${daysRemaining} days remaining` : 'active'
      return `Advisor · ${dayText}`
    }
    if (isExpired) return 'Free · Trial expired'
    if (trialEndsAt && !Number.isNaN(trialEndsAt.getTime())) {
      const pretty = trialEndsAt.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })
      return `Free · Trial ends ${pretty}`
    }
    if (daysRemaining !== null) return `Free · ${daysRemaining} days remaining`
    return 'Free plan'
  })()

  const planBadgeClass = (() => {
    if (isExpired) return 'bg-gray-500/15 text-gray-300 border-gray-500/30'
    if (isActivePaid) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
    if (daysRemaining !== null && daysRemaining < 3) return 'bg-amber-500/15 text-amber-300 border-amber-500/35'
    return 'bg-gray-500/15 text-gray-300 border-gray-500/30'
  })()

  const linkClass = (href: string) => {
    const active = isActivePath(pathname, href)
    return [
      'relative flex items-center gap-2.5 rounded-md px-3 py-1.5 mx-2 text-sm transition-colors cursor-pointer',
      active
        ? 'text-[hsl(var(--foreground))] bg-surface-2 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[hsl(var(--primary))]'
        : 'text-[hsl(var(--muted-foreground))] hover:bg-surface-2 hover:text-[hsl(var(--foreground))]',
    ].join(' ')
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[hsl(var(--border)/0.5)] bg-sidebar">
      <div className="flex h-12 items-center border-b border-[hsl(var(--border)/0.3)] px-4">
        <div className="flex items-center gap-2">
          <Image src="/logo-icon.png" alt="NeuFin" width={28} height={28} className="rounded-sm" />
          <Image src="/logo.png" alt="NeuFin" width={80} height={24} className="h-6 w-auto" />
        </div>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto py-3">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <item.icon className="h-[15px] w-[15px] shrink-0" />
            {item.label}
          </Link>
        ))}
        {isActivePaid && (
          <>
            <div className="mx-3 my-3 border-t border-[hsl(var(--border)/0.35)]" />
            <Link href="/developer" className={linkClass('/developer')}>
              <Code2 className="h-[15px] w-[15px] shrink-0" />
              <span className="flex items-center gap-2">
                Developer
                <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-blue-300">
                  beta
                </span>
              </span>
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-[hsl(var(--border)/0.3)] px-3 py-3">
        <div className={`mb-3 rounded-md border px-2.5 py-2 text-[11px] ${planBadgeClass}`}>
          {planBadgeText}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.2)] font-mono text-xs font-bold text-[hsl(var(--primary))]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{user?.email ?? '—'}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="shrink-0 rounded p-1.5 text-[hsl(var(--muted-foreground))] hover:text-risk"
            aria-label="Sign out"
          >
            <LogOut className="h-[14px] w-[14px]" />
          </button>
        </div>
      </div>
    </aside>
  )
}
