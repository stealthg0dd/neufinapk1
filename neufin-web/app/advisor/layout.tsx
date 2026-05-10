import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { OnboardingGate } from "@/components/OnboardingGate";
import { getResearchRegime } from "@/lib/api";

export default async function AdvisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let regime: unknown = null;
  try {
    regime = await getResearchRegime();
  } catch {
    regime = null;
  }
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-app">
      <DashboardShell regime={regime}>
        <OnboardingGate />
        {children}
      </DashboardShell>
    </div>
  );
}
