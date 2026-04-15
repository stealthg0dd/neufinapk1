'use client'

import Link from 'next/link'
import { usePortfolioDNA } from '@/hooks/usePortfolioDNA'

export default function PortfolioDNAClientCard() {
  const { loading, score, error } = usePortfolioDNA()

  if (error) {
    return (
      <div className="text-sm text-red-400 p-4">
        Unable to load portfolio data. {error.message}
      </div>
    )
  }
  if (loading) return <p className="text-sm text-[var(--text-2)]">Loading...</p>
  if (typeof score === 'number') {
    return <p className="font-mono text-4xl text-primary">{score}</p>
  }
  return (
    <Link href="/dashboard/portfolio" className="text-sm text-primary hover:underline">
      Upload portfolio →
    </Link>
  )
}
