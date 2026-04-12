/**
 * LoginScreen — Dedicated authentication screen for the Neufin mobile app.
 *
 * Opens the Supabase Google OAuth flow in the device's native browser via
 * expo-web-browser, then sets the Supabase session from the redirect URL
 * tokens.  Calls onAuthSuccess() when a valid session is established so
 * App.tsx can switch to the authenticated navigation stack.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking as RNLinking,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { getOAuthRedirectUrl, supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

// Required for expo-web-browser to dismiss the auth session properly on Android
WebBrowser.maybeCompleteAuthSession()

interface Props {
  onAuthSuccess: () => void
}

export default function LoginScreen({ onAuthSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const sub = Linking.addEventListener('url', (_event) => {
      // Deep-link received — session will be picked up by supabase.auth.onAuthStateChange in App.tsx
    })
    return () => { sub.remove() }
  }, [])

  function getRedirectUri(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { makeRedirectUri } = require('expo-auth-session')
      return makeRedirectUri({ path: 'auth/callback' })
    } catch {
      return getOAuthRedirectUrl()
    }
  }

  async function signInWithGoogle() {
    setLoading(true)
    setError(null)

    try {
      const redirectTo = getRedirectUri()

      // 1. Get the OAuth URL from Supabase (skipBrowserRedirect so we can
      //    open it with expo-web-browser instead of the default behaviour).
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect:  true,
        },
      })

      if (oauthErr) throw oauthErr
      if (!data.url)  throw new Error('No OAuth URL returned from Supabase')

      // 2. Open in the system browser, waiting for the deep-link redirect back.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      if (result.type !== 'success') {
        // User cancelled or browser was dismissed — not an error.
        return
      }

      // 3. Parse tokens from the redirect URL.
      //    Supabase v2 PKCE returns them in the hash fragment on the web;
      //    for mobile it may be in the query string.
      const url = result.url
      const fragment = url.includes('#') ? url.split('#')[1] : ''
      const query    = url.includes('?') ? url.split('?')[1].split('#')[0] : ''
      const params   = new URLSearchParams(fragment || query)

      const authCode  = params.get('code')
      const authError = params.get('error')
      const authErrorDescription = params.get('error_description')

      if (authError || authErrorDescription) {
        throw new Error(authErrorDescription || authError || 'OAuth redirect failed.')
      }

      if (authCode) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(authCode)
        if (exchangeErr) throw exchangeErr

        const { data: { session }, error: getErr } = await supabase.auth.getSession()
        if (getErr) throw getErr
        if (session) { onAuthSuccess(); return }
      }

      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token:  accessToken,
          refresh_token: refreshToken,
        })
        if (sessionErr) throw sessionErr
        onAuthSuccess()
        return
      }

      // 4. Fallback — the PKCE exchange may have already completed automatically;
      //    check for an existing session.
      const { data: { session }, error: getErr } = await supabase.auth.getSession()
      if (getErr)  throw getErr
      if (session) { onAuthSuccess(); return }

      throw new Error('Could not establish a session from the OAuth redirect.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed. Please try again.'
      console.error('[LoginScreen]', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={styles.logoBox}>
          <Text style={styles.logoN}>N</Text>
        </View>
        <Text style={styles.brand}>NEUFIN</Text>
        <Text style={styles.tagline}>7 AI Agents. IC-Grade Intelligence.</Text>
        <Text style={styles.proof}>500+ investors · SOC 2 Certified · MAS Aware</Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.googleBtn, loading && styles.btnDisabled]}
        onPress={signInWithGoogle}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} size="small" />
        ) : (
          <>
            <GoogleIcon />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        By continuing you agree to our Terms and Privacy Policy{'\n'}
        <Text style={styles.email} onPress={() => RNLinking.openURL('mailto:info@neufin.ai')}>
          info@neufin.ai
        </Text>
      </Text>
    </View>
  )
}

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.04 5.04 0 0 1-2.21 3.31v2.77h3.57a10.99 10.99 0 0 0 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09A6.96 6.96 0 0 1 5.5 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  top: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(30,184,204,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(30,184,204,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoN: {
    fontFamily: 'monospace',
    fontSize: 30,
    color: colors.primary,
    fontWeight: '800',
  },
  brand: { fontFamily: 'monospace', fontSize: 20, fontWeight: '800', letterSpacing: 2, color: colors.primary, marginTop: 14 },
  tagline: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 4,
    textAlign: 'center',
    marginBottom: 10,
  },
  proof: { fontSize: 11, color: 'rgba(148,163,184,0.6)', textAlign: 'center', marginBottom: 8 },
  errorBox: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
  },
  googleBtn: {
    alignSelf: 'stretch',
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  googleBtnText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 11,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
  email: { color: colors.primary },
})
