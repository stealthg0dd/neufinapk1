import './global.css'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import * as Sentry from '@sentry/react-native'
import PortfolioSyncScreen from '@/screens/PortfolioSyncScreen'
import AnalysisScreen from '@/screens/AnalysisScreen'
import SwarmReportScreen from '@/screens/SwarmReportScreen'
import ShareScreen from '@/screens/ShareScreen'
import SwarmAlertsScreen from '@/screens/SwarmAlertsScreen'
import type { PortfolioSummary, DNAResult } from '@/lib/api'

// ── Sentry: initialise before any component renders ───────────────────────────
// DSN is read from the EAS / Expo env variable at build time.
// Set SENTRY_DSN in eas.json or app.config.js extra.sentryDsn.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Capture 10 % of transactions for performance monitoring.
  tracesSampleRate: 0.1,
  // Attach JS bundle context for better stack trace deobfuscation.
  attachScreenshot: false,
  enabled: Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN),
})

export type RootStackParamList = {
  PortfolioSync: undefined
  Analysis:      { portfolio: PortfolioSummary }
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

export default Sentry.wrap(function App() {
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
})
