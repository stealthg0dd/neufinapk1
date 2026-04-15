'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import clsx from 'clsx'

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/partners', label: 'Partners' },
  { href: '/admin/api-keys', label: 'API Keys' },
  { href: '/admin/revenue', label: 'Revenue' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/system', label: 'System' },
]

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <aside className="w-56 shrink-0 border-r border-zinc-800/80 p-4 flex flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            NeuFin
          </p>
          <p className="text-sm font-semibold text-zinc-100">Admin</p>
        </div>
        <nav className="flex flex-col gap-0.5">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                )}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  )
}
