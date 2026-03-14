'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase, type AuthUser } from './supabase'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
  /** Raw JWT for Authorization headers */
  token: string | null
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  token: null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Hydrate from current session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setToken(data.session?.access_token ?? null)
      setLoading(false)
    })

    // Listen for sign-in / sign-out events
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

  return (
    <AuthContext.Provider value={{ user, loading, signOut, token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
