import HomeLandingPage from "@/components/landing/HomeLandingPage";
import { getResearchNotes, getResearchRegime } from "@/lib/api";

export const revalidate = 3600;

export default async function HomePage() {
  const [regime, researchTeaser] = await Promise.allSettled([
    getResearchRegime(),
    getResearchNotes(null, 1, 2),
  ]).then(
    ([r, n]) =>
      [
        r.status === "fulfilled" ? r.value : null,
        n.status === "fulfilled" && Array.isArray(n.value) ? n.value : [],
      ] as const,
  );

  return <HomeLandingPage regime={regime} researchTeaser={researchTeaser} />;
}
