import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Linking, Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import UploadScreen from '@/screens/UploadScreen'
import ResultsScreen from '@/screens/ResultsScreen'
import ShareScreen from '@/screens/ShareScreen'
import SwarmAlertsScreen from '@/screens/SwarmAlertsScreen'
import type { DNAResult } from '@/lib/api'

// Required for expo-web-browser OAuth redirect completion
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
 * Magic-link deep link handler.
 *
 * Supabase sends magic links to the email redirect URL configured in the
 * web app (e.g. https://neufin.app/auth/callback). On Android/iOS, the
 * Associated Domains / App Links config intercepts those URLs and opens
 * this app instead.
 *
 * When the app opens via neufin://auth/callback or
 * https://neufin.app/auth/callback, the URL contains the Supabase OTP
 * tokens in the hash fragment. We open the web /auth/callback page inside
 * an in-app browser so the web Supabase client can exchange the token and
 * persist the session — then dismiss it back to the app.
 *
 * Install @supabase/supabase-js (`npx expo install @supabase/supabase-js`)
 * to handle the session natively in the mobile app instead.
 */
async function handleAuthDeepLink(url: string) {
  if (!url.includes('access_token') && !url.includes('type=magiclink')) return
  try {
    // Redirect to the web callback page inside an in-app browser.
    // The web app completes the Supabase token exchange and stores the session.
    const webCallbackUrl = url
      .replace('neufin://', 'https://neufin.app/')
      .replace('com.neufin.app://', 'https://neufin.app/')
    await WebBrowser.openBrowserAsync(webCallbackUrl)
    Alert.alert(
      'Signed in',
      'Your Neufin Vault is now accessible. Upload a portfolio to get started.',
      [{ text: 'OK' }]
    )
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
