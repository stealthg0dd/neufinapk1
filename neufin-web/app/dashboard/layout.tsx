'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import DashboardSidebar from '@/components/DashboardSidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sgTime, setSgTime] = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    const updateClock = () => {
      setSgTime(
        new Date().toLocaleTimeString('en-SG', {
          timeZone: 'Asia/Singapore',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
    updateClock()
    const interval = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(interval)
  }, [])

  if (loading || !user) {
    return <div className="min-h-screen bg-[var(--bg)]" />
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-8 py-3 border-b border-white/10 bg-[#0F1420]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-amber-400 font-bold text-lg tracking-wider">NEUFIN</span>
            <span className="text-white/20 text-xs">|</span>
            <span className="text-white/40 text-xs font-mono">PORTFOLIO INTELLIGENCE TERMINAL</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-white/40">{sgTime}</span>
            <span className="text-xs text-white/40 font-mono">SGT</span>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
