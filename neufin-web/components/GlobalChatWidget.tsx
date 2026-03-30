'use client'

/**
 * GlobalChatWidget.tsx — Floating market-intelligence chatbot for the landing page.
 *
 * Calls POST /api/swarm/global-chat  (no portfolio or auth required).
 * Supports four agent personalities via a tab selector.
 *
 * Position: fixed bottom-right, toggleable like Intercom.
 * Style: Tailwind CSS glassmorphism dark theme.
 */

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENTS = [
  { value: 'general',   label: 'General',    fullLabel: 'General Agent',        emoji: '🤖', color: 'text-blue-400',   accent: 'border-blue-400/60',  ring: 'ring-blue-400/30'  },
  { value: 'quant',     label: 'Quant',      fullLabel: 'Quant Agent',           emoji: '📊', color: 'text-amber-400',  accent: 'border-amber-400/60', ring: 'ring-amber-400/30' },
  { value: 'macro',     label: 'Macro',      fullLabel: 'Macro Strategist',      emoji: '🌐', color: 'text-emerald-400',accent: 'border-emerald-400/60',ring: 'ring-emerald-400/30'},
  { value: 'technical', label: 'Technical',  fullLabel: 'Technical Analyst',     emoji: '📈', color: 'text-purple-400', accent: 'border-purple-400/60', ring: 'ring-purple-400/30'},
] as const

type AgentValue = typeof AGENTS[number]['value']

// ── Suggested starters per agent ─────────────────────────────────────────────
const STARTERS: Record<AgentValue, string[]> = {
  general:   ['What is the best-performing sector this year?', 'How do I hedge against inflation?'],
  quant:     ['What is the Sharpe ratio of SPY vs QQQ?', 'Explain the VIX and how to use it'],
  macro:     ['How does the Fed rate affect tech stocks?', 'What does an inverted yield curve mean?'],
  technical: ['What are key support levels for SPY?', 'How do I identify a breakout pattern?'],
}

function startersForAgent(agent: AgentValue): string[] {
  switch (agent) {
    case 'general':
      return STARTERS.general
    case 'quant':
      return STARTERS.quant
    case 'macro':
      return STARTERS.macro
    case 'technical':
      return STARTERS.technical
    default:
      return []
  }
}

interface Message {
  role:        'user' | 'assistant'
  text:        string
  keyNumbers?: Record<string, string>
  action?:     string
  agent?:      string
  loading?:    boolean
}

