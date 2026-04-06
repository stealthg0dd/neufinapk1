'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'

const pills = [
  { label: 'Risk', value: 'Moderate', delay: 0.3 },
  { label: 'Beta', value: '0.82', delay: 0.45 },
  { label: 'HHI', value: '0.34', delay: 0.6 },
]

export function HeroPortfolioDemo() {
  const [score, setScore] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 2200
    let frame: number
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setScore(Math.round(78 * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <GlassCard className="p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--amber)]/5 to-transparent pointer-events-none" />
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] mb-2">
        Live preview · Portfolio DNA
      </p>
      <div className="flex items-end gap-2 mb-6">
        <motion.span
          className="font-display text-6xl md:text-7xl text-[var(--text-primary)] tabular-nums"
          key={score}
          initial={{ opacity: 0.85, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
        >
          {score}
        </motion.span>
        <span className="text-xl text-[var(--text-muted)] mb-2 font-mono">/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden mb-6">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[var(--amber)] to-[var(--amber)]/70"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {pills.map((p) => (
          <motion.span
            key={p.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: p.delay, type: 'spring', stiffness: 400, damping: 28 }}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-2)]/80 px-3 py-1.5 text-xs font-mono text-[var(--text-primary)]"
          >
            <span className="text-[var(--text-muted)]">{p.label}:</span>
            {p.value}
          </motion.span>
        ))}
      </div>
    </GlassCard>
  )
}
