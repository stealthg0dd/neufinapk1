'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import DashboardSidebar from '@/components/DashboardSidebar'
import { CommandBar } from '@/components/CommandBar'
import { CopilotRail } from '@/components/CopilotRail'

export function DashboardShell({
  children,
  regime,
}: {
  children: React.ReactNode
  regime: unknown
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [copilotOpen, setCopilotOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return <div className="min-h-screen bg-[hsl(var(--background))]" />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <DashboardSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CommandBar regimeData={regime} onToggleCopilot={() => setCopilotOpen((o) => !o)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          <CopilotRail open={copilotOpen} onClose={() => setCopilotOpen(false)} />
        </div>
      </div>
    </div>
  )
}
