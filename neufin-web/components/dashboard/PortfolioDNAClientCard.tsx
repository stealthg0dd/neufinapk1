'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type PortfolioSummary = {
  portfolio_id: string
  dna_score: number | null
}

export default function PortfolioDNAClientCard() {
  const [loading, setLoading] = useState(true)
  const [score, setScore] = useState<number | null>(null)

  useEffect(() => {
    const run = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch('/api/portfolio/list', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const data = (await res.json().catch(() => [])) as PortfolioSummary[]
        if (Array.isArray(data) && data.length > 0) {
          setScore(data[0]?.dna_score ?? null)
        }
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  if (loading) return <p className="text-sm text-[var(--text-2)]">Loading...</p>
  if (typeof score === 'number') {
    return <p className="font-mono text-4xl text-[var(--amber)]">{score}</p>
  }
  return (
    <Link href="/dashboard/portfolio" className="text-sm text-[var(--amber)] hover:underline">
      Upload portfolio →
    </Link>
  )
}

