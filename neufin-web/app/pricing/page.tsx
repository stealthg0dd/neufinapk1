import type { Metadata } from 'next'
import PricingPageClient from '@/components/pricing/PricingPageClient'

export const metadata: Metadata = {
  title: 'Pricing — Plans for Every Investor',
  description:
    'NeuFin Free, Advisor, and Enterprise — behavioral finance intelligence for Singapore and SEA professionals.',
  openGraph: {
    title: 'NeuFin Pricing',
    description: 'Transparent tiers for DNA analysis, advisor workflows, and enterprise API.',
  },
}

export default function PricingPage() {
  return <PricingPageClient />
}
