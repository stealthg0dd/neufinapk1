/**
 * env-check.ts — Validate required environment variables at startup.
 * Import once in app/layout.tsx (server component) so misconfigurations
 * surface immediately in Vercel build logs and server console.
 */

const REQUIRED_PUBLIC = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
] as const

const REQUIRED_SERVER = [
  // Only checked server-side; never included in client bundle
  'NEXT_PUBLIC_APP_URL',
] as const

export function checkEnv(): void {
  const missing: string[] = []

  for (const key of REQUIRED_PUBLIC) {
    if (!process.env[key]) missing.push(key)
  }

  // Server-only check (window is undefined on the server)
  if (typeof window === 'undefined') {
    for (const key of REQUIRED_SERVER) {
      if (!process.env[key]) missing.push(key)
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
