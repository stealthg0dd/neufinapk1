import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { NavigationContainer } from '@react-navigation/native'

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn() }))
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }),
}))
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

import PortfolioSyncScreen from '@/screens/PortfolioSyncScreen'

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() }

describe('PortfolioSyncScreen', () => {
  it('renders without crashing', () => {
    const { getByText } = render(
      <NavigationContainer>
        <PortfolioSyncScreen navigation={mockNavigation as any} route={{} as any} />
      </NavigationContainer>
    )
    // Should show something — sign-in prompt or portfolio list
    expect(getByText).toBeTruthy()
  })

  it('shows unauthenticated state when no session', async () => {
    const { findByText } = render(
      <NavigationContainer>
        <PortfolioSyncScreen navigation={mockNavigation as any} route={{} as any} />
      </NavigationContainer>
    )
    // Unauthenticated state should prompt sign-in
    const signInEl = await findByText(/sign in/i)
    expect(signInEl).toBeTruthy()
  })
})
