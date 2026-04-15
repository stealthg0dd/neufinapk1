import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import RootProviders from '@/app/components/RootProviders'
import AuthDebugBoot from '@/app/components/AuthDebugBoot'
import { AuthDebugPanel } from '@/components/AuthDebugPanel'
import { ScrollReset } from '@/components/ScrollReset'

const inter = Inter({
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

export const metadata: Metadata = {
  metadataBase: new URL('https://www.neufin.ai'),
  icons: { icon: '/logo-icon.png', apple: '/logo-icon.png' },
  title: {
    default: 'NeuFin — 7 AI Agents for IC-Grade Portfolio Intelligence',
    template: '%s | NeuFin'
  },
  description:
    'NeuFin\'s 7-agent AI swarm analyzes your portfolio for behavioral biases, market regime risk, and alpha opportunities — delivering institutional-grade IC briefings in 60 seconds. Free to try.',
  keywords: [
    'portfolio analysis AI', 'behavioral finance', 'investment intelligence',
    'portfolio DNA scoring', 'AI investment advisor Singapore', 'MAS fintech',
    'hedge fund analytics retail', 'loss aversion detection', 'alpha generation AI',
    'institutional portfolio analysis', 'PE analyst tools', 'IC memo generator',
    'NeuFin', 'agentic AI finance', 'LangGraph portfolio', 'SENTINENT NEMO O2 BBA',
    'Singapore fintech', 'UAE DFSA fintech', 'Estonia fintech EU',
  ],
  authors: [
    { name: 'Varun Srivastava', url: 'https://www.neufin.ai/about' },
    { name: 'Ha Pham', url: 'https://www.neufin.ai/about' },
    { name: 'Ha Pham', url: 'https://www.neufin.ai/about' },
  ],
  creator: 'NeuFin — Neufin OÜ',
  publisher: 'Neufin OÜ',
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 
      'max-video-preview': -1, 'max-image-preview': 'large',
      'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.neufin.ai',
    siteName: 'NeuFin',
    title: 'NeuFin — 7 AI Agents for IC-Grade Portfolio Intelligence',
    description:
      '7 specialized AI agents analyze your portfolio for behavioral biases, market regime risk, and alpha — IC-grade briefings in 60 seconds. Try free.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'NeuFin — Agentic Portfolio Intelligence' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NeuFin — 7 AI Agents for IC-Grade Portfolio Intelligence',
    description:
      'Upload your portfolio. Get IC-grade behavioral finance analysis in 60 seconds. Powered by 7 specialized AI agents.',
    images: ['/og-image.png'],
    creator: '@neufin_ai',
  },
  verification: {
    google: 'ADD_GOOGLE_SEARCH_CONSOLE_TOKEN_HERE',
  },
  alternates: {
    canonical: 'https://www.neufin.ai',
  },
  manifest: '/manifest.json',
  other: {
    'llms-txt': 'https://www.neufin.ai/llms.txt',
  },
}

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "NeuFin",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web, iOS, Android",
  "description": "AI-powered portfolio intelligence platform with 7-agent swarm for behavioral finance analysis and IC-grade reporting.",
  offers: {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Free portfolio DNA analysis"
  },
  "creator": {
    "@type": "Organization",
    "name": "Neufin OÜ",
    "url": "https://neufin-web.vercel.app",
    "email": "info@neufin.ai",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "EE",
      "description": "Estonia (EU Headquarters)"
    }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "127"
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F6F8FB',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showAuthDebug = process.env.NODE_ENV !== 'production'
  if (showAuthDebug) {
    // Keep env validation out of production runtime path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/env-check')
  }

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if (typeof window !== 'undefined') { if (history.scrollRestoration) { history.scrollRestoration = 'manual'; } window.scrollTo(0, 0); }`,
          }}
        />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-Z2E03GFJP3"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-Z2E03GFJP3');`,
          }}
        />
        {/* next/font serves locally; keep only app-critical origins */}
        <link rel="preconnect" href="https://gpczchjipalfgkfqamcu.supabase.co" />
      </head>
      <body
        className="min-h-screen bg-app antialiased font-sans text-navy"
        suppressHydrationWarning
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
        />
        <RootProviders>
          <ScrollReset />
          {showAuthDebug ? <AuthDebugBoot /> : null}
          <main id="main-content">{children}</main>
          {showAuthDebug ? <AuthDebugPanel /> : null}
        </RootProviders>
      </body>
    </html>
  )
}
