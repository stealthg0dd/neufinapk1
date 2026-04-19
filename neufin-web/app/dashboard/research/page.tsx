import DashboardResearchClient from "@/components/dashboard/research/DashboardResearchClient";

export const dynamic = "force-dynamic";

/**
 * Portfolio-aware research desk: IA buckets, personalization, read-later,
 * and bridges to portfolio / Swarm / reports. See `lib/research-personalization.ts`
 * and backend note schema in `lib/api.ts` (ResearchNote).
 */
export default function DashboardResearchPage() {
  return <DashboardResearchClient />;
}
