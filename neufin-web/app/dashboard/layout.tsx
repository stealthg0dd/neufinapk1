import AppHeader from '@/components/AppHeader'
import TrialBannerLoader from '@/components/TrialBannerLoader'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <TrialBannerLoader />
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  )
}
