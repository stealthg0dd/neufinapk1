import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Linking } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import UploadScreen from '@/screens/UploadScreen'
import ResultsScreen from '@/screens/ResultsScreen'
import ShareScreen from '@/screens/ShareScreen'
import SwarmAlertsScreen from '@/screens/SwarmAlertsScreen'
import { supabase } from '@/lib/supabase'
import type { DNAResult } from '@/lib/api'

// Required for expo-web-browser OAuth redirect completion on Android
WebBrowser.maybeCompleteAuthSession()

export type RootStackParamList = {
  Upload: undefined
  Results: { result: DNAResult }
  Share: { result: DNAResult }
  SwarmAlerts: undefined
}

const Stack = createStackNavigator<RootStackParamList>()

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#030712',
    card: '#0d1117',
    text: '#f1f5f9',
    border: '#1f2937',
    primary: '#3b82f6',
    notification: '#3b82f6',
  },
}

/**
 * OAuth / magic-link deep-link handler.
 *
 * After Google/Apple OAuth or a magic-link click, Supabase redirects to
 * neufin://auth/callback?code=...  (PKCE flow) or
 * neufin://auth/callback#access_token=...  (implicit flow).
 *
 * Calling supabase.auth.getSession() triggers the SDK to read the URL
 * hash/query that was set during WebBrowser.openAuthSessionAsync and
 * exchange/restore the session into AsyncStorage automatically.
 */
async function handleAuthDeepLink(url: string): Promise<void> {
  const isAuthCallback =
    url.includes('auth/callback') ||
    url.includes('access_token') ||
    url.includes('type=magiclink') ||
    url.includes('code=')

  if (!isAuthCallback) return

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[Auth] Session exchange failed:', error.message)
    } else if (data.session) {
      console.log('[Auth] Session restored for:', data.session.user.email)
    }
  } catch (e) {
    console.warn('[Auth] Deep link handling failed:', e)
  }
}

export default function App() {
  useEffect(() => {
    // App foregrounded via a link
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url)
    })
    // App cold-started via a deep link
    Linking.getInitialURL().then(url => {
      if (url) handleAuthDeepLink(url)
    })
    return () => sub.remove()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={DarkTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Upload"
          screenOptions={{
            headerStyle: { backgroundColor: '#0d1117' },
            headerTintColor: '#f1f5f9',
            headerTitleStyle: { fontWeight: '700', fontSize: 17 },
            headerBackTitleVisible: false,
            cardStyle: { backgroundColor: '#030712' },
          }}
        >
          <Stack.Screen
            name="Upload"
            component={UploadScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Results"
            component={ResultsScreen}
            options={{ title: 'Your DNA Score', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="Share"
            component={ShareScreen}
            options={{ title: 'Share', headerBackTitle: 'Results' }}
          />
          <Stack.Screen
            name="SwarmAlerts"
            component={SwarmAlertsScreen}
            options={{ title: 'Swarm Alerts', headerBackTitle: 'Back' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  )
}
