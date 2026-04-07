import type { Metadata } from 'next'
import { Geist, JetBrains_Mono, Instrument_Serif } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { PostHogProvider } from '@/lib/posthog'
import { WebVitals } from '@/app/components/WebVitals'
import AuthDebugBoot from '@/app/components/AuthDebugBoot'
import { AuthDebugPanel } from '@/components/AuthDebugPanel'
import { SentryUserContext } from '@/components/SentryUserContext'
import { Toaster } from 'react-hot-toast'
import '@/lib/env-check'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://neufin.com'

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
  themeColor: '#0a0b0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        {/* Preconnect to external origins for faster font + API loads */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://gpczchjipalfgkfqamcu.supabase.co" />
        <link rel="dns-prefetch" href="https://neufin101-production.up.railway.app" />
        <link rel="dns-prefetch" href="https://us.i.posthog.com" />
      </head>
      <body
        className="min-h-screen antialiased font-sans bg-[var(--canvas)] text-[var(--text-primary)]"
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
            <SentryUserContext />
            <AuthDebugBoot />
            <WebVitals />
            {children}
            <AuthDebugPanel />
            <Toaster
              position="bottom-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'var(--glass-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  fontSize: '14px',
                  backdropFilter: 'blur(12px)',
                },
                error: { duration: 6000 },
              }}
            />
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
