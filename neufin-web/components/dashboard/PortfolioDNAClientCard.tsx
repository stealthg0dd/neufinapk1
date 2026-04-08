'use client'

import Link from 'next/link'
import { usePortfolioDNA } from '@/hooks/usePortfolioDNA'

export default function PortfolioDNAClientCard() {
  const { loading, score } = usePortfolioDNA()

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
