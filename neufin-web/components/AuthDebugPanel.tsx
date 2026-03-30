/* eslint-disable no-console */

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { usePathname } from 'next/navigation'

// Only rendered in development — zero bundle cost in production.
export function AuthDebugPanel() {
  const { user, token, loading } = useAuth()
  const pathname = usePathname()

  const [localStorageKey, setLocalStorageKey] = useState<string | null>(null)
  const [hasCookie, setHasCookie]             = useState(false)
  const [expiresAt, setExpiresAt]             = useState<string | null>(null)
  const [cookieTokenLength, setCookieTokenLength] = useState<number | null>(null)
  const [localStorageTokenLength, setLocalStorageTokenLength] = useState<number | null>(null)
  const [tokensMatch, setTokensMatch] = useState<boolean | null>(null)
  const [expanded, setExpanded]               = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Supabase JS v2 stores session at '<storageKey>-auth-token'
    const raw = localStorage.getItem('neufin-auth-auth-token')
    setLocalStorageKey(raw ? 'neufin-auth-auth-token' : null)

    // Parse expiry from stored session
    try {
      if (raw) {
        const parsed = JSON.parse(raw)
        const storageToken = parsed?.access_token
        setLocalStorageTokenLength(typeof storageToken === 'string' ? storageToken.length : null)
        if (parsed?.expires_at) {
          setExpiresAt(new Date(parsed.expires_at * 1000).toISOString())
        }
      }
    } catch {}

    // Check neufin-auth cookie (what middleware reads)
    const cookieEntries = Object.fromEntries(
      document.cookie
        .split(';')
        .map((cookie) => cookie.trim())
        .filter(Boolean)
        .map((cookie) => {
          const [key, ...value] = cookie.split('=')
          return [key, value.join('=')]
        })
    )
    const cookieToken = cookieEntries['neufin-auth'] ?? null
    setHasCookie(Boolean(cookieToken))
    setCookieTokenLength(cookieToken?.length ?? null)

    try {
      const parsed = raw ? JSON.parse(raw) : null
      const storageToken = parsed?.access_token ?? null
      setTokensMatch(
        typeof cookieToken === 'string' &&
        typeof storageToken === 'string' &&
        cookieToken === storageToken
      )
    } catch {
      setTokensMatch(null)
    }
  }, [token]) // re-read on every token change

  if (process.env.NODE_ENV !== 'development') return null

  const statusColor = !loading && user ? 'text-green-400' : loading ? 'text-yellow-400' : 'text-red-400'

  return (
    <div
      style={{ zIndex: 99999 }}
      className="fixed bottom-4 right-4 bg-black/95 border border-gray-700 text-white rounded-lg text-xs max-w-xs shadow-2xl"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-gray-700 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="font-bold text-gray-300">🔐 Auth Debug</span>
        <span className={`font-mono ${statusColor}`}>
          {loading ? '⏳ loading' : user ? '✅ authed' : '❌ guest'}
        </span>
        <span className="text-gray-500 ml-2">{expanded ? '▼' : '▲'}</span>
      </div>

      {expanded && (
        <div className="px-3 py-2 space-y-1 font-mono">
          <Row label="Path"    value={pathname} />
          <Row label="User ID" value={user?.id    ?? 'null'} dim={!user?.id} />
          <Row label="Email"   value={user?.email ?? 'null'} dim={!user?.email} />
          <Row
            label="JWT token"
            value={token ? `${token.slice(0, 16)}…` : 'missing'}
            dim={!token}
            ok={!!token}
          />
          <Row
            label="localStorage"
            value={localStorageKey ? '✓ neufin-auth-auth-token' : '✗ missing'}
            ok={!!localStorageKey}
            dim={!localStorageKey}
          />
          <Row
            label="Cookie"
            value={hasCookie ? '✓ neufin-auth set' : '✗ missing (middleware blind!)'}
            ok={hasCookie}
            dim={!hasCookie}
          />
          <Row
            label="Cookie len"
            value={cookieTokenLength?.toString() ?? 'missing'}
            ok={typeof cookieTokenLength === 'number'}
            dim={typeof cookieTokenLength !== 'number'}
          />
          <Row
            label="Storage len"
            value={localStorageTokenLength?.toString() ?? 'missing'}
            ok={typeof localStorageTokenLength === 'number'}
            dim={typeof localStorageTokenLength !== 'number'}
          />
          <Row
            label="Tokens match"
            value={
              tokensMatch === null
                ? 'unknown'
                : tokensMatch
                  ? '✓ equal'
                  : '✗ mismatch'
            }
            ok={tokensMatch === true}
            dim={tokensMatch === null}
          />
          {expiresAt && (
            <Row
              label="Expires"
              value={new Date(expiresAt) < new Date() ? `⚠ EXPIRED ${expiresAt}` : expiresAt}
              ok={new Date(expiresAt) >= new Date()}
            />
          )}

          <div className="pt-1 flex gap-2">
            <button
              onClick={() => {
                const raw = localStorage.getItem('neufin-auth-auth-token')
                let session = null
                try { session = raw ? JSON.parse(raw) : null } catch {}
                const cookieMap = Object.fromEntries(
                  document.cookie.split(';').map(c => {
                    const [k, ...v] = c.trim().split('=')
                    return [k, v.join('=')]
                  })
                )
                console.group('[AUTH DEBUG] Full state snapshot')
                console.log('User:', user)
                console.log('Token (first 40):', token?.slice(0, 40))
                console.log('Session (localStorage):', session)
                console.log('Cookies:', cookieMap)
                console.log('All localStorage keys:', Object.keys(localStorage))
                console.groupEnd()
              }}
              className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded transition-colors"
            >
              Log State
            </button>
            <button
              onClick={() => {
                // Force re-sync the cookie from localStorage
                const raw = localStorage.getItem('neufin-auth-auth-token')
                try {
                  const s = raw ? JSON.parse(raw) : null
                  if (s?.access_token) {
                    const maxAge = s.expires_in ?? 3600
                    document.cookie = `neufin-auth=${s.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`
                    setHasCookie(true)
                    console.log('[AUTH DEBUG] Cookie manually synced ✓')
                  }
                } catch {}
              }}
              className="bg-orange-600 hover:bg-orange-500 px-2 py-1 rounded transition-colors"
            >
              Sync Cookie
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  dim = false,
  ok,
}: {
  label: string
  value: string
  dim?: boolean
  ok?: boolean
}) {
  const valueColor =
    ok === true  ? 'text-green-400' :
    ok === false ? 'text-red-400'   :
    dim          ? 'text-gray-600'  :
                   'text-gray-300'
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className={`${valueColor} truncate text-right`}>{value}</span>
    </div>
  )
}
