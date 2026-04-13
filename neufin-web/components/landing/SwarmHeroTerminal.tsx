'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Circle, Loader2 } from 'lucide-react'

type AgentStatus = 'pending' | 'complete' | 'running'

type AgentEntry = {
  name: string
  status: AgentStatus
  output: string
}

const AGENTS: AgentEntry[] = [
  { name: 'MARKET REGIME', status: 'complete', output: 'Risk-Off detected · VIX 28.4 · Yield curve inverted' },
  { name: 'STRATEGIST', status: 'complete', output: 'Defensive positioning recommended · Macro headwinds' },
  { name: 'QUANT', status: 'complete', output: 'HHI 0.34 · Beta 0.82 · Sharpe 1.24 · 3 clusters' },
  { name: 'TAX ARCHITECT', status: 'complete', output: 'CGT exposure $4,200 · 3 positions at risk' },
  { name: 'RISK SENTINEL', status: 'complete', output: 'Concentration risk HIGH · Tech cluster 67%' },
  { name: 'ALPHA SCOUT', status: 'complete', output: '2 opportunities identified · Defensive rotation play' },
  { name: 'SYNTHESIZER', status: 'running', output: 'Generating IC briefing...' },
]

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === 'complete') return <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-positive" />
  if (status === 'running') return <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary" />
  return <Circle className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
}

export default function SwarmHeroTerminal() {
  const entries = useMemo(() => AGENTS, [])
  const [visible, setVisible] = useState(0)
  const [typed, setTyped] = useState<Record<number, number>>({})
  const [showResult, setShowResult] = useState(false)

  useEffect(() => {
    let cancelled = false
    let revealTimer: number | null = null
    let loopTimer: number | null = null
    const typeTimers: number[] = []

    const reset = () => {
      setVisible(0)
      setTyped({})
      setShowResult(false)
    }

    const start = () => {
      reset()
      let i = 0
      revealTimer = window.setInterval(() => {
        if (cancelled) return
        i += 1
        setVisible(i)
        if (i >= entries.length) {
          if (revealTimer) window.clearInterval(revealTimer)
          revealTimer = null
          window.setTimeout(() => {
            if (!cancelled) setShowResult(true)
          }, 3500)
        }
      }, 600)
    }

    start()
    loopTimer = window.setInterval(() => start(), 8000)

    return () => {
      cancelled = true
      if (revealTimer) window.clearInterval(revealTimer)
      if (loopTimer) window.clearInterval(loopTimer)
      typeTimers.forEach((t) => window.clearInterval(t))
    }
  }, [entries])

  useEffect(() => {
    // Typewriter effect per visible entry
    const timers: number[] = []
    for (let i = 0; i < visible; i += 1) {
      const full = entries[i]?.output ?? ''
      if (!full) continue
      const already = typed[i] ?? 0
      if (already >= full.length) continue
      const id = window.setInterval(() => {
        setTyped((m) => {
          const cur = m[i] ?? 0
          if (cur >= full.length) return m
          return { ...m, [i]: Math.min(full.length, cur + 2) }
        })
      }, 18)
      timers.push(id)
      // Stop each timer after a short window; state updates will clamp it anyway.
      window.setTimeout(() => window.clearInterval(id), 1800)
    }
    return () => timers.forEach((t) => window.clearInterval(t))
  }, [entries, typed, visible])

  return (
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0B0F14] text-slate-200 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-slate-700/80 bg-[#121821] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-risk/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-positive/70" />
        <span className="ml-2 font-mono text-sm text-slate-500">NEUFIN SWARM TERMINAL</span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-positive" style={{ animation: 'pulse-dot 1.2s ease-in-out infinite' }} />
          <span className="font-mono text-sm text-positive">LIVE</span>
        </span>
      </div>

      <div className="p-4 font-mono text-sm">
        {entries.map((a, idx) => {
          const isVisible = idx < visible
          const status: AgentStatus = isVisible ? a.status : 'pending'
          const shown = isVisible ? a.output.slice(0, typed[idx] ?? 0) : ''
          return (
            <div
              key={a.name}
              className={`flex items-start gap-2 border-b border-slate-800/80 py-1.5 last:border-0 ${
                isVisible ? 'opacity-100' : 'opacity-0'
              } transition-opacity`}
            >
              <StatusIcon status={status} />
              <span className="w-28 shrink-0 text-sm font-bold uppercase text-primary">{a.name}</span>
              <span className="text-sm leading-snug text-slate-400">{shown}</span>
            </div>
          )
        })}

        {showResult ? (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 p-3">
            <p className="mb-1 font-mono text-sm uppercase tracking-widest text-primary">IC BRIEFING GENERATED</p>
            <p className="text-sm font-semibold text-slate-100">
              DNA Score <span className="font-mono tabular-nums text-primary">78</span> · Investor Type{' '}
              <span className="text-slate-100">Defensive Allocator</span>
            </p>
            <p className="mt-1 text-sm text-warning">Overconfidence bias detected in 3 positions</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

