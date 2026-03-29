import './global.css'
import React, { useState, useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { supabase } from '@/lib/supabase'
import LoginScreen from '@/screens/LoginScreen'
import PortfolioSyncScreen from '@/screens/PortfolioSyncScreen'
import AnalysisScreen from '@/screens/AnalysisScreen'
import SwarmReportScreen from '@/screens/SwarmReportScreen'
import ShareScreen from '@/screens/ShareScreen'
import SwarmAlertsScreen from '@/screens/SwarmAlertsScreen'
import type { PortfolioSummary, DNAResult } from '@/lib/api'

export type RootStackParamList = {
  PortfolioSync: undefined
  Upload:        undefined
  Analysis:      { portfolio: PortfolioSummary }
  Results:       { result: DNAResult }
  SwarmReport:   undefined
  Share:         { result: DNAResult }
  SwarmAlerts:   undefined
}

const Stack = createStackNavigator<RootStackParamList>()

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background:   '#030712',
    card:         '#0d1117',
    text:         '#f1f5f9',
    border:       '#1f2937',
    primary:      '#3b82f6',
    notification: '#3b82f6',
  },
}

export default function App() {
  // ── Auth state ─────────────────────────────────────────────────────────────
  // Three states: null = checking (show splash), false = unauthenticated
  // (show LoginScreen), true = authenticated (show main stack).
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    // Fast path: check for an existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(Boolean(session))
    })

    // Subscribe to auth state changes (sign-in / sign-out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthed(Boolean(session))
      },
    )
    return () => subscription.unsubscribe()
  }, [])

  // ── Splash while checking auth ─────────────────────────────────────────────
  if (authed === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#3b82f6" size="large" />
      </View>
    )
  }

  // ── Unauthenticated: show dedicated login screen ───────────────────────────
  if (!authed) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <LoginScreen onAuthSuccess={() => setAuthed(true)} />
      </GestureHandlerRootView>
    )
  }

  // ── Authenticated: main navigation stack ──────────────────────────────────
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={DarkTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="PortfolioSync"
          screenOptions={{
            headerShown:         false,
            cardStyle:           { backgroundColor: '#030712' },
            cardStyleInterpolator: ({ current, layouts }) => ({
              cardStyle: {
                opacity: current.progress,
                transform: [{ translateX: current.progress.interpolate({ inputRange: [0, 1], outputRange: [layouts.screen.width * 0.1, 0] }) }],
              },
            }),
          }}
        >
          <Stack.Screen name="PortfolioSync" component={PortfolioSyncScreen} />
          <Stack.Screen name="Analysis"      component={AnalysisScreen}      />
          <Stack.Screen name="SwarmReport"   component={SwarmReportScreen}   />
          <Stack.Screen name="Share"         component={ShareScreen}         />
          <Stack.Screen name="SwarmAlerts"   component={SwarmAlertsScreen}   />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  )
}
