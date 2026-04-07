import { createClient } from '@supabase/supabase-js'
import { debugAuth } from './auth-debug'
import { logger } from './logger'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  logger.warn({}, 'supabase.credentials_missing')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'neufin-auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Disable auto-exchange: the /auth/callback page calls exchangeCodeForSession()
    // explicitly. If detectSessionInUrl:true (default), Supabase would also try to
    // exchange the ?code= on client init → double-exchange race where the second
    // call fails with "code already used" → user lands on /login?error=oauth_failed.
    detectSessionInUrl: false,
  },
})

export function attachSupabaseAuthDebug() {
  if (typeof window === 'undefined') return () => {}
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    logger.debug({
      event,
      hasSession: Boolean(session),
      hasToken: Boolean(session?.access_token),
      userId: session?.user?.id ?? null,
    }, 'supabase.state_change')
    debugAuth(`supabase:${event}`)
  })
  return () => subscription.unsubscribe()
}

export type AuthUser = Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']
