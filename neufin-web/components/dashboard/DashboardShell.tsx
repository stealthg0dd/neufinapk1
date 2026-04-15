'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import DashboardSidebar from '@/components/DashboardSidebar'
import { CommandBar } from '@/components/CommandBar'
import { CheckoutSessionSuccessFeedback } from '@/components/dashboard/CheckoutSessionSuccessFeedback'
import { TrialStatusBanner } from '@/components/dashboard/TrialStatusBanner'
import { MarketDeskRail } from '@/components/dashboard/MarketDeskRail'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const RAIL_STORAGE_KEY = 'neufin:dashboard:marketdesk-open'

export function DashboardShell({
  children,
  regime,
}: {
  children: React.ReactNode
  regime: unknown
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [marketDeskOpen, setMarketDeskOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(RAIL_STORAGE_KEY)
    setMarketDeskOpen(raw === '1')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(RAIL_STORAGE_KEY, marketDeskOpen ? '1' : '0')
  }, [marketDeskOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  if (loading || !user) {
    return <div className="min-h-screen bg-app" />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-app text-navy">
      {/* Desktop sidebar */}
      <aside className="hidden h-full shrink-0 lg:flex">
        <DashboardSidebar user={user} />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[min(280px,88vw)] max-w-sm flex-col border-r border-[#E5E7EB] bg-white shadow-xl">
            <div className="flex justify-end border-b border-[#F1F5F9] px-2 py-2">
              <button
                type="button"
                className="rounded-md p-2 text-[#64748B] hover:bg-[#F8FAFC] hover:text-navy"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DashboardSidebar user={user} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[#E5E7EB] bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-navy hover:bg-[#F8FAFC]"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <div className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="" width={24} height={24} className="rounded-sm" />
            <Image src="/logo.png" alt="NeuFin" width={80} height={24} className="h-6 w-auto" />
          </div>
        </header>
        <CommandBar regimeData={regime} onToggleCopilot={() => setMarketDeskOpen((o) => !o)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-app px-4 py-6 md:px-7 md:py-6">
            <Suspense fallback={null}>
              <CheckoutSessionSuccessFeedback />
            </Suspense>
            <TrialStatusBanner />
            {children}
          </main>
        </div>
      </div>
      <MarketDeskRail open={marketDeskOpen} onToggle={() => setMarketDeskOpen((o) => !o)} />
    </div>
  )
}
