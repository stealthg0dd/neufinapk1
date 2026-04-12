'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import DashboardSidebar from '@/components/DashboardSidebar'
import { CommandBar } from '@/components/CommandBar'
import { CheckoutSessionSuccessFeedback } from '@/components/dashboard/CheckoutSessionSuccessFeedback'
import { TrialStatusBanner } from '@/components/dashboard/TrialStatusBanner'
import { MarketDeskRail } from '@/components/dashboard/MarketDeskRail'

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
  const [marketDeskOpen, setMarketDeskOpen] = useState(false)

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

  if (loading || !user) {
    return <div className="min-h-screen bg-app" />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-app text-navy">
      <DashboardSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CommandBar regimeData={regime} onToggleCopilot={() => setMarketDeskOpen((o) => !o)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-app px-7 py-6">
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
