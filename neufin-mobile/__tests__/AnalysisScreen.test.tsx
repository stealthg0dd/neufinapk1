import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { NavigationContainer } from '@react-navigation/native'

// Mock expo modules
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) } },
}))
jest.mock('@/lib/api', () => ({
  getLatestSwarmReport: jest.fn().mockResolvedValue(null),
}))

import AnalysisScreen from '@/screens/AnalysisScreen'

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
}

const mockRoute = {
  params: {
    portfolio: {
      id: 'test-uuid',
      name: 'Test Portfolio',
      total_value: 10000,
    },
    demoMode: true,
  },
}

describe('AnalysisScreen', () => {
  it('renders in demo mode without crashing', () => {
    const { getByText } = render(
      <NavigationContainer>
        <AnalysisScreen navigation={mockNavigation as any} route={mockRoute as any} />
      </NavigationContainer>
    )
    // In demo mode, report content should render immediately
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
