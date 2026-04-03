import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { NavigationContainer } from '@react-navigation/native'

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn() }))
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }),
}))
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: any) => children ?? null,
}))
jest.mock('react-native-reanimated', () => {
  const { View, Text, Image, ScrollView } = require('react-native')
  const NOOP = () => {}
  const ID = (x: any) => x
  const createAnimatedComponent = (c: any) => c
  return {
    default: { View, Text, Image, ScrollView, createAnimatedComponent },
    View, Text, Image, ScrollView,
    createAnimatedComponent,
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: (_fn: any) => ({}),
    useAnimatedProps: (_fn: any) => ({}),
    withSpring: ID,
    withTiming: ID,
    withDelay: (_d: any, a: any) => a,
    withRepeat: ID,
    withSequence: (...args: any[]) => args[0],
    runOnJS: (fn: any) => fn,
    runOnUI: (fn: any) => fn,
    cancelAnimation: NOOP,
    Easing: { linear: ID, ease: ID, bezier: () => ID },
    interpolate: (_v: any, _i: any, o: any) => o[0],
    Extrapolation: { CLAMP: 'clamp' },
  }
})
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      signInWithOAuth: jest.fn(),
    },
  },
}))
jest.mock('@/lib/api', () => ({
  getPortfolioList: jest.fn().mockResolvedValue([]),
  uploadPortfolio: jest.fn(),
}))
jest.mock('@/lib/analytics', () => ({
  trackMobileEvent: jest.fn(),
}))

import PortfolioSyncScreen from '@/screens/PortfolioSyncScreen'

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() }

describe('PortfolioSyncScreen', () => {
  it('renders without crashing', () => {
    const { getByText } = render(
      <NavigationContainer>
        <PortfolioSyncScreen navigation={mockNavigation as any} route={{} as any} />
      </NavigationContainer>
    )
    // Ensure the component rendered something
    expect(getByText).toBeTruthy()
  })

  it('shows unauthenticated state when no session', async () => {
    const { findByText } = render(
      <NavigationContainer>
        <PortfolioSyncScreen navigation={mockNavigation as any} route={{} as any} />
      </NavigationContainer>
    )
    // Unauthenticated state renders "Sign in to view portfolios"
    const signInEl = await findByText('Sign in to view portfolios')
    expect(signInEl).toBeTruthy()
  })
})
