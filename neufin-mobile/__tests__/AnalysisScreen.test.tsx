import React from 'react'
import { render } from '@testing-library/react-native'
import { NavigationContainer } from '@react-navigation/native'

// Mock heavy native modules that don't run in the Jest/jsdom environment
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: any) => children ?? null,
}))
jest.mock('react-native-svg', () => {
  const React = require('react')
  const Mock = (props: any) => React.createElement(React.Fragment, null, props.children ?? null)
  return { __esModule: true, default: Mock, Svg: Mock, Circle: Mock, Path: Mock, G: Mock, Rect: Mock }
})
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
    },
  },
}))
jest.mock('@/lib/api', () => ({
  getLatestSwarmReport: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/analytics', () => ({
  trackMobileEvent: jest.fn(),
}))

import AnalysisScreen from '@/screens/AnalysisScreen'

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
}

// Use correct PortfolioSummary field names (portfolio_id, portfolio_name)
const mockRoute = {
  params: {
    portfolio: {
      portfolio_id: 'test-uuid',
      portfolio_name: 'Test Portfolio',
      total_value: 10000,
      dna_score: 78,
      positions_count: 5,
      created_at: '2025-01-01T00:00:00Z',
    },
  },
}

describe('AnalysisScreen', () => {
  it('renders without crashing', () => {
    const { getByText } = render(
      <NavigationContainer>
        <AnalysisScreen navigation={mockNavigation as any} route={mockRoute as any} />
      </NavigationContainer>
    )
    // Portfolio name rendered in the score header
    expect(getByText(/Test Portfolio/i)).toBeTruthy()
  })

  it('shows portfolio name in header', () => {
    const { getByText } = render(
      <NavigationContainer>
        <AnalysisScreen navigation={mockNavigation as any} route={mockRoute as any} />
      </NavigationContainer>
    )
    expect(getByText('Test Portfolio')).toBeTruthy()
  })
})
