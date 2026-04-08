import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { getResearchRegime } from '@/lib/api'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let regime: unknown = null
  try {
    regime = await getResearchRegime()
  } catch {
    regime = null
  }
  return <DashboardShell regime={regime}>{children}</DashboardShell>
}
