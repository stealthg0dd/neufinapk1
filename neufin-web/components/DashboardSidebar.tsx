'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  PieChart,
  Briefcase,
  BookOpen,
  FileText,
  Bell,
  BarChart2,
  Code2,
  CreditCard,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { apiGet } from '@/lib/api-client'
import type { User } from '@supabase/supabase-js'

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard }

const WORKSPACE_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/portfolio', label: 'Portfolio', icon: PieChart },
  { href: '/dashboard/deals', label: 'Deals', icon: Briefcase },
  { href: '/dashboard/research', label: 'Research', icon: BookOpen },
]

const INTELLIGENCE_NAV: NavItem[] = [
  { href: '/dashboard/reports', label: 'IC Memos', icon: FileText },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
]

const PLATFORM_NAV: NavItem[] = [
  { href: '/developer', label: 'Developer', icon: Code2 },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function isAdminUser(user: User | null): boolean {
  if (!user) return false
  const am = user.app_metadata as Record<string, unknown> | undefined
  const um = user.user_metadata as Record<string, unknown> | undefined
  return Boolean(am?.is_admin ?? am?.admin ?? um?.is_admin)
}

export default function DashboardSidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()

  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('Primary workspace')
  const [plan, setPlan] = useState<'free' | 'retail' | 'advisor' | 'enterprise'>('free')

  const initials = useMemo(() => {
    const email = user?.email || 'NF'
    return email.slice(0, 2).toUpperCase()
  }, [user?.email])

  const showAdmin = isAdminUser(user)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiGet<{ plan?: 'free' | 'retail' | 'advisor' | 'enterprise' }>(
          '/api/subscription/status',
        )
        if (!cancelled && res.plan) setPlan(res.plan)
      } catch {
        if (!cancelled) setPlan('free')
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
        <div className="flex w-7 h-7 shrink-0 items-center justify-center rounded bg-[hsl(var(--primary)/0.2)] font-mono text-sm font-bold text-[hsl(var(--primary))]">
          N
        </div>
        <span className="ml-3 font-mono text-sm font-bold tracking-widest text-[hsl(var(--primary))]">
          NEUFIN
        </span>
      </div>

      <div className="border-b border-[hsl(var(--border)/0.3)] px-3 py-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setWorkspaceOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded bg-[hsl(var(--surface)/0.5)] px-2 py-1.5 text-left text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"
          >
            <span className="min-w-0 flex-1 truncate">{workspaceName}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </button>
          {workspaceOpen ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface))] py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-xs hover:bg-surface-2"
                onClick={() => {
                  setWorkspaceName('Primary workspace')
                  setWorkspaceOpen(false)
                }}
              >
                Primary workspace
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto py-3">
        <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.5)]">
          Workspace
        </p>
        {WORKSPACE_NAV.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <item.icon className="h-[15px] w-[15px] shrink-0" />
            {item.label}
          </Link>
        ))}

        <p className="mt-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.5)]">
          Intelligence
        </p>
        {INTELLIGENCE_NAV.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <item.icon className="h-[15px] w-[15px] shrink-0" />
            {item.label}
          </Link>
        ))}

        <p className="mt-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.5)]">
          Platform
        </p>
        {PLATFORM_NAV.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <item.icon className="h-[15px] w-[15px] shrink-0" />
            {item.label}
          </Link>
        ))}
        {showAdmin ? (
          <Link href="/dashboard/admin" className={linkClass('/dashboard/admin')}>
            <Shield className="h-[15px] w-[15px] shrink-0" />
            Admin
          </Link>
        ) : null}
      </nav>

      <div className="border-t border-[hsl(var(--border)/0.3)] px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.2)] font-mono text-xs font-bold text-[hsl(var(--primary))]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{user?.email ?? '—'}</p>
            {(plan === 'advisor' || plan === 'enterprise') && (
              <span className="mt-1 inline-block rounded-full bg-warning/10 px-2 py-0.5 font-mono text-[10px] text-warning">
                ADVISOR
              </span>
            )}
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
