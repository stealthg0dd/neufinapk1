/**
 * env-check.ts — Validate required environment variables at startup.
 * Import once in app/layout.tsx (server component) so misconfigurations
 * surface immediately in Vercel build logs and server console.
 */

type EnvCheck = { key: string; value: string | undefined }

const REQUIRED_PUBLIC: readonly EnvCheck[] = [
  { key: 'NEXT_PUBLIC_API_URL', value: process.env.NEXT_PUBLIC_API_URL },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
  { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', value: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY },
]

const REQUIRED_SERVER: readonly EnvCheck[] = [
  // Only checked server-side; never included in client bundle
  { key: 'NEXT_PUBLIC_APP_URL', value: process.env.NEXT_PUBLIC_APP_URL },
]

export function checkEnv(): void {
  const missing: string[] = []

  for (const env of REQUIRED_PUBLIC) {
    if (!env.value) missing.push(env.key)
  }

  // Server-only check (window is undefined on the server)
  if (typeof window === 'undefined') {
    for (const env of REQUIRED_SERVER) {
      if (!env.value) missing.push(env.key)
    }
  }

  if (missing.length > 0) {
    const msg = `[ENV] Missing required environment variables: ${missing.join(', ')}`
    // In production this surfaces in Railway/Vercel logs without crashing the app
    console.error(msg)
  }
}

// Run immediately on module load
checkEnv()
