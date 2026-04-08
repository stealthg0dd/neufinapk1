'use client'

import React, { useEffect, useRef, useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
export type AgentName = 'Strategist' | 'Quant' | 'Tax' | 'Critic' | 'Synthesizer' | 'Router' | 'System'

type DataProvider = 'POLY' | 'FMP' | '12D' | 'FRED'
type ProviderStatus = 'active' | 'throttled' | 'standby'

export interface SwarmTrace {
  agent:       AgentName
  message:     string
  isWarning?:  boolean
  isRevision?: boolean
  isFailover?: boolean
}

interface AgentStatus {
  name:   AgentName
  label:  string
  status: 'pending' | 'active' | 'done' | 'error'
}

interface SwarmTerminalProps {
  /** Raw string traces from the backend agent_trace array */
  traces: string[]
  /** Optional: whether the swarm is still running */
  isRunning?: boolean
  /** Optional: compact mode removes the status bar */
  compact?: boolean
  /** Copilot rail: cap height so the terminal fits beside chat */
  rail?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const AGENT_ORDER: AgentName[] = ['Strategist', 'Quant', 'Tax', 'Critic', 'Synthesizer']

const AGENT_LABELS: Record<AgentName, string> = {
  Strategist: 'MACRO',
  Quant:      'QUANT',
  Tax:        'TAX',
  Critic:     'CRITIC',
  Synthesizer:'SYNTH',
  Router:     'ROUTER',
  System:     'SYS',
}

function agentLabel(name: AgentName): string {
  switch (name) {
    case 'Strategist':
      return AGENT_LABELS.Strategist
    case 'Quant':
      return AGENT_LABELS.Quant
    case 'Tax':
      return AGENT_LABELS.Tax
    case 'Critic':
      return AGENT_LABELS.Critic
    case 'Synthesizer':
      return AGENT_LABELS.Synthesizer
    case 'Router':
      return AGENT_LABELS.Router
    default:
      return AGENT_LABELS.System
  }
}

/** Parse "[AgentName] message" → SwarmTrace */
function parseTrace(raw: string): SwarmTrace {
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (!match) return { agent: 'System', message: raw }

  const tag     = match[1].trim()
  const message = match[2].trim()

  const isWarning   = /⚠|HIGH CORR|revision|re-routing|NEGATIVE SHARPE|AGGRESSIVE BETA|TAX RISK/i.test(message)
  const isRevision  = /revision|re-routing|stricter threshold/i.test(message)
  const isFailover  = /throttled|blacklisted|switching to|failover|rate.?limit|DATA_INTEGRITY/i.test(message)

  let agent: AgentName = 'System'
  const t = tag.toLowerCase()
  if (t.includes('strateg'))  agent = 'Strategist'
  else if (t.includes('quant')) agent = 'Quant'
  else if (t.includes('tax'))   agent = 'Tax'
  else if (t.includes('critic')) agent = 'Critic'
  else if (t.includes('synth'))  agent = 'Synthesizer'
  else if (t.includes('router')) agent = 'Router'

  return { agent, message, isWarning, isRevision, isFailover }
}

function deriveAgentStatuses(parsed: SwarmTrace[], isRunning: boolean): AgentStatus[] {
  const seenSet  = new Set(parsed.map(t => t.agent))
  const lastAgent = parsed.length > 0 ? parsed[parsed.length - 1].agent : null

  return AGENT_ORDER.map(name => {
    let status: AgentStatus['status'] = 'pending'
    if (seenSet.has(name)) {
      status = (isRunning && name === lastAgent) ? 'active' : 'done'
    }
    return { name, label: agentLabel(name), status }
  })
}

// ── Provider status derivation ─────────────────────────────────────────────────
const PROVIDER_KEYWORDS: Record<DataProvider, RegExp> = {
  POLY: /polygon/i,
  FMP:  /financial modeling prep|fmp/i,
  '12D': /twelvedata|twelve.?data|12d/i,
  FRED: /fred|federal reserve/i,
}

function deriveProviderStatuses(
  parsed: SwarmTrace[],
  hasTraces: boolean,
): Record<DataProvider, ProviderStatus> {
  const throttled = new Set<DataProvider>()
  const recovered = new Set<DataProvider>()

  for (const t of parsed) {
    if (!t.isFailover && !t.isWarning) continue
    const msg = t.message
    for (const [prov, rx] of Object.entries(PROVIDER_KEYWORDS) as [DataProvider, RegExp][]) {
      if (rx.test(msg)) {
        if (/throttled|blacklisted|rate.?limit/i.test(msg)) throttled.add(prov)
        if (/switching to|recovered|available/i.test(msg))   recovered.add(prov)
      }
    }
  }

  if (!hasTraces) {
    return { POLY: 'standby', FMP: 'standby', '12D': 'standby', FRED: 'standby' }
  }

  const resolveStatus = (provider: DataProvider): ProviderStatus => {
    if (throttled.has(provider) && !recovered.has(provider)) return 'throttled'
    return 'active'
  }

  return {
    POLY: resolveStatus('POLY'),
    FMP: resolveStatus('FMP'),
    '12D': resolveStatus('12D'),
    FRED: resolveStatus('FRED'),
  }
}

function providerStatusFor(
  statuses: Record<DataProvider, ProviderStatus>,
  provider: DataProvider,
): ProviderStatus {
  switch (provider) {
    case 'POLY':
      return statuses.POLY
    case 'FMP':
      return statuses.FMP
    case '12D':
      return statuses['12D']
    default:
      return statuses.FRED
  }
}

function providerLabelFor(provider: DataProvider): string {
  switch (provider) {
    case 'POLY':
      return 'Polygon'
    case 'FMP':
      return 'FMP'
    case '12D':
      return 'TwelveData'
    default:
      return 'FRED'
  }
}


// ── Data Sources bar ───────────────────────────────────────────────────────────
function DataSourcesBar({ statuses, isRunning }: {
  statuses: Record<DataProvider, ProviderStatus>
  isRunning: boolean
}) {
  const PROVIDERS: DataProvider[] = ['POLY', 'FMP', '12D', 'FRED']

  return (
    <div className="bg-[#0a0a0a] border-t border-[#1a1a1a] px-4 py-1.5 flex items-center gap-1 shrink-0">
      <span className="text-[#333] text-[9px] uppercase tracking-widest mr-2 shrink-0">Data:</span>
      {PROVIDERS.map(p => {
        const st = providerStatusFor(statuses, p)
        const isActive    = st === 'active'
        const isThrottled = st === 'throttled'
        const dotColor    = isThrottled ? '#FFB900' : isActive ? '#00FF00' : '#2a2a2a'
        const textColor   = isThrottled ? '#FFB900' : isActive ? '#00FF00' : '#333'
        return (
          <div key={p} className="flex items-center gap-1 px-2 py-0.5" title={providerLabelFor(p)}>
            <span
              style={{
                display: 'inline-block',
                width: 5, height: 5,
                borderRadius: '50%',
                background: dotColor,
                ...(isActive && !isThrottled && isRunning
                  ? { animation: 'pulse 1.5s ease-in-out infinite' }
                  : {}),
                ...(isThrottled
                  ? { animation: 'blink 1s step-end infinite' }
                  : {}),
              }}
            />
            <span style={{ color: textColor, fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>
              {p}
            </span>
          </div>
        )
      })}
      <span className="text-[#1e1e1e] text-[9px] ml-auto">
        {Object.values(statuses).filter(s => s === 'active').length}/4 live
      </span>
    </div>
  )
}


// ── Sub-components ─────────────────────────────────────────────────────────────
function AgentBadge({ status }: { status: AgentStatus }) {
  const baseClasses = 'flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase'
  const styles: Record<AgentStatus['status'], string> = {
    pending: 'text-[#444] border border-[#333]',
    active:  'text-[#FFB900] border border-[#FFB900]/60 bg-[#FFB900]/5',
    done:    'text-[#00FF00] border border-[#00FF00]/40 bg-[#00FF00]/5',
    error:   'text-red-500  border border-red-500/40',
  }

  return (
    <div className={`${baseClasses} ${styles[status.status]}`}>
      {status.status === 'active' && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#FFB900] animate-pulse" />
      )}
      {status.status === 'done' && (
        <span className="text-[#00FF00]">✓</span>
      )}
      {status.status === 'pending' && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#333]" />
      )}
      {status.label}
    </div>
  )
}

function TraceLine({ trace, isLast, isRunning }: { trace: SwarmTrace; isLast: boolean; isRunning: boolean }) {
  if (trace.isFailover) {
    return (
      <div className="flex gap-2 items-start py-0.5 px-2 bg-amber-950/20 border-l-2 border-[#FFB900]/40 rounded-sm">
        <span className="text-[#FFB900] shrink-0 text-[11px]">⚡</span>
        <span className="text-[#555] shrink-0 text-[11px] font-bold w-28">[SYSTEM]</span>
        <span className="text-[#FFB900]/80 text-[11px] leading-relaxed">{trace.message}</span>
      </div>
    )
  }
  const agentColors: Record<AgentName, string> = {
    Strategist:  'text-blue-400',
    Quant:       'text-[#FFB900]',
    Tax:         'text-emerald-400',
    Critic:      'text-red-400',
    Synthesizer: 'text-purple-400',
    Router:      'text-cyan-400',
    System:      'text-[#666]',
  }

  const prefix = `[${trace.agent.toUpperCase()}]`

  if (trace.isRevision) {
    return (
      <div className="flex gap-2 items-start py-0.5 px-2 bg-red-950/40 border-l-2 border-red-500 rounded-sm">
        <span className="text-[#444] shrink-0 text-[11px] tabular-nums select-none">⚠</span>
        <span className="text-red-400 shrink-0 text-[11px] font-bold w-28">{prefix}</span>
        <span className="text-red-200 text-[11px] leading-relaxed">{trace.message}</span>
      </div>
    )
  }

  if (trace.isWarning) {
    return (
      <div className="flex gap-2 items-start py-0.5">
        <span className="text-[#555] shrink-0 text-[11px] tabular-nums select-none">›</span>
        <span className={`shrink-0 text-[11px] font-bold w-28 ${agentColors[trace.agent]}`}>{prefix}</span>
        <span className="text-amber-200 text-[11px] leading-relaxed">{trace.message}</span>
      </div>
    )
  }

  return (
    <div className="flex gap-2 items-start py-0.5 hover:bg-white/[0.02] rounded transition-colors">
      <span className="text-[#444] shrink-0 text-[11px] tabular-nums select-none">›</span>
      <span className={`shrink-0 text-[11px] font-bold w-28 ${agentColors[trace.agent]}`}>{prefix}</span>
      <span className="text-[#C8C8C8] text-[11px] leading-relaxed">
        {trace.message}
        {isLast && isRunning && (
          <span
            className="inline-block w-[7px] h-[13px] ml-1 bg-[#FFB900] align-middle"
            style={{ animation: 'blink 1s step-end infinite' }}
          />
        )}
      </span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SwarmTerminal({
  traces,
  isRunning = false,
  compact   = false,
  rail      = false,
}: SwarmTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(0)

  // Staggered reveal: reveal one new line every 120 ms for the "live typing" feel
  useEffect(() => {
    if (traces.length <= visibleCount) return
    const timer = setTimeout(() => setVisibleCount(v => Math.min(v + 1, traces.length)), 120)
    return () => clearTimeout(timer)
  }, [traces.length, visibleCount])

  // Auto-scroll on new line
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleCount])

  const parsed          = traces.slice(0, visibleCount).map(parseTrace)
  const statuses        = deriveAgentStatuses(parsed, isRunning)
  const hasRevision     = parsed.some(t => t.isRevision)
  const providerStatuses = useMemo(
    () => deriveProviderStatuses(parsed, traces.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleCount, traces.length],
  )

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .swarm-scroll::-webkit-scrollbar        { width: 5px }
        .swarm-scroll::-webkit-scrollbar-track  { background: #0d0d0d }
        .swarm-scroll::-webkit-scrollbar-thumb  { background: #2a2a2a; border-radius: 10px }
        .swarm-scroll::-webkit-scrollbar-thumb:hover { background: #444 }
      `}</style>

      <div
        className={`bg-[#0D0D0D] border border-[#2a2a2a] rounded-md overflow-hidden shadow-2xl font-mono flex flex-col h-full ${
          rail ? 'min-h-0 max-h-44' : 'min-h-[420px]'
        }`}
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="bg-[#141414] px-4 py-2 border-b border-[#2a2a2a] flex items-center justify-between select-none shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-white text-[12px] font-bold tracking-widest uppercase">
              NEUFIN / SWARM ANALYTICS
            </span>
            <span className="text-[#FFB900] text-[10px] uppercase tracking-widest">
              {isRunning ? 'LIVE TRACE' : traces.length > 0 ? 'COMPLETE' : 'STANDBY'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${isRunning ? 'bg-red-500 animate-pulse' : traces.length > 0 ? 'bg-[#00FF00]' : 'bg-[#333]'}`}
            />
            <span className="text-[#555] text-[10px] uppercase tracking-wider">
              {isRunning ? 'Agentic Loop Active' : traces.length > 0 ? 'Loop Complete' : 'Awaiting Input'}
            </span>
          </div>
        </div>

        {/* ── Agent status strip ─────────────────────────────────────────── */}
        <div className="bg-[#111] px-4 py-2 border-b border-[#2a2a2a] flex items-center gap-2 flex-wrap shrink-0">
          <span className="text-[#444] text-[10px] uppercase tracking-widest mr-1">Agents:</span>
          {statuses.map(s => <AgentBadge key={s.name} status={s} />)}
        </div>

        {/* ── Critic revision alert ──────────────────────────────────────── */}
        {hasRevision && (
          <div className="bg-red-950/60 border-b border-red-800/60 px-4 py-2 flex items-center gap-2 shrink-0">
            <span className="text-red-400 text-[10px] font-bold animate-pulse">● CRITIC ALERT</span>
            <span className="text-red-300 text-[10px]">
              High correlation detected — Quant Agent re-routed for stricter threshold revision
            </span>
          </div>
        )}

        {/* ── Log body ───────────────────────────────────────────────────── */}
        <div className="swarm-scroll flex-1 overflow-y-auto px-4 py-3 space-y-[2px]">
          {parsed.length === 0 ? (
            <div className="text-[#333] text-[11px] text-center mt-8 select-none">
              — Awaiting swarm initialisation —
            </div>
          ) : (
            parsed.map((trace, idx) => (
              <TraceLine
                key={idx}
                trace={trace}
                isLast={idx === parsed.length - 1}
                isRunning={isRunning}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Status bar ─────────────────────────────────────────────────── */}
        {!compact && (
          <div className="bg-[#111] px-4 py-1.5 border-t border-[#2a2a2a] flex gap-6 shrink-0">
            <StatusItem label="ORCHESTRATOR" value="LANGGRAPH" color="green" />
            <StatusItem label="AI"           value="CLAUDE 4.6 → FALLBACK" color="amber" />
            <StatusItem label="MACRO"        value="FRED CPI" color="green" />
            <StatusItem label="LINES"        value={`${visibleCount} / ${traces.length}`} color="amber" />
          </div>
        )}

        {/* ── Data Sources footer ─────────────────────────────────────────── */}
        {!compact && (
          <DataSourcesBar statuses={providerStatuses} isRunning={isRunning} />
        )}
      </div>
    </>
  )
}

function StatusItem({ label, value, color }: { label: string; value: string; color: 'green' | 'amber' }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
      <span className="text-[#555]">{label}:</span>
      <span className={color === 'green' ? 'text-[#00FF00]' : 'text-[#FFB900]'}>{value}</span>
    </div>
  )
}
