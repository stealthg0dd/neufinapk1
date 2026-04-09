'use client'

/**
 * SlidingChatPane.tsx — Bloomberg Terminal Managing Director Chat
 *
 * Full-height right-side drawer that slides in from the right.
 * Calls POST /api/swarm/chat with thesis_context + record_id for rich MD responses.
 * Streams the assistant reply character-by-character for a live terminal feel.
 *
 * Bloomberg style: #0D0D0D bg, #FFB900 amber, Fira Code monospace, NO rounded corners.
 */

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Send, X, Bot, User, ChevronDown } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Position {
  symbol: string
  shares: number
  price:  number
  value:  number
  weight: number
}

interface KeyNumbers { [metric: string]: string }

interface Message {
  role:        'user' | 'assistant'
  content:     string
  streaming?:  boolean   // true while typewriter is in progress
  agent?:      string
  keyNumbers?: KeyNumbers
  action?:     string
  steps?:      string[]
  error?:      boolean
}

export interface SlidingChatPaneProps {
  isOpen:       boolean
  onClose:      () => void
  recordId?:    string | null            // ties chat to a specific analysis
  thesisContext?: Record<string, any>   // full thesis blob for zero-latency context
  positions?:   Position[]              // guest fallback
  totalValue?:  number
  apiBase?:     string
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MONO = "'Fira Code','JetBrains Mono','Courier New',monospace"

const SUGGESTED_QUESTIONS = [
  'What is my biggest tail risk right now?',
  'Why is my portfolio underperforming SPY?',
  'Which position should I trim first?',
  'How exposed am I to a rate hike?',
  'Walk me through the worst stress scenario.',
  'What tax moves should I make before year-end?',
]

// ── Typewriter hook ────────────────────────────────────────────────────────────
function useTypewriter(text: string, active: boolean, speed = 14): string {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    if (!active || !text) { setDisplayed(text); return }
    setDisplayed('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [text, active, speed])

  return displayed
}

// ── StreamingBubble — renders a single assistant message with typewriter ───────
function StreamingBubble({ msg }: { msg: Message }) {
  const displayed = useTypewriter(msg.content, !!msg.streaming, 12)
  const text = msg.streaming ? displayed : msg.content
  const isDone = !msg.streaming || displayed.length >= msg.content.length

  return (
    <div className="flex justify-start gap-2">
      <div
        className="flex-shrink-0 mt-1"
        style={{
          border: '1px solid #FFB90040',
          color: '#FFB900', fontSize: 8, fontWeight: 700,
          padding: '1px 4px', textTransform: 'uppercase',
          letterSpacing: 1, height: 'fit-content',
          fontFamily: MONO,
        }}
      >
        {msg.agent ? msg.agent.toUpperCase().slice(0, 2) : 'MD'}
      </div>

      <div className="flex-1 flex flex-col gap-2 max-w-[88%]">
        {/* Main reply text */}
        <div
          style={{
            background: '#0f0f0f',
            border: `1px solid ${msg.error ? '#FF4444' : '#1e1e1e'}`,
            padding: '8px 10px',
            color: msg.error ? '#FF4444' : '#C8C8C8',
            fontSize: 10, lineHeight: 1.7, fontFamily: MONO,
          }}
        >
          {text}
          {msg.streaming && !isDone && (
            <span style={{ color: '#FFB900', animation: 'blink 0.8s step-end infinite' }}>█</span>
          )}
        </div>

        {/* Key numbers grid */}
        {isDone && msg.keyNumbers && Object.keys(msg.keyNumbers).length > 0 && (
          <div
            style={{
              background: '#080808', border: '1px solid #1a1a1a',
              padding: '5px 8px', display: 'flex', flexWrap: 'wrap', gap: '3px 14px',
            }}
          >
            {Object.entries(msg.keyNumbers).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ color: '#444', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, fontFamily: MONO }}>{k}:</span>
                <span style={{ color: '#FFB900', fontSize: 10, fontWeight: 700, fontFamily: MONO }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recommended action */}
        {isDone && msg.action && (
          <div
            style={{
              borderLeft: '2px solid #00FF00',
              paddingLeft: 8, color: '#00FF00',
              fontSize: 9, fontFamily: MONO, lineHeight: 1.5,
            }}
          >
            ▶ {msg.action}
          </div>
        )}

        {/* Thinking steps (collapsible) */}
        {isDone && msg.steps && msg.steps.length > 0 && (
          <details>
            <summary
              style={{
                color: '#333', fontSize: 8, letterSpacing: 1,
                textTransform: 'uppercase', cursor: 'pointer',
                listStyle: 'none', fontFamily: MONO,
              }}
            >
              ▸ {msg.steps.length} thinking steps
            </summary>
            <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {msg.steps.map((s, i) => (
                <div key={i} style={{ color: '#333', fontSize: 8, lineHeight: 1.5, fontFamily: MONO }}>{s}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function SlidingChatPane({
  isOpen,
  onClose,
  recordId,
  thesisContext,
  positions,
  totalValue,
  apiBase,
}: SlidingChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>([{
    role:    'assistant',
    content: "IC system online. I'm the Managing Director — I've reviewed the swarm's stress tests and risk clusters. Ask me anything about this portfolio's risk exposure, tax position, or regime sensitivity.",
    agent:   'MD',
  }])
  const [input,          setInput]         = useState('')
  const [loading,        setLoading]       = useState(false)
  const [showSuggested,  setShowSuggested] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // ── Send ────────────────────────────────────────────────────────────────────
  const send = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return

    setInput('')
    setShowSuggested(false)
    setLoading(true)

    setMessages(prev => [...prev, { role: 'user', content: q }])

    // Placeholder while waiting for API
    setMessages(prev => [...prev, {
      role: 'assistant', content: '...', agent: 'MD', streaming: false,
    }])

    try {
      const body: Record<string, any> = { message: q }
      if (thesisContext)          body.thesis_context = thesisContext
      if (recordId)               body.record_id      = recordId
      if (positions?.length)      body.positions      = positions
      if (totalValue !== undefined) body.total_value  = totalValue

      const res = await fetch('/api/swarm/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()

      // Normalise both response shapes (MD path vs legacy specialist-agent path)
      const reply      = data.reply      ?? data.response?.answer ?? 'Analysis complete.'
      const keyNumbers = data.key_numbers ?? data.response?.key_numbers ?? {}
      const action     = data.action      ?? data.response?.recommended_action ?? ''
      const agent      = data.agent       ?? 'MD'
      const steps      = data.thinking_steps ?? []

      setMessages(prev => [
        ...prev.slice(0, -1),    // remove placeholder
        {
          role: 'assistant',
          content: reply,
          agent, keyNumbers, action, steps,
          streaming: true,       // triggers typewriter
        },
      ])
    } catch (e: any) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant', content: `Connection error: ${e.message}`,
          agent: 'SYS', error: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop (subtle) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={onClose}
        />
      )}

      {/* Pane */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{
          width: 420,
          background: '#0D0D0D',
          borderLeft: '1px solid #FFB90033',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          fontFamily: MONO,
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            background: '#111', borderBottom: '1px solid #1e1e1e',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={14} color="#FFB900" />
            <span style={{ color: '#FFB900', fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
              Managing Director
            </span>
            <span style={{ color: '#333', fontSize: 9 }}>|</span>
            <span style={{ color: '#444', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>
              IC Q&amp;A
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {recordId && (
              <span style={{ color: '#333', fontSize: 8, letterSpacing: 1 }}>
                #{recordId.slice(0, 8)}
              </span>
            )}
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', padding: 2 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Suggested prompts ───────────────────────────────────────────── */}
        {showSuggested && (
          <div
            style={{
              padding: '8px 14px 6px',
              borderBottom: '1px solid #151515',
              flexShrink: 0,
            }}
          >
            <div style={{ color: '#333', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
              Suggested questions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => send(q)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #1e1e1e',
                    color: '#555', fontSize: 8,
                    padding: '3px 7px',
                    cursor: 'pointer', fontFamily: MONO,
                    textAlign: 'left', transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => {
                    const b = e.currentTarget
                    b.style.borderColor = '#FFB90066'
                    b.style.color = '#FFB900'
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget
                    b.style.borderColor = '#1e1e1e'
                    b.style.color = '#555'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Message thread ───────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto',
            padding: '14px',
            display: 'flex', flexDirection: 'column', gap: 16,
            scrollbarWidth: 'thin', scrollbarColor: '#1e1e1e #0d0d0d',
          }}
        >
          {messages.map((msg, idx) =>
            msg.role === 'user' ? (
              /* User bubble */
              <div key={idx} className="flex justify-end gap-2">
                <div
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #1a2a1a',
                    color: '#C8C8C8',
                    fontSize: 10, lineHeight: 1.6,
                    padding: '7px 10px',
                    maxWidth: '85%', fontFamily: MONO,
                  }}
                >
                  <div style={{ color: '#2a4a2a', fontSize: 8, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <User size={8} /> YOU
                  </div>
                  {msg.content}
                </div>
              </div>
            ) : (
              /* Assistant bubble — streaming */
              <StreamingBubble key={idx} msg={msg} />
            )
          )}

          {/* Typing indicator (shown while fetch is in-flight, before streaming starts) */}
          {loading && (
            <div className="flex gap-2 items-center">
              <div
                style={{
                  border: '1px solid #FFB90040', color: '#FFB900',
                  fontSize: 8, fontWeight: 700, padding: '1px 4px',
                  textTransform: 'uppercase', letterSpacing: 1, fontFamily: MONO,
                  flexShrink: 0,
                }}
              >
                MD
              </div>
              <span style={{ color: '#333', fontSize: 9, fontFamily: MONO }}>
                <span style={{ animation: 'mdBlink 1s step-end infinite' }}>●</span>{' '}
                Reviewing analysis...
              </span>
            </div>
          )}

          <div style={{ height: 4 }} />
        </div>

        {/* ── Input bar ────────────────────────────────────────────────────── */}
        <div
          style={{
            borderTop: '1px solid #1a1a1a',
            padding: '10px 14px',
            background: '#0a0a0a',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#FFB900', fontSize: 12, flexShrink: 0 }}>›</span>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about a specific risk, ticker, or scenario..."
              disabled={loading}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#C8C8C8', fontSize: 10,
                fontFamily: MONO,
                caretColor: '#FFB900',
                opacity: loading ? 0.5 : 1,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{
                background: 'transparent',
                border: `1px solid ${input.trim() && !loading ? '#FFB900' : '#222'}`,
                color: input.trim() && !loading ? '#FFB900' : '#333',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                padding: '4px 8px',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              <Send size={12} />
            </button>
          </div>

          {/* Status strip */}
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#222', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, fontFamily: MONO }}>
              {thesisContext ? '◉ THESIS LOADED' : recordId ? `◉ RPT ${recordId.slice(0,8)}` : '○ DEMO MODE'}
            </span>
            <span style={{ color: '#222', fontSize: 8, fontFamily: MONO }}>ENTER to send</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes mdBlink  { 0%,100%{opacity:1} 50%{opacity:0.2} }
        details summary::-webkit-details-marker { display: none; }
      `}</style>
    </>
  )
}

export default SlidingChatPane
