'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Position {
  symbol:    string
  shares:    number
  price:     number
  value:     number
  weight:    number
  cost_basis?: number
}

interface CommandPaletteProps {
  /** Portfolio positions for context (forwarded to /api/swarm/chat) */
  positions:   Position[]
  total_value: number
  /** Called when a response arrives — parent can use to show results */
  onResponse?: (result: ChatResult) => void
}

interface ChatResult {
  response:       { answer: string; key_numbers: Record<string, string>; recommended_action: string }
  agent:          string
  thinking_steps: string[]
}

// ── Suggested commands per category ───────────────────────────────────────────
const SUGGESTIONS = [
  { label: 'Explain my tax liability',           icon: '⚖', category: 'Tax' },
  { label: 'What is my correlation risk?',       icon: '📊', category: 'Quant' },
  { label: 'How does inflation affect my holdings?', icon: '🌐', category: 'Macro' },
  { label: 'Simulate a 2008 crash scenario',     icon: '📉', category: 'Quant' },
  { label: 'What happens if rates rise?',        icon: '📈', category: 'Macro' },
  { label: 'Optimize my largest position for tax efficiency', icon: '💡', category: 'Tax' },
  { label: 'Which positions have the highest beta?', icon: '⚡', category: 'Quant' },
  { label: 'Show my best harvest opportunity',   icon: '🌾', category: 'Tax' },
]

// ── Agent routing labels ───────────────────────────────────────────────────────
const AGENT_META: Record<string, { color: string; label: string }> = {
  tax:         { color: '#00FF00', label: 'Tax Architect' },
  quant:       { color: '#FFB900', label: 'Quant Agent'   },
  macro:       { color: '#60a5fa', label: 'Strategist'    },
  synthesizer: { color: '#c084fc', label: 'Synthesizer'   },
}

function getAgentMeta(agent: string | null): { color: string; label: string } | null {
  if (!agent) return null
  switch (agent) {
    case 'tax':
      return AGENT_META.tax
    case 'quant':
      return AGENT_META.quant
    case 'macro':
      return AGENT_META.macro
    case 'synthesizer':
      return AGENT_META.synthesizer
    default:
      return null
  }
}

// ── Keyword router (mirrors backend) ──────────────────────────────────────────
function classifyQuestion(msg: string): string {
  const m = msg.toLowerCase()
  if (/tax|harvest|cost basis|capital gain|liability|cgt/.test(m))      return 'tax'
  if (/risk|corr|beta|sharpe|volatil|hhi|concentration|calcul/.test(m)) return 'quant'
  if (/news|macro|inflation|cpi|market|econom|fed|rate|cat\b|sector/.test(m)) return 'macro'
  return 'synthesizer'
}

