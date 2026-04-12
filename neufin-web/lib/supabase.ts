import { supabase } from './supabase-client'
import { debugAuth } from './auth-debug'
import { logger } from './logger'

export { supabase }

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  logger.warn({}, 'supabase.credentials_missing')
}

export function getSupabaseClient() {
  return supabase
}

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
