import type { Metadata } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import RootProviders from '@/app/components/RootProviders'
import AuthDebugBoot from '@/app/components/AuthDebugBoot'
import { AuthDebugPanel } from '@/components/AuthDebugPanel'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})

/**
 * Safe site URL for metadataBase / OG. Avoids `new URL('')` when env is whitespace-only
 * or malformed (common misconfig on Vercel).
 */
function resolveAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) {
    try {
      return new URL(raw.includes('://') ? raw : `https://${raw}`).origin
    } catch {
      /* fall through */
    }
  }
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return 'https://neufin.com'
}

const APP_URL = resolveAppUrl()

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'NeuFin — Behavioral Finance Intelligence for Southeast Asia',
    template: '%s | NeuFin',
  },
  description:
    'AI-powered portfolio analysis trusted by Singapore financial advisors. MAS-compliant, institutional-grade research in 60 seconds. Free DNA score — no account required.',
  keywords: [
    'behavioral finance Singapore',
    'investment bias detection',
    'portfolio analysis Singapore',
    'Singapore fintech',
    'financial advisor tools Singapore',
    'cognitive bias investing',
    'MAS compliant fintech',
    'SEA wealth management',
    'white-label advisor reports',
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
    title: 'NeuFin — Behavioral Finance Intelligence for Southeast Asia',
    description:
      'AI-powered portfolio analysis trusted by Singapore financial advisors. MAS-compliant, institutional-grade behavioral finance research in 60 seconds.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'NeuFin — Behavioral Finance Intelligence Platform for Singapore',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NeuFin — Behavioral Finance Intelligence for Southeast Asia',
    description:
      'AI-powered portfolio analysis trusted by Singapore financial advisors. MAS-compliant research in 60 seconds.',
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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0F14',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showAuthDebug = process.env.NODE_ENV !== 'production'
  if (showAuthDebug) {
    // Keep env validation out of production runtime path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/env-check')
  }

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`}
    >
      <head>
        {/* next/font serves locally; keep only app-critical origins */}
        <link rel="preconnect" href="https://gpczchjipalfgkfqamcu.supabase.co" />
        <link rel="dns-prefetch" href="https://neufin101-production.up.railway.app" />
      </head>
      <body className="min-h-screen antialiased font-sans" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
        />
        <RootProviders>
          {showAuthDebug ? <AuthDebugBoot /> : null}
          {children}
          {showAuthDebug ? <AuthDebugPanel /> : null}
        </RootProviders>
      </body>
    </html>
  )
}
