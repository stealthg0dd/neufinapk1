import LandingPageClient from '@/components/landing/LandingPageClient'
import { getResearchRegime, getResearchNotes } from '@/lib/api'

export default async function HomePage() {
  const [regime, notes] = await Promise.all([getResearchRegime(), getResearchNotes(null, 1)])
  const researchTeaser = notes.slice(0, 2)

  return <LandingPageClient regime={regime} researchTeaser={researchTeaser} />
}
