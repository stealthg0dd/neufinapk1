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
  Image,
  Platform,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { getOAuthRedirectUrl, supabase } from '@/lib/supabase'

// Required for expo-web-browser to dismiss the auth session properly on Android
WebBrowser.maybeCompleteAuthSession()

interface Props {
  onAuthSuccess: () => void
}

export default function LoginScreen({ onAuthSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      console.log('[OAuth][DeepLink] incoming_url=', url)
    })

    return () => {
      sub.remove()
    }
  }, [])

  function debugRedirectUri() {
    let makeRedirectUriValue = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { makeRedirectUri } = require('expo-auth-session')
      makeRedirectUriValue = makeRedirectUri({ path: 'auth/callback' })
    } catch {
      makeRedirectUriValue = Linking.createURL('auth/callback')
    }

    const resolvedRedirect = getOAuthRedirectUrl()
    console.log('[OAuth][Debug] makeRedirectUri=', makeRedirectUriValue)
    console.log('[OAuth][Debug] resolved_redirect=', resolvedRedirect)
    return resolvedRedirect
  }

  async function signInWithGoogle() {
    setLoading(true)
    setError(null)

    try {
      const redirectTo = debugRedirectUri()

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

      console.log('[OAuth][Debug] provider_url=', data.url)

      // 2. Open in the system browser, waiting for the deep-link redirect back.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      console.log('[OAuth][Debug] browser_result_type=', result.type)
      if (result.type === 'success') {
        console.log('[OAuth][Debug] callback_url=', result.url)
      }

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

      const authCode = params.get('code')
      const authError = params.get('error')
      const authErrorDescription = params.get('error_description')

      console.log('[OAuth][Debug] parsed_code=', authCode)
      console.log('[OAuth][Debug] parsed_error=', authError)
      console.log('[OAuth][Debug] parsed_error_description=', authErrorDescription)

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
      {/* Brand */}
      <View style={styles.brand}>
        <Text style={styles.logo}>🧬</Text>
        <Text style={styles.appName}>Neufin</Text>
        <Text style={styles.tagline}>AI Portfolio Intelligence</Text>
      </View>

      {/* Value props */}
      <View style={styles.features}>
        {[
          { icon: '🧬', text: 'Discover your Investor DNA score' },
          { icon: '🤖', text: 'Multi-model AI swarm analysis' },
          { icon: '🔔', text: 'Regime-change push alerts' },
        ].map(({ icon, text }) => (
          <View key={text} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{icon}</Text>
            <Text style={styles.featureText}>{text}</Text>
          </View>
        ))}
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Google sign-in */}
      <TouchableOpacity
        style={[styles.googleBtn, loading && styles.btnDisabled]}
        onPress={signInWithGoogle}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.disclaimer}>
        By signing in you agree to our Terms of Service.{'\n'}
        Your portfolio data is encrypted at rest.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 56,
    marginBottom: 12,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  features: {
    alignSelf: 'stretch',
    gap: 14,
    marginBottom: 40,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0d1117',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  featureIcon: {
    fontSize: 20,
  },
  featureText: {
    fontSize: 14,
    color: '#cbd5e1',
    flex: 1,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  googleIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  googleBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 16,
  },
})
