import LandingPageClient from '@/components/landing/LandingPageClient'

export const revalidate = 3600

export default async function HomePage() {
  // Do not block TTFB on upstream intelligence fetches.
  // Landing hydrates immediately, then loads regime/notes client-side.
  return <LandingPageClient regime={null} researchTeaser={[]} />
}
