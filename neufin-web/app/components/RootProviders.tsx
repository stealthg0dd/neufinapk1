'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { AuthProvider } from '@/lib/auth-context'
import { PostHogProvider } from '@/lib/posthog'
import { SentryUserContext } from '@/components/SentryUserContext'
import { WebVitals } from '@/app/components/WebVitals'
import { Toaster } from 'react-hot-toast'

export default function RootProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublicLanding = useMemo(() => pathname === '/', [pathname])

  // Skip heavy auth/analytics and runtime widgets on the marketing landing route.
  if (isPublicLanding) return <>{children}</>

  return (
    <PostHogProvider>
      <AuthProvider>
        <SentryUserContext />
        {children}
        <WebVitals />
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
  )
}