// ── API call ───────────────────────────────────────────────────────────────────
async function callSwarmChat(
  message:     string,
  positions:   Position[],
  total_value: number,
): Promise<ChatResult> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const savedReportId = typeof window !== 'undefined'
    ? localStorage.getItem('neufin-swarm-report-id')
    : null
  const body: Record<string, unknown> = { message }
  if (positions.length > 0) {
    body.positions = positions
    body.total_value = total_value
  } else if (savedReportId) {
    body.record_id = savedReportId
  }

  const res = await apiFetch('/api/swarm/chat', {
    method:  'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Chat API ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CommandPalette({
  positions,
  total_value,
  onResponse,
}: CommandPaletteProps) {
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<ChatResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const inputRef     = useRef<HTMLInputElement>(null)
  const overlayRef   = useRef<HTMLDivElement>(null)

  // ── Keyboard shortcut: Cmd+K / Ctrl+K ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setResult(null)
        setError(null)
        setQuery('')
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setResult(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when palette opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40)
  }, [open])

  // Arrow-key navigation through suggestions
  const filtered = query.trim()
    ? SUGGESTIONS.filter(s => s.label.toLowerCase().includes(query.toLowerCase()))
    : SUGGESTIONS

  useEffect(() => { setActiveIdx(0) }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const text = query.trim() || filtered.at(activeIdx)?.label || ''
      if (text) submit(text)
    }
  }

  const submit = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setLoading(true)
    setResult(null)
    setError(null)
    setQuery(text)

    try {
      const res = await callSwarmChat(text, positions, total_value)
      setResult(res)
      onResponse?.(res)
    } catch (e: any) {
      setError(e.message ?? 'Chat failed')
    } finally {
      setLoading(false)
    }
  }, [loading, positions, total_value, onResponse])

  const routedAgent = query ? classifyQuestion(query) : null
  const agentMeta   = getAgentMeta(routedAgent)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#141414] border border-[#2a2a2a] rounded text-[11px] font-mono text-[#888] hover:border-[#FFB900]/50 hover:text-[#FFB900] transition-colors"
      >
        <span>⌘K</span>
        <span>Ask your portfolio...</span>
      </button>
    )
  }

  return (
    <>
      <style>{`
        .cp-scroll::-webkit-scrollbar        { width: 4px }
        .cp-scroll::-webkit-scrollbar-track  { background: transparent }
        .cp-scroll::-webkit-scrollbar-thumb  { background: #2a2a2a }
        @keyframes cp-in { from{opacity:0;transform:scale(.97) translateY(-8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .cp-panel { animation: cp-in 120ms ease-out }
      `}</style>

      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/70 backdrop-blur-sm px-4"
        onClick={e => { if (e.target === overlayRef.current) setOpen(false) }}
      >
        <div className="cp-panel w-full max-w-2xl bg-[#0D0D0D] border border-[#333] rounded-md shadow-2xl font-mono overflow-hidden">

          {/* ── Input row ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#222]">
            <span className="text-[#FFB900] text-[13px] select-none shrink-0">$</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your portfolio anything... (⏎ to send)"
              className="flex-1 bg-transparent text-[13px] text-white placeholder-[#444] outline-none caret-[#FFB900]"
              disabled={loading}
            />
            {agentMeta && !loading && (
              <span
                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border shrink-0"
                style={{ color: agentMeta.color, borderColor: `${agentMeta.color}40` }}
              >
                → {agentMeta.label}
              </span>
            )}
            {loading && (
              <span className="text-[10px] text-[#FFB900] uppercase tracking-wider shrink-0 animate-pulse">
                Thinking...
              </span>
            )}
            <kbd
              onClick={() => setOpen(false)}
              className="text-[10px] text-[#444] border border-[#333] rounded px-1.5 py-0.5 cursor-pointer hover:text-[#888] shrink-0"
            >
              ESC
            </kbd>
          </div>

          {/* ── Response panel ─────────────────────────────────────────────── */}
          {result && (
            <div className="px-4 py-3 border-b border-[#1e1e1e] space-y-3">
              {/* Agent badge */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border"
                  style={{
                    color:       AGENT_META[result.agent]?.color ?? '#888',
                    borderColor: `${AGENT_META[result.agent]?.color ?? '#888'}40`,
                  }}
                >
                  {AGENT_META[result.agent]?.label ?? result.agent}
                </span>
                <span className="text-[#444] text-[10px]">responded</span>
              </div>

              {/* Answer */}
              <p className="text-[#E0E0E0] text-[12px] leading-relaxed">
                {result.response?.answer ?? 'Analysis complete.'}
              </p>

              {/* Key numbers — FIXED: optional chain so undefined response never crashes */}
              {Object.keys(result.response?.key_numbers ?? {}).length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {Object.entries(result.response?.key_numbers ?? {}).map(([k, v]) => (
                    <div key={k} className="text-[11px]">
                      <span className="text-[#555] uppercase">{k}: </span>
                      <span className="text-[#FFB900] font-bold">{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action */}
              {result.response.recommended_action && (
                <div className="flex items-start gap-2 bg-[#00FF00]/5 border border-[#00FF00]/20 rounded px-3 py-2">
                  <span className="text-[#00FF00] text-[10px] shrink-0 mt-0.5">▶ ACTION</span>
                  <span className="text-[#aaffaa] text-[11px]">{result.response.recommended_action}</span>
                </div>
              )}

              {/* Thinking trace (collapsed by default) */}
              {result.thinking_steps.length > 0 && (
                <details className="group">
                  <summary className="text-[10px] text-[#444] hover:text-[#888] cursor-pointer uppercase tracking-wider list-none flex items-center gap-1.5 select-none">
                    <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                    Thinking trace ({result.thinking_steps.length} steps)
                  </summary>
                  <div className="cp-scroll mt-2 max-h-32 overflow-y-auto space-y-0.5 pl-3">
                    {result.thinking_steps.map((step, i) => (
                      <div key={i} className="text-[10px] text-[#555] leading-relaxed">{step}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* ── Error ──────────────────────────────────────────────────────── */}
          {error && (
            <div className="px-4 py-2 border-b border-[#1e1e1e] text-[11px] text-red-400 bg-red-950/20">
              ERROR: {error}
            </div>
          )}

          {/* ── Suggestions ────────────────────────────────────────────────── */}
          {!result && !loading && (
            <div className="cp-scroll max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <div className="px-4 py-3 text-[11px] text-[#444]">No matching commands.</div>
              )}
              {filtered.map((s, idx) => (
                <button
                  key={s.label}
                  onClick={() => submit(s.label)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    idx === activeIdx ? 'bg-[#FFB900]/10' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <span className="text-[14px] shrink-0 w-5 text-center">{s.icon}</span>
                  <span className="flex-1 text-[12px] text-[#C8C8C8]">{s.label}</span>
                  <span
                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0"
                    style={{
                      color:       AGENT_META[s.category.toLowerCase()]?.color ?? '#666',
                      borderColor: `${AGENT_META[s.category.toLowerCase()]?.color ?? '#666'}30`,
                    }}
                  >
                    {s.category}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <div className="px-4 py-1.5 bg-[#111] border-t border-[#1e1e1e] flex items-center gap-4 text-[10px] text-[#444] select-none">
            <span><kbd className="border border-[#333] rounded px-1">↑↓</kbd> navigate</span>
            <span><kbd className="border border-[#333] rounded px-1">⏎</kbd> send</span>
            <span><kbd className="border border-[#333] rounded px-1">ESC</kbd> close</span>
            <span className="ml-auto text-[#333]">NEUFIN SWARM CHAT · v1</span>
          </div>
        </div>
      </div>
    </>
  )
}
