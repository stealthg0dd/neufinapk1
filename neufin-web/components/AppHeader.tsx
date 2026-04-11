'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getSubscriptionStatus } from '@/lib/api'

// ── TrialBadge ─────────────────────────────────────────────────────────────────
function TrialBadge({ status, daysRemaining }: { status: 'trial' | 'active' | 'expired'; daysRemaining?: number }) {
  if (status === 'active') return null
  if (status === 'expired') {
    return (
      <Link href="/upgrade" className="px-2 py-0.5 text-xs font-semibold rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
        Expired
      </Link>
    )
  }
  if (daysRemaining !== undefined && daysRemaining <= 7) {
    return (
      <Link href="/upgrade" className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors">
        {daysRemaining}d trial
      </Link>
    )
  }
  return (
    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
      Trial
    </span>
  )
}

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Portfolio', href: '/dashboard' },
  { label: 'Swarm', href: '/swarm' },
  { label: 'Vault', href: '/vault' },
  { label: 'Reports', href: '/reports/success' },
  { label: 'Partners', href: '/partners' },
] as const

// ── AppHeader ──────────────────────────────────────────────────────────────────
export default function AppHeader() {
  const { user, token, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<'trial' | 'active' | 'expired'>('trial')
  const [daysRemaining, setDaysRemaining] = useState<number | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch subscription status
  useEffect(() => {
    if (!token) return
    getSubscriptionStatus(token)
      .then((data) => {
        setSubscriptionStatus(data.status)
        setDaysRemaining(data.days_remaining)
      })
      .catch(() => {/* non-critical */})
  }, [token])

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?'

  const displayName = user?.user_metadata?.full_name || user?.email || ''

  return (
    <header className="sticky top-0 z-30 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/dashboard" className="text-xl font-bold text-gradient shrink-0">
          Neufin
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ label, href }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Right: badge + user menu */}
        <div className="flex items-center gap-3 shrink-0">
          <TrialBadge status={subscriptionStatus} daysRemaining={daysRemaining} />

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-800/60 transition-colors"
              >
                {user.user_metadata?.avatar_url ? (
                  <Image
                    src={user.user_metadata.avatar_url}
                    alt="avatar"
                    width={28}
                    height={28}
                    className="rounded-full border border-gray-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold">
                    {initials}
                  </div>
                )}
                <span className="hidden sm:block text-sm text-gray-300 max-w-[140px] truncate">{displayName}</span>
                <svg
                  className={`w-3 h-3 text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-800">
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/60 hover:text-white transition-colors"
                    onClick={() => { setMenuOpen(false); router.push('/dashboard/settings') }}
                  >
                    Account Settings
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/60 hover:text-white transition-colors"
                    onClick={() => { setMenuOpen(false); router.push('/dashboard/billing') }}
                  >
                    Subscription
                  </button>
                  <div className="border-t border-gray-800 mt-1 pt-1">
                    <button
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                      onClick={async () => { setMenuOpen(false); await signOut(); router.push('/') }}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-amber-500/60 transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
