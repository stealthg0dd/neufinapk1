import HomeLandingPage from '@/components/landing/HomeLandingPage'
import { getResearchNotes, getResearchRegime } from '@/lib/api'

export const revalidate = 3600

export default async function HomePage() {
  const [regime, researchTeaser] = await Promise.all([getResearchRegime(), getResearchNotes(null, 1, 2)])

  return <HomeLandingPage regime={regime} researchTeaser={researchTeaser} />
}
