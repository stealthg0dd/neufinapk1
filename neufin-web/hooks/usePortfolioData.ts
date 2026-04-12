'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-client'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Position {
  symbol: string
  shares?: number
  price?: number
  value?: number
  weight?: number
  current_value?: number
}

export interface PortfolioSummary {
  id: string
  portfolio_id?: string
  name?: string
  portfolio_name?: string
  total_value?: number
  dna_score?: number | null
  investor_type?: string | null
  regime?: string | null
  created_at?: string
  analyzed_at?: string
  updated_at?: string
}

export interface DnaScore {
  id: string
  portfolio_id: string
  dna_score: number
  investor_type: string
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  total_value?: number
  weighted_beta?: number
  avg_correlation?: number
  tax_analysis?: {
    total_liability?: number
    total_harvest_opp?: number
    positions?: Array<{
      symbol: string
      unrealised_gain?: number
      tax_liability?: number
      harvest_credit?: number
    }>
    narrative?: string
  }
  created_at: string
}

export interface SwarmReport {
  id?: string
  headline?: string
  briefing?: string
  regime?: string
  top_risks?: string[] | string
  dna_score?: number
  recommendation_summary?: string
  generated_at?: string
  created_at?: string
}

export interface RegimeData {
  regime?: string
  confidence?: number
  label?: string
  current?: { regime?: string; confidence?: number }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePortfolioData() {
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([])
  const [latestDna, setLatestDna] = useState<DnaScore | null>(null)
  const [swarmReport, setSwarmReport] = useState<SwarmReport | null>(null)
  const [regime, setRegime] = useState<RegimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAllData() {
    setLoading(true)
    setError(null)
    try {
      // Run portfolio list + regime + swarm in parallel
      const [portResult, regimeResult, swarmResult] = await Promise.allSettled([
        apiGet<PortfolioSummary[]>('/api/portfolio/list'),
        apiGet<RegimeData>('/api/research/regime'),
        apiGet<{ found?: boolean; report?: SwarmReport } | SwarmReport>('/api/swarm/report/latest'),
      ])

      // ── Portfolios ──────────────────────────────────────────────────────
      let ports: PortfolioSummary[] = []
      if (portResult.status === 'fulfilled') {
        const raw = portResult.value
        ports = Array.isArray(raw) ? raw : (raw as { portfolios?: PortfolioSummary[] })?.portfolios ?? []
        setPortfolios(ports)
      }

      // ── Regime ─────────────────────────────────────────────────────────
      if (regimeResult.status === 'fulfilled') {
        const r = regimeResult.value
        // Backend may return { current: { regime, confidence } } or flat
        const flat: RegimeData =
          r && typeof r === 'object' && 'current' in r
            ? { ...(r as { current: RegimeData }).current }
            : (r as RegimeData)
        setRegime(flat ?? null)
      }

      // ── Swarm ──────────────────────────────────────────────────────────
      if (swarmResult.status === 'fulfilled') {
        const sr = swarmResult.value as { found?: boolean; report?: SwarmReport } & SwarmReport
        if (sr?.found === false || sr?.report === null) {
          setSwarmReport(null)
        } else if (sr?.report) {
          setSwarmReport(sr.report)
        } else if (sr?.id || sr?.headline) {
          setSwarmReport(sr as SwarmReport)
        } else {
          setSwarmReport(null)
        }
      }

      // ── Full DNA from Supabase (has investor_type, strengths, weaknesses etc.) ──
      // /api/portfolio/list only returns dna_score as int; query dna_scores directly.
      try {
        // Force a fresh access token before making a direct Supabase REST call.
        // getSession() returns the cached session; if the JWT is already expired
        // the background refresh may not have completed yet, causing a 400
        // "exp claim timestamp check failed" from the Supabase REST API.
        // refreshSession() makes an explicit /auth/v1/token?grant_type=refresh_token
        // network call and blocks until the new token is ready.
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const expiresAt = session.expires_at ?? 0
          const nowSecs = Math.floor(Date.now() / 1000)
          // Refresh if token expired or expires within the next 60 seconds
          if (expiresAt - nowSecs < 60) {
            await supabase.auth.refreshSession()
          }
        }
        const { data: dnaRows, error: dnaErr } = await supabase
          .from('dna_scores')
          .select(
            'id, portfolio_id, dna_score, investor_type, strengths, weaknesses, recommendation, total_value, weighted_beta, avg_correlation, tax_analysis, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(1)
        if (!dnaErr && dnaRows && dnaRows.length > 0) {
          setLatestDna(dnaRows[0] as DnaScore)
        }
      } catch (dnaFetchErr) {
        console.warn('[usePortfolioData] DNA fetch failed:', dnaFetchErr)
        // Fallback: use dna_score from portfolio list if available
        if (ports.length > 0 && ports[0].dna_score != null) {
          setLatestDna({
            id: 'local',
            portfolio_id: ports[0].id ?? ports[0].portfolio_id ?? '',
            dna_score: ports[0].dna_score as number,
            investor_type: ports[0].investor_type ?? 'Investor',
            strengths: [],
            weaknesses: [],
            recommendation: '',
            created_at: ports[0].created_at ?? new Date().toISOString(),
          })
        }
      }
    } catch (err) {
      console.error('[usePortfolioData] Load failed:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const latestPortfolio = portfolios[0] ?? null
  const hasPortfolio = portfolios.length > 0

  return {
    portfolios,
    latestPortfolio,
    hasPortfolio,
    latestDna,
    swarmReport,
    regime,
    loading,
    error,
    reload: loadAllData,
  }
}
