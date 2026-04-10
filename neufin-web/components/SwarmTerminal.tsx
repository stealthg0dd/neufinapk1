'use client'

import React, { useEffect, useMemo, useRef } from 'react'

export interface AgentTraceItem {
  agent: string
  status: 'running' | 'complete' | 'failed'
  summary: string
  ts: string
}

type JobStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed'

const AGENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  market_regime: { icon: '🌍', color: '#EF4444', label: 'MARKET REGIME' },
  strategist: { icon: '🧠', color: '#F5A623', label: 'STRATEGIST' },
  quant: { icon: '📊', color: '#1EB8CC', label: 'QUANT' },
  tax_architect: { icon: '🏛️', color: '#F5A623', label: 'TAX ARCHITECT' },
  risk_sentinel: { icon: '🛡️', color: '#EF4444', label: 'RISK SENTINEL' },
  alpha_scout: { icon: '⚡', color: '#22C55E', label: 'ALPHA SCOUT' },
  synthesizer: { icon: '✦', color: '#7C3AED', label: 'SYNTHESIZER' },
}

const AGENT_ORDER = [
  'market_regime',
  'strategist',
  'quant',
  'tax_architect',
  'risk_sentinel',
  'alpha_scout',
  'synthesizer',
] as const

export default function SwarmTerminal({
  status,
  trace,
  onRetry,
}: {
  status: JobStatus
  trace: AgentTraceItem[]
  onRetry: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [trace.length, status])

  const byAgent = useMemo(() => {
    const map = new Map<string, AgentTraceItem>()
    for (const item of trace) map.set(item.agent, item)
    return map
  }, [trace])

  const completeCount = AGENT_ORDER.filter((a) => byAgent.get(a)?.status === 'complete').length

  return (
    <div className="rounded-md border border-[#2a2a2a] bg-[#0D0D0D] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#2a2a2a] bg-[#141414] px-4 py-2">
        <div className="text-[12px] font-bold uppercase tracking-widest text-white">NEUFIN SWARM TERMINAL</div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#00FF00]">
          <span className={`h-2 w-2 rounded-full ${status === 'running' ? 'animate-pulse bg-[#00FF00]' : 'bg-[#444]'}`} />
          LIVE
        </div>
      </div>

      <div className="space-y-2 p-3">
        {AGENT_ORDER.map((agent) => {
          const cfg = AGENT_CONFIG[agent]
          const current = byAgent.get(agent)
          const badge =
            current?.status === 'complete' || status === 'complete'
              ? 'DONE'
              : current?.status === 'running' || (status === 'running' && !current)
                ? 'RUNNING'
                : current?.status === 'failed' || status === 'failed'
                  ? 'FAILED'
                  : 'WAITING'
          const badgeClass =
            badge === 'DONE'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : badge === 'RUNNING'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : badge === 'FAILED'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'bg-gray-500/15 text-gray-300 border-gray-500/30'

          return (
            <div
              key={agent}
              className={`rounded-md border border-[#2a2a2a] bg-[#101010] p-2.5 ${
                badge === 'RUNNING' ? 'animate-pulse' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: cfg.color }}>{cfg.icon}</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <span className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${badgeClass}`}>
                  {badge}
                </span>
              </div>
              {current?.summary ? <p className="mt-1.5 text-[11px] text-[#9CA3AF]">{current.summary}</p> : null}
            </div>
          )
        })}
      </div>

      <div className="border-t border-[#2a2a2a] px-3 py-2">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-[#666]">
          <span>Progress</span>
          <span>{completeCount}/7 agents complete</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#1a1a1a]">
          <div
            className="h-full bg-cyan-400 transition-all duration-500"
            style={{ width: `${(completeCount / 7) * 100}%` }}
          />
        </div>
      </div>

      {status === 'complete' ? (
        <div className="border-t border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300">
          IC BRIEFING READY ✓
        </div>
      ) : null}

      {status === 'failed' ? (
        <div className="border-t border-red-500/30 bg-red-500/10 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-red-300">Swarm failed before completion.</span>
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-red-400/40 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-red-200 hover:bg-red-500/20"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  )
}
