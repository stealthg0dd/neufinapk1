import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { PostHogProvider } from '@/lib/posthog'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
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
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen antialiased`}>
        <PostHogProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
