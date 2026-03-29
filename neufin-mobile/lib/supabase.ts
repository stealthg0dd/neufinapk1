import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn(
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. ' +
    'Create a .env file with these values.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:           AsyncStorage,
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: true,
  },
})

export function getOAuthRedirectUrl(): string {
  const explicitRedirect = process.env.EXPO_PUBLIC_SUPABASE_REDIRECT_URI?.trim()
  if (explicitRedirect) {
    return explicitRedirect
  }

  try {
    // Optional dependency in Expo projects; falls back safely when unavailable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { makeRedirectUri } = require('expo-auth-session')
    return makeRedirectUri({ path: 'auth/callback' })
  } catch {
    return Linking.createURL('auth/callback')
  }
}

/**
 * Sign in with Google OAuth.
 * The redirect target is the deep-link URL for this app, e.g. neufin://auth/callback.
 * Supabase will redirect there after the OAuth handshake; the deep-link handler
 * in App.tsx calls supabase.auth.getSession() to complete the session.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = getOAuthRedirectUrl()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo },
  })
  if (error) console.error('[Supabase] signInWithGoogle error:', error.message)
}

/**
 * Sign in with Apple OAuth (iOS only).
 */
export async function signInWithApple(): Promise<void> {
  const redirectTo = getOAuthRedirectUrl()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options:  { redirectTo },
  })
  if (error) console.error('[Supabase] signInWithApple error:', error.message)
}

/**
 * Sign out and clear the persisted session from AsyncStorage.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) console.error('[Supabase] signOut error:', error.message)
}
