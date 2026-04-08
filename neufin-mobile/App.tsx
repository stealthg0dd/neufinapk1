import './global.css'
// ── Sentry: initialise before NavigationContainer so native crashes are captured
import * as Sentry from '@sentry/react-native'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'production',
  release: process.env.EXPO_PUBLIC_APP_VERSION ?? 'unknown',
  // Trace every transaction in dev; 20 % sample in production
  tracesSampleRate: process.env.EXPO_PUBLIC_ENVIRONMENT === 'production' ? 0.2 : 1.0,
  // Enable native crash handler (hard crashes, ANR, OOM)
  enableNative: true,
  enableNativeCrashHandling: true,
})
// Tag all events with service/company for filtering in Sentry UI
Sentry.setTag('service', 'neufin-mobile')
Sentry.setTag('company', 'neufin')
import React, { useRef, useState, useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer, DefaultTheme, NavigationContainerRef } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { PostHogProvider } from 'posthog-react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { posthog, trackMobileEvent } from '@/lib/analytics'
import LoginScreen from '@/screens/LoginScreen'
import HomeScreen from '@/screens/HomeScreen'
import PortfolioSyncScreen from '@/screens/PortfolioSyncScreen'
import AnalysisScreen from '@/screens/AnalysisScreen'
import SwarmReportScreen from '@/screens/SwarmReportScreen'
import ShareScreen from '@/screens/ShareScreen'
import SwarmAlertsScreen from '@/screens/SwarmAlertsScreen'
import UpgradeScreen from '@/screens/UpgradeScreen'
import ResearchScreen from '@/screens/ResearchScreen'
import AlertsScreen from '@/screens/AlertsScreen'
import type { PortfolioSummary, DNAResult } from '@/lib/api'
import { getRecentAlerts } from '@/lib/api'
import { colors } from '@/lib/theme'

export type RootStackParamList = {
  MainTabs:      undefined
  Home:          undefined
  PortfolioSync: undefined
  Upload:        undefined
  Analysis:      { portfolio: PortfolioSummary }
  Results:       { result: DNAResult }
  SwarmReport:   undefined
  Share:         { result: DNAResult }
  SwarmAlerts:   undefined
  Upgrade:       { trigger?: string }
  Research:      undefined
  Alerts:        undefined
}

export type MainTabParamList = {
  Home: undefined
  Portfolio: undefined
  Swarm: undefined
  Alerts: undefined
  Research: undefined
}

const Stack = createStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background:   colors.background,
    card:         colors.surface,
    text:         colors.foreground,
    border:       colors.border,
    primary:      colors.primary,
    notification: colors.primary,
  },
}

function MainTabs() {
  const [alertCount, setAlertCount] = useState(0)
  useEffect(() => {
    void getRecentAlerts(10).then((a) => setAlertCount(a.length))
  }, [])

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === 'Home' ? 'home-outline' :
            route.name === 'Portfolio' ? 'pie-chart-outline' :
            route.name === 'Swarm' ? 'flash-outline' :
            route.name === 'Alerts' ? 'notifications-outline' :
            'book-outline'
          return <Ionicons name={name as any} size={size} color={color} />
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Portfolio" component={PortfolioSyncScreen} />
      <Tab.Screen name="Swarm" component={SwarmReportScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} options={{ tabBarBadge: alertCount > 0 ? alertCount : undefined }} />
      <Tab.Screen name="Research" component={ResearchScreen} />
    </Tab.Navigator>
  )
}

export default function App() {
  // ── Auth state ─────────────────────────────────────────────────────────────
  // Three states: null = checking (show splash), false = unauthenticated
  // (show LoginScreen), true = authenticated (show main stack).
  const [authed, setAuthed] = useState<boolean | null>(null)
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null)
  const routeNameRef  = useRef<string | undefined>(undefined)

  useEffect(() => {
    trackMobileEvent('app_opened', {})
    // Fast path: check for an existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(Boolean(session))
      if (session?.user) {
        Sentry.setUser({ id: session.user.id, email: session.user.email ?? undefined })
      }
    })

    // Subscribe to auth state changes (sign-in / sign-out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthed(Boolean(session))
        if (session?.user) {
          Sentry.setUser({ id: session.user.id, email: session.user.email ?? undefined })
        } else {
          Sentry.setUser(null)
        }
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
      <PostHogProvider client={posthog}>
        <NavigationContainer
          theme={DarkTheme}
          ref={navigationRef}
          onReady={() => {
            routeNameRef.current = navigationRef.current?.getCurrentRoute()?.name
          }}
          onStateChange={() => {
            const currentRoute = navigationRef.current?.getCurrentRoute()?.name
            if (currentRoute && currentRoute !== routeNameRef.current) {
              trackMobileEvent('screen_viewed', { screen_name: currentRoute })
              routeNameRef.current = currentRoute
            }
          }}
        >
          <StatusBar style="light" />
          <Stack.Navigator
            initialRouteName="MainTabs"
            screenOptions={{
              headerShown:         false,
              cardStyle:           { backgroundColor: colors.background },
              cardStyleInterpolator: ({ current, layouts }) => ({
                cardStyle: {
                  opacity: current.progress,
                  transform: [{ translateX: current.progress.interpolate({ inputRange: [0, 1], outputRange: [layouts.screen.width * 0.1, 0] }) }],
                },
              }),
            }}
          >
            <Stack.Screen name="MainTabs"      component={MainTabs} />
            <Stack.Screen name="Home"          component={HomeScreen} />
            <Stack.Screen name="PortfolioSync" component={PortfolioSyncScreen} />
            <Stack.Screen name="Upload"        component={PortfolioSyncScreen} />
            <Stack.Screen name="Analysis"      component={AnalysisScreen}      />
            <Stack.Screen name="SwarmReport"   component={SwarmReportScreen}   />
            <Stack.Screen name="Share"         component={ShareScreen}         />
            <Stack.Screen name="SwarmAlerts"   component={SwarmAlertsScreen}   />
            <Stack.Screen name="Upgrade"       component={UpgradeScreen}       />
            <Stack.Screen name="Research"      component={ResearchScreen}      />
            <Stack.Screen name="Alerts"        component={AlertsScreen}        />
          </Stack.Navigator>
        </NavigationContainer>
      </PostHogProvider>
    </GestureHandlerRootView>
  )
}
