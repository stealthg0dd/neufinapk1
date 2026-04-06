import type { Metadata } from 'next'
import ResearchHubClient from '@/components/research/ResearchHubClient'
import { getResearchRegime, getResearchNotes } from '@/lib/api'

export const metadata: Metadata = {
  title: 'NeuFin Research — Market Intelligence',
  description:
    'Live regime classification, research notes, and semantic search across NeuFin intelligence — Singapore behavioral finance.',
  openGraph: {
    title: 'NeuFin Research Hub',
    description: 'Regime-aware research notes and intelligence search for professionals.',
  },
}

const researchSchema = {
  '@context': 'https://schema.org',
  '@type': 'ResearchProject',
  name: 'NeuFin Singapore Behavioral Finance Research',
  description:
    'Proprietary research on behavioral finance patterns in Singapore and Southeast Asian investor portfolios.',
  funder: { '@type': 'Organization', name: 'NeuFin', url: 'https://neufin.com' },
  about: ['Behavioral Finance', 'Singapore Investors', 'Cognitive Bias', 'Portfolio Analysis'],
  dateCreated: '2025-01-01',
  url: 'https://neufin.com/research',
}

export default async function ResearchPage() {
  const [regime, notes] = await Promise.all([getResearchRegime(), getResearchNotes(null, 1, 24)])

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(researchSchema) }} />
      <ResearchHubClient regime={regime} notes={notes} />
    </>
  )
}
