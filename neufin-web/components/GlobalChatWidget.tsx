'use client'

/**
 * GlobalChatWidget.tsx — Floating market-intelligence chatbot for the landing page.
 *
 * Calls POST /api/swarm/global-chat  (no portfolio or auth required).
 * Supports four agent personalities via a dropdown selector.
 *
 * Position: fixed bottom-right, toggleable like Intercom.
 * Style: Neufin dark theme (matches existing components).
 */

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

// ── Agent definitions ───────────────────────────────────────────────────────
const AGENTS = [
  { value: 'general',   label: 'General Agent',          emoji: '🤖', color: '#60a5fa' },
  { value: 'quant',     label: 'Quant Agent',            emoji: '📊', color: '#FFB900' },
  { value: 'macro',     label: 'Macro Strategist',       emoji: '🌐', color: '#34d399' },
  { value: 'sentiment', label: 'Sentiment Agent',        emoji: '📰', color: '#f472b6' },
  { value: 'trend',     label: 'Trend Agent',            emoji: '📈', color: '#c084fc' },
] as const

type AgentValue = typeof AGENTS[number]['value']

// ── Suggested starters per agent ───────────────────────────────────────────
const STARTERS: Record<AgentValue, string[]> = {
  general:   ['What is the best-performing sector this year?', 'How do I hedge against inflation?'],
  quant:     ['What is the Sharpe ratio of SPY vs QQQ?', 'Explain the VIX and how to use it'],
  macro:     ['How does the Fed rate affect tech stocks?', 'What does an inverted yield curve mean?'],
  sentiment: ['What is the current market sentiment?', 'Is now a good time to buy the dip?'],
  trend:     ['What are the top structural investment trends?', 'How is AI reshaping the market?'],
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
  const [open,         setOpen]         = useState(false)
  const [agent,        setAgent]        = useState<AgentValue>('general')
  const [messages,     setMessages]     = useState<Message[]>([])
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Greeting message when widget first opens
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

  const currentAgent = AGENTS.find(a => a.value === agent) ?? AGENTS[0]

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

      // FIXED: always use the flat shape; key_numbers always present from backend
      const reply      = data.reply ?? data.response?.answer ?? 'Analysis complete.'
      const keyNumbers = data.key_numbers ?? data.response?.key_numbers ?? {}
      const action     = data.action     ?? data.response?.recommended_action ?? ''

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

  // ── Toggle button ─────────────────────────────────────────────────────────
  const ToggleBtn = () => (
    <button
      onClick={() => setOpen(v => !v)}
      aria-label={open ? 'Close market chat' : 'Open market chat'}
      style={{
        width: 52, height: 52, borderRadius: '50%',
        background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 24px rgba(37,99,235,0.45)',
        fontSize: 22, transition: 'transform 0.15s',
        color: '#fff',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.0)' }}
    >
      {open ? '✕' : '💬'}
    </button>
  )

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12,
      fontFamily: "'Inter','system-ui',sans-serif",
    }}>
      {/* Chat panel */}
      {open && (
        <div style={{
          width: 360, height: 520,
          background: '#0d0d0d',
          border: '1px solid #1e1e1e',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          animation: 'slideUp 0.18s ease-out',
        }}>

          {/* Header */}
          <div style={{
            background: '#111', borderBottom: '1px solid #1e1e1e',
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{currentAgent.emoji}</span>
              <div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                  Neufin Market Intel
                </div>
                <div style={{ color: currentAgent.color, fontSize: 10, letterSpacing: 1 }}>
                  {currentAgent.label.toUpperCase()}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, padding: 2 }}
            >✕</button>
          </div>

          {/* Agent selector */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #181818', background: '#0f0f0f' }}>
            <select
              value={agent}
              onChange={e => setAgent(e.target.value as AgentValue)}
              style={{
                width: '100%', background: '#161616', border: '1px solid #2a2a2a',
                color: currentAgent.color, fontSize: 11, padding: '5px 8px',
                borderRadius: 6, cursor: 'pointer', outline: 'none',
                fontFamily: 'inherit',
              }}
            >
              {AGENTS.map(a => (
                <option key={a.value} value={a.value} style={{ background: '#161616', color: '#ccc' }}>
                  {a.emoji}  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Message thread */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {/* Suggested starters — only on greeting */}
            {messages.length === 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {STARTERS[agent].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    style={{
                      background: 'transparent',
                      border: `1px solid #2a2a2a`,
                      color: '#666', fontSize: 10, padding: '4px 9px',
                      borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'inherit', lineHeight: 1.4,
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => {
                      const b = e.currentTarget
                      b.style.borderColor = currentAgent.color + '80'
                      b.style.color       = currentAgent.color
                    }}
                    onMouseLeave={e => {
                      const b = e.currentTarget
                      b.style.borderColor = '#2a2a2a'
                      b.style.color       = '#666'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {/* Avatar label for assistant */}
                {msg.role === 'assistant' && !msg.loading && (
                  <span style={{
                    fontSize: 16, flexShrink: 0, marginTop: 2,
                  }}>
                    {AGENTS.find(a => a.value === msg.agent)?.emoji ?? '🤖'}
                  </span>
                )}

                <div style={{ maxWidth: '84%', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {msg.loading ? (
                    <div style={{
                      background: '#161616', border: '1px solid #222',
                      borderRadius: '4px 12px 12px 12px',
                      padding: '8px 12px', color: '#555', fontSize: 11,
                    }}>
                      <span style={{ animation: 'pulse 1s infinite', display: 'inline-block' }}>●</span>
                      {' '}Thinking…
                    </div>
                  ) : msg.role === 'user' ? (
                    <div style={{
                      background: 'linear-gradient(135deg, #1d3461 0%, #2a1a5e 100%)',
                      borderRadius: '12px 4px 12px 12px',
                      padding: '8px 12px', color: '#e0e0e0', fontSize: 12, lineHeight: 1.6,
                    }}>
                      {msg.text}
                    </div>
                  ) : (
                    <>
                      <div style={{
                        background: '#161616', border: '1px solid #1e1e1e',
                        borderRadius: '4px 12px 12px 12px',
                        padding: '8px 12px', color: '#d0d0d0', fontSize: 12, lineHeight: 1.7,
                      }}>
                        {msg.text}
                      </div>

                      {/* Key numbers */}
                      {/* FIXED: key_numbers always present; only render if non-empty */}
                      {msg.keyNumbers && Object.keys(msg.keyNumbers).length > 0 && (
                        <div style={{
                          background: '#0f0f0f', border: '1px solid #1e1e1e',
                          borderRadius: 6, padding: '6px 10px',
                          display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
                        }}>
                          {Object.entries(msg.keyNumbers).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <span style={{ color: '#555', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>{k}:</span>
                              <span style={{ color: currentAgent.color, fontSize: 11, fontWeight: 700 }}>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action */}
                      {msg.action && (
                        <div style={{
                          borderLeft: `2px solid ${currentAgent.color}`,
                          paddingLeft: 8, color: currentAgent.color, fontSize: 10, lineHeight: 1.5,
                        }}>
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
          <div style={{
            borderTop: '1px solid #1a1a1a', padding: '8px 12px',
            display: 'flex', gap: 8, alignItems: 'center',
            background: '#0d0d0d',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              placeholder="Ask about markets, trends, risk…"
              style={{
                flex: 1, background: '#161616', border: '1px solid #2a2a2a',
                borderRadius: 8, outline: 'none',
                color: '#e0e0e0', fontSize: 11, padding: '7px 10px',
                fontFamily: 'inherit', caretColor: currentAgent.color,
                transition: 'border-color 0.12s',
              }}
              onFocus={e  => { e.currentTarget.style.borderColor = currentAgent.color + '60' }}
              onBlur={e   => { e.currentTarget.style.borderColor = '#2a2a2a' }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{
                background:   input.trim() && !loading ? currentAgent.color : 'transparent',
                border:       `1px solid ${input.trim() && !loading ? currentAgent.color : '#333'}`,
                borderRadius: 8,
                color:        input.trim() && !loading ? '#000' : '#444',
                fontSize: 11, fontWeight: 700,
                padding: '7px 13px', cursor: input.trim() && !loading ? 'pointer' : 'default',
                fontFamily: 'inherit', transition: 'all 0.12s',
                flexShrink: 0,
              }}
            >
              {loading ? '…' : '↑'}
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <ToggleBtn />

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
