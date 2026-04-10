'use client'

import { useMemo, useState } from 'react'
import { Bot, ChevronLeft, Loader2, Send } from 'lucide-react'
import { apiPost } from '@/lib/api-client'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const STARTER_PROMPTS = [
  'What is the current market regime?',
  'What are the risks in my portfolio?',
  'What should I focus on today?',
] as const

export function MarketDeskRail({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Market Desk is ready. Ask for today’s regime, risks, or portfolio priorities.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const canSend = input.trim().length > 0 && !loading

  const widthClass = open ? 'w-[320px]' : 'w-12'

  const sendMessage = async (raw: string) => {
    const text = raw.trim()
    if (!text || loading) return
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const data = await apiPost<Record<string, unknown>>('/api/swarm/chat', {
        message: text,
        context: 'dashboard',
      })
      const reply =
        (typeof data.reply === 'string' && data.reply) ||
        (typeof data.answer === 'string' && data.answer) ||
        (typeof data.message === 'string' && data.message) ||
        'Market Desk could not parse a response right now.'
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: 'I hit a temporary issue. Please try again in a few seconds.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const title = useMemo(() => (open ? 'Market Desk · Ask anything' : 'Open Market Desk'), [open])

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col border-l border-[hsl(var(--border)/0.5)] bg-sidebar transition-all duration-200 ${widthClass}`}
      aria-label={title}
    >
      <button
        type="button"
        onClick={onToggle}
        className="m-2 flex h-8 items-center justify-center rounded-md border border-[hsl(var(--border)/0.6)] text-muted-foreground hover:text-foreground"
        aria-label={title}
      >
        {open ? <ChevronLeft className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </button>

      {open ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <div className="mb-2 px-1">
            <h3 className="text-sm font-semibold text-foreground">Market Desk · Ask anything</h3>
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary hover:bg-primary/20"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-[hsl(var(--border)/0.45)] bg-surface/40 p-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-md px-2.5 py-2 text-xs leading-relaxed ${
                  m.role === 'assistant'
                    ? 'bg-primary/10 text-foreground'
                    : 'bg-[hsl(var(--surface-2))] text-foreground'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 px-2.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking...
              </div>
            ) : null}
          </div>

          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void sendMessage(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Market Desk..."
              className="h-9 flex-1 rounded-md border border-[hsl(var(--border)/0.6)] bg-background px-3 text-xs outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/15 text-primary disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  )
}
