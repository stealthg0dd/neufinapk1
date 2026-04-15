'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Menu, X } from 'lucide-react'

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/partners', label: 'Partners' },
  { href: '/admin/api-keys', label: 'API Keys' },
  { href: '/admin/revenue', label: 'Revenue' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/system', label: 'System' },
]

function AdminNavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
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
  )
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 md:flex-row">
      <header className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <Image src="/logo-icon.png" alt="" width={32} height={32} className="h-8 w-8 rounded-sm" />
          <Image src="/logo.png" alt="NeuFin" width={120} height={32} className="h-8 w-auto" />
          <span className="sr-only">NeuFin Admin</span>
        </div>
        <button
          type="button"
          className="rounded-md p-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex h-full w-[min(260px,88vw)] flex-col gap-6 border-r border-zinc-800/80 bg-zinc-950 p-4">
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-md p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Image src="/logo-icon.png" alt="" width={32} height={32} className="h-8 w-8 rounded-sm" />
                <Image src="/logo.png" alt="NeuFin" width={120} height={32} className="h-8 w-auto" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Admin</p>
            </div>
            <AdminNavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-56 shrink-0 flex-col gap-6 border-r border-zinc-800/80 p-4 md:flex">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="" width={32} height={32} className="h-8 w-8 rounded-sm" />
            <Image src="/logo.png" alt="NeuFin" width={120} height={32} className="h-8 w-auto" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Admin</p>
        </div>
        <AdminNavLinks pathname={pathname} />
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
