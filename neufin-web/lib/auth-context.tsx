'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase, type AuthUser } from './supabase'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
  /** Cached JWT — updated on every auth state change including TOKEN_REFRESHED */
  token: string | null
  /**
   * Returns a guaranteed-fresh access token by calling getSession() at call-time.
   * The Supabase SDK auto-refreshes the token if it is expired or near expiry.
   * Use this for API calls where token staleness could cause a 401.
   */
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  token: null,
  getAccessToken: async () => null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Hydrate from current session on mount
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setToken(data.session?.access_token ?? null)
      setLoading(false)
    })

    // Keep token in sync on every auth event, including TOKEN_REFRESHED
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setToken(session?.access_token ?? null)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  /**
   * Always fetches via getSession() so the SDK can silently refresh an expired
   * token before returning it.  Falls back to the cached token if getSession
   * fails (e.g. offline), so callers always get the best available value.
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getSession()
      const fresh = data.session?.access_token ?? null
      if (fresh) setToken(fresh)
      return fresh
    } catch {
      return token
    }
  }, [token])

  return (
    <AuthContext.Provider value={{ user, loading, signOut, token, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