export default function GlobalChatWidget() {
  const [open,     setOpen]     = useState(false)
  const [agent,    setAgent]    = useState<AgentValue>('general')
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const currentAgent = AGENTS.find(a => a.value === agent) ?? AGENTS[0]

  // Greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role:  'assistant',
        text:  'Ask me anything about markets, trends, or portfolio strategy — no portfolio upload needed.',
        agent: 'general',
      }])
    }
  }, [open, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (question: string) => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', text: '', agent, loading: true }])

    try {
      const res = await fetch(`${API_BASE}/api/swarm/global-chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: q, agent_type: agent }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const reply      = data.reply ?? data.response?.answer ?? 'Analysis complete.'
      const keyNumbers = data.key_numbers ?? data.response?.key_numbers ?? {}
      const action     = data.action ?? data.response?.recommended_action ?? ''

      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', agent: data.agent ?? agent, text: reply, keyNumbers, action },
      ])
    } catch (e: any) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', agent, text: `Connection error — please try again. (${e.message})` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 font-sans">

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="w-[370px] h-[540px] flex flex-col rounded-2xl overflow-hidden
                     bg-black/60 backdrop-blur-xl
                     border border-white/10
                     shadow-[0_24px_64px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]
                     animate-[slideUp_0.18s_ease-out]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">{currentAgent.emoji}</span>
              <div>
                <p className="text-white text-[13px] font-semibold leading-tight">Neufin Market Intel</p>
                <p className={`text-[10px] tracking-widest uppercase ${currentAgent.color}`}>
                  {currentAgent.fullLabel}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/30 hover:text-white/70 transition-colors text-[16px] p-1 leading-none"
            >
              ✕
            </button>
          </div>

          {/* Agent tabs */}
          <div className="flex gap-1 px-3 py-2 bg-black/20 border-b border-white/[0.05]">
            {AGENTS.map(a => (
              <button
                key={a.value}
                onClick={() => setAgent(a.value)}
                className={`
                  flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all
                  ${agent === a.value
                    ? `bg-white/10 ${a.color} border ${a.accent}`
                    : 'text-white/30 hover:text-white/60 border border-transparent'
                  }
                `}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/10">

            {/* Suggested starters — only shown on greeting */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {startersForAgent(agent).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className={`
                      text-[10px] text-white/40 px-2.5 py-1 rounded-full
                      border border-white/10 bg-white/[0.03]
                      hover:border-white/25 hover:text-white/70
                      transition-all leading-relaxed
                    `}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && !msg.loading && (
                  <span className="text-base shrink-0 mt-0.5 leading-none">
                    {AGENTS.find(a => a.value === msg.agent)?.emoji ?? '🤖'}
                  </span>
                )}

                <div className="max-w-[85%] flex flex-col gap-1.5">
                  {msg.loading ? (
                    <div className="bg-white/[0.05] border border-white/10 rounded-[4px_12px_12px_12px] px-3 py-2 text-white/40 text-[11px]">
                      <span className="animate-pulse inline-block">●</span>{' '}Thinking…
                    </div>
                  ) : msg.role === 'user' ? (
                    <div className="bg-gradient-to-br from-blue-600/30 to-purple-600/20 border border-white/10 rounded-[12px_4px_12px_12px] px-3 py-2 text-[#e0e0e0] text-[12px] leading-relaxed">
                      {msg.text}
                    </div>
                  ) : (
                    <>
                      <div className="bg-white/[0.04] border border-white/[0.08] rounded-[4px_12px_12px_12px] px-3 py-2 text-white/85 text-[12px] leading-[1.7]">
                        {msg.text}
                      </div>

                      {/* Key numbers */}
                      {msg.keyNumbers && Object.keys(msg.keyNumbers).length > 0 && (
                        <div className="bg-black/30 border border-white/[0.07] rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(msg.keyNumbers).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-1.5">
                              <span className="text-white/30 text-[9px] uppercase tracking-widest">{k}:</span>
                              <span className={`text-[11px] font-bold ${currentAgent.color}`}>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action */}
                      {msg.action && (
                        <div className={`border-l-2 ${currentAgent.accent} pl-2.5 ${currentAgent.color} text-[10px] leading-relaxed`}>
                          ▶ {msg.action}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="flex gap-2 items-center px-3 py-3 bg-black/40 border-t border-white/[0.06]">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              placeholder="Ask about markets, trends, risk…"
              className={`
                flex-1 bg-white/[0.05] border border-white/10 rounded-lg
                px-3 py-2 text-[12px] text-white/85 placeholder-white/25
                outline-none transition-all
                focus:border-white/25 focus:ring-1 ${currentAgent.ring}
                disabled:opacity-50
              `}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className={`
                shrink-0 w-8 h-8 rounded-lg text-[13px] font-bold
                flex items-center justify-center transition-all
                ${input.trim() && !loading
                  ? `bg-white/10 border ${currentAgent.accent} ${currentAgent.color} hover:bg-white/15`
                  : 'bg-transparent border border-white/10 text-white/20 cursor-default'
                }
              `}
            >
              {loading ? '…' : '↑'}
            </button>
          </div>
        </div>
      )}

      {/* ── Toggle button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close market chat' : 'Open market chat'}
        className="
          w-[52px] h-[52px] rounded-full
          bg-gradient-to-br from-blue-600 to-violet-600
          border border-white/15
          shadow-[0_4px_24px_rgba(37,99,235,0.45)]
          flex items-center justify-center
          text-white text-xl
          hover:scale-105 active:scale-95
          transition-transform duration-150
        "
      >
        {open ? '✕' : '💬'}
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
