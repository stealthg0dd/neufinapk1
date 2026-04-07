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
    // PKCE flow: OAuth returns ?code= to /auth/callback.
    // detectSessionInUrl:true lets the Supabase client auto-exchange the code
    // AND auto-parse any #access_token= hash (implicit flow fallback).
    // The /auth/callback page only listens for onAuthStateChange — no manual exchange.
    flowType: 'pkce',
    detectSessionInUrl: true,
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
