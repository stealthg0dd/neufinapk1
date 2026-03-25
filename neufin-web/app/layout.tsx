import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { PostHogProvider } from '@/lib/posthog'

// Using `variable` mode avoids the server/client className mismatch that causes
// Next.js hydration warnings. The CSS variable is applied consistently on both sides.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neufin.com'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'NeuFin — Behavioral Finance Intelligence for SEA SMEs | Singapore',
    template: '%s | NeuFin',
  },
  description:
    'Stop making financial decisions on instinct. NeuFin shows Singapore SMEs and investors where cognitive biases are costing them money. MAS-compliant. Powered by Plaid.',
  keywords: [
    'behavioral finance Singapore',
    'investment bias detection',
    'portfolio analysis Singapore',
    'Singapore fintech',
    'cognitive bias investing',
    'MAS compliant fintech',
    'SEA wealth management',
    'SME finance tools',
    'CFO tools Singapore',
    'Plaid portfolio analysis',
  ],
  authors: [{ name: 'NeuFin', url: 'https://neufin.com' }],
  creator: 'NeuFin',
  publisher: 'NeuFin',
  openGraph: {
    type: 'website',
    locale: 'en_SG',
    url: APP_URL,
    siteName: 'NeuFin',
    title: 'NeuFin — Behavioral Finance Intelligence for SEA SMEs | Singapore',
    description:
      'Stop making financial decisions on instinct. NeuFin shows Singapore SMEs and investors where cognitive biases are costing them money.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'NeuFin — Behavioral Finance Intelligence Platform for Singapore SMEs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NeuFin — Behavioral Finance Intelligence for SEA SMEs',
    description:
      'Stop making financial decisions on instinct. NeuFin shows Singapore SMEs where cognitive biases are costing them money.',
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  other: {
    'llms-txt': `${APP_URL}/llms.txt`,
  },
}

// ── Schema.org: Organization ───────────────────────────────────────────────────

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'NeuFin',
  alternateName: 'NeuFin Behavioral Finance Intelligence',
  url: 'https://neufin.com',
  logo: `${APP_URL}/og.png`,
  description:
    'NeuFin is a B2B behavioral finance intelligence platform for Singapore SMEs and investors. Founded 2025 in Singapore. Detects cognitive biases in investment portfolios using multi-model AI.',
  foundingDate: '2025',
  foundingLocation: {
    '@type': 'Place',
    addressLocality: 'Singapore',
    addressCountry: 'SG',
  },
  areaServed: ['Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines'],
  knowsAbout: [
    'Behavioral Finance',
    'Cognitive Bias Detection',
    'Portfolio Analysis',
    'Investment Psychology',
    'MAS Compliance',
    'Prospect Theory',
    'Disposition Effect',
    'Home Bias',
    'Recency Bias',
  ],
}

// ── Schema.org: SoftwareApplication ───────────────────────────────────────────

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'NeuFin',
  applicationCategory: 'FinancialApplication',
  applicationSubCategory: 'Portfolio Analysis',
  operatingSystem: 'Web, Android, iOS',
  description:
    'Behavioral finance intelligence platform detecting cognitive biases in investment portfolios for Singapore SMEs, CFOs, wealth managers, and family offices in Southeast Asia.',
  url: 'https://neufin.com',
  author: { '@type': 'Organization', name: 'NeuFin', url: 'https://neufin.com' },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'SGD',
    description: 'Free Investor DNA Score — no account required',
  },
  featureList: [
    'Prospect Theory, Disposition Effect, Home Bias, Recency Bias detection',
    'Plaid API portfolio connection (read-only, encrypted)',
    'Investor DNA Score: 0–100 composite behavioral rating',
    'Plain-English insight reports in under 10 seconds',
    'MAS-compliant data handling under Singapore PDPA',
    'Multi-model AI: Claude, GPT-4, Gemini with automatic failover',
    'Professional PDF advisor reports',
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      {/* suppressHydrationWarning prevents false-positive warnings from browser
          extensions (e.g. password managers) that inject attributes into <body>. */}
      <body
        className="bg-gray-950 text-gray-100 min-h-screen antialiased font-sans"
        suppressHydrationWarning
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
        />
        <PostHogProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
