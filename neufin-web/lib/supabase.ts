import { createClient } from '@supabase/supabase-js'
import { debugAuth } from './auth-debug'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials missing. Deep linking/Auth may fail.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'neufin-auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
})

export function attachSupabaseAuthDebug() {
  if (typeof window === 'undefined') return () => {}
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase] onAuthStateChange:', event, {
      hasSession: Boolean(session),
      hasToken: Boolean(session?.access_token),
      userId: session?.user?.id ?? null,
    })
    debugAuth(`supabase:${event}`)
  })
  return () => subscription.unsubscribe()
}

export type AuthUser = Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']
