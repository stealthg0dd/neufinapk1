
import AppHeader from '@/components/AppHeader'
import TrialBannerLoader from '@/components/TrialBannerLoader'
import PaywallOverlay from '@/components/PaywallOverlay'
import { useAuth } from '@/lib/auth-context'

const TRIAL_PERIOD_DAYS = 14;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  let isTrialActive = true;
  if (user?.created_at) {
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const diffInDays = (now.getTime() - createdAt.getTime()) / (1000 * 3600 * 24);
    isTrialActive = diffInDays <= TRIAL_PERIOD_DAYS;
  }
  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <TrialBannerLoader />
      <AppHeader />
      <main className="flex-1">
        {!isTrialActive && <PaywallOverlay locked={!isTrialActive} onUnlock={() => {}}>{children}</PaywallOverlay>}
        {isTrialActive && children}
      </main>
    </div>
  );
}
