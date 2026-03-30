/* eslint-disable no-console */

'use client'

/**
 * useBackendHealth — Pings GET /health and GET /api/admin/health on mount.
 * Logs a structured summary to the browser console so devs can quickly verify
 * which AI models, market data providers, and features are active.
 *
 * Usage (fire-and-forget):
 *   useBackendHealth()
 *
 * Returns live state for optional UI consumption:
 *   const { isOnline, features, providers, latencyMs } = useBackendHealth()
 */

import { useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://neufin101-production.up.railway.app'

export interface BackendHealth {
  isOnline:   boolean
  latencyMs:  number | null
  features:   Record<string, boolean>
  aiModels:   Record<string, boolean>
  providers:  Record<string, boolean>
  activeAI:   string
}

const DEFAULT: BackendHealth = {
  isOnline:  false,
  latencyMs: null,
  features:  {},
  aiModels:  {},
  providers: {},
  activeAI:  'unknown',
}

export function useBackendHealth(): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>(DEFAULT)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false

    async function ping() {
      const t0 = performance.now()

      // ── 1. Basic liveness ─────────────────────────────────────────────────
      let isOnline = false
      try {
        const r = await fetch(`${API}/health`, { cache: 'no-store' })
        if (r.ok) isOnline = true
      } catch {}

      const latencyMs = Math.round(performance.now() - t0)

      // ── 2. Detailed feature health ────────────────────────────────────────
      let features:  Record<string, boolean> = {}
      let aiModels:  Record<string, boolean> = {}
      let providers: Record<string, boolean> = {}
      let activeAI   = 'unknown'

      try {
        const r2 = await fetch(`${API}/api/admin/health`, { cache: 'no-store' })
        if (r2.ok) {
          const data = await r2.json()
          features  = data.features         ?? {}
          aiModels  = data.ai_models        ?? {}
          providers = data.market_providers ?? {}
          activeAI  = data.active_ai        ?? 'unknown'
        }
      } catch {}

      if (cancelled) return

      // ── 3. Console output ─────────────────────────────────────────────────
      console.group('%c🏥 Neufin Backend Health', 'color: #FFB900; font-weight: bold')
      console.log(`%cStatus:  %c${isOnline ? '✓ ONLINE' : '✗ OFFLINE'}  (${latencyMs}ms)`,
        'color: #666', isOnline ? 'color: #00FF00; font-weight: bold' : 'color: #FF4444; font-weight: bold')
      console.log(`%cActive AI: %c${activeAI.toUpperCase()}`,
        'color: #666', 'color: #FFB900; font-weight: bold')

      if (Object.keys(aiModels).length) {
        console.group('AI Models')
        Object.entries(aiModels).forEach(([k, v]) =>
          console.log(`%c${k.padEnd(12)} %c${v ? '✓' : '✗'}`,
            'color: #888', v ? 'color: #00FF00' : 'color: #444'))
        console.groupEnd()
      }

      if (Object.keys(providers).length) {
        console.group('Market Data Providers')
        Object.entries(providers).forEach(([k, v]) =>
          console.log(`%c${k.padEnd(12)} %c${v ? '✓' : '✗'}`,
            'color: #888', v ? 'color: #00FF00' : 'color: #444'))
        console.groupEnd()
      }

      if (Object.keys(features).length) {
        console.group('Features')
        Object.entries(features).forEach(([k, v]) =>
          console.log(`%c${k.padEnd(20)} %c${v ? '✓ enabled' : '✗ disabled'}`,
            'color: #888', v ? 'color: #00FF00' : 'color: #444'))
        console.groupEnd()
      }

      console.groupEnd()

      setHealth({ isOnline, latencyMs, features, aiModels, providers, activeAI })
    }

    ping()
    return () => { cancelled = true }
  }, [])

  return health
}
