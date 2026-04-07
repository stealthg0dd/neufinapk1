'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/portfolio', label: 'Portfolio' },
  { href: '/dashboard/research', label: 'Research' },
  { href: '/dashboard/reports', label: 'Reports' },
]

export default function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()

  const initials = useMemo(() => {
    const email = user?.email || 'NF'
    return email.slice(0, 2).toUpperCase()
  }, [user?.email])

  const onSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <aside className="w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 flex flex-col">
      <p className="text-[var(--amber)] font-semibold text-xl mb-8">NeuFin</p>
      <nav className="space-y-1.5 flex-1">
        {NAV.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm border-l-2 transition-colors ${
                active
                  ? 'border-[var(--amber)] bg-white/5 text-[var(--text)]'
                  : 'border-transparent text-[var(--text-2)] hover:bg-white/5'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="pt-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-9 w-9 rounded-full bg-[var(--amber)] text-[#111] text-xs font-semibold grid place-items-center">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--text)] truncate">{user?.email || 'user@neufin.com'}</p>
            <span className="text-[10px] uppercase text-[var(--text-2)]">Plan · Trial</span>
          </div>
        </div>
        <button onClick={onSignOut} className="text-xs text-[var(--text-2)] hover:text-[var(--text)]">
          Sign out
        </button>
      </div>
    </aside>
  )
}

