/**
 * notifications.ts — Expo push token registration + alert subscription.
 *
 * Requires: expo-notifications, expo-device
 * Install:  npx expo install expo-notifications expo-device
 */

import { Platform } from 'react-native'

// Lazily import expo modules so the build doesn't break before they're installed.
let Notifications: typeof import('expo-notifications') | null = null
let Device: typeof import('expo-device') | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Device = require('expo-device')
} catch {
  console.warn('[Notifications] expo-notifications or expo-device not installed.')
}

const API_BASE = 'https://neufin101-production.up.railway.app'

export interface AlertSubscription {
  expo_push_token: string
  symbols: string[]         // tickers the user holds
  user_label?: string       // optional display name
}

export interface MacroAlert {
  id: string
  title: string
  body: string
  regime: string
  cpi_yoy: string
  affected_symbols: string[]
  timestamp: string
}

/** Request push notification permission and return the Expo push token. */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) {
    console.warn('[Notifications] Expo modules not available.')
    return null
  }

  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications only work on physical devices.')
    return null
  }

  // Set notification handler
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Push notification permission denied.')
    return null
  }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('swarm-alerts', {
      name: 'Swarm Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFB900',
    })
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: 'neufin-mobile',   // update with your EAS project ID
  })

  return tokenData.data
}

/** Subscribe to Swarm macro-shift alerts for the given portfolio symbols. */
export async function subscribeToSwarmAlerts(
  symbols: string[],
  userLabel?: string,
): Promise<boolean> {
  const token = await registerForPushNotifications()
  if (!token) return false

  try {
    const res = await fetch(`${API_BASE}/api/alerts/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expo_push_token: token,
        symbols,
        user_label: userLabel ?? 'Mobile User',
      } satisfies AlertSubscription),
    })
    return res.ok
  } catch (e) {
    console.warn('[Notifications] Subscription failed:', e)
    return false
  }
}

/** Fetch the last N macro-shift alerts from the backend. */
export async function fetchRecentAlerts(limit = 20): Promise<MacroAlert[]> {
  try {
    const res = await fetch(`${API_BASE}/api/alerts/recent?limit=${limit}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
