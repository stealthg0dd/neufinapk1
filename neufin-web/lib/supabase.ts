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
    // PKCE: OAuth returns ?code= to /auth/callback (not #access_token= to root).
    // detectSessionInUrl:false prevents double-exchange — only /auth/callback
    // calls exchangeCodeForSession() explicitly.
    flowType: 'pkce',
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
