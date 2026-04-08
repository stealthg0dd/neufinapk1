import { DashboardShell } from '@/components/dashboard/DashboardShell'

async function fetchRegimeData(): Promise<unknown> {
  const base = process.env.RAILWAY_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
  try {
    const res = await fetch(`${base}/api/research/regime`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const regime = await fetchRegimeData()
  return <DashboardShell regime={regime}>{children}</DashboardShell>
}
