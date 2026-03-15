import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { PostHogProvider } from '@/lib/posthog'

// Using `variable` mode avoids the server/client className mismatch that causes
// Next.js hydration warnings. The CSS variable is applied consistently on both sides.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://neufinapk1-git-master-varuns-projects-6fad10b9.vercel.app'
  ),
  title: 'Neufin — Investor DNA Score',
  description: 'Discover your investing personality. AI-powered portfolio analysis in seconds.',
  openGraph: {
    title: 'Neufin — Investor DNA Score',
    description: 'What kind of investor are you? Upload your portfolio and find out.',
    images: ['/og.png'],
  },
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
        <PostHogProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
