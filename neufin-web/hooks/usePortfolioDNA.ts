'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-client'

export type PortfolioSummary = {
  portfolio_id: string
  dna_score: number | null
}

/**
 * Same fetch as PortfolioDNAClientCard — /api/portfolio/list, first row DNA score.
 */
export function usePortfolioDNA() {
  const [loading, setLoading] = useState(true)
  const [score, setScore] = useState<number | null>(null)
  const [hasPortfolioList, setHasPortfolioList] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const data = await apiGet<PortfolioSummary[]>('/api/portfolio/list')
        if (Array.isArray(data) && data.length > 0) {
          setHasPortfolioList(true)
          setScore(data[0]?.dna_score ?? null)
        }
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  return { loading, score, hasPortfolio: hasPortfolioList }
}
