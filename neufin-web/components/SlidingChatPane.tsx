"use client";

/**
 * SlidingChatPane — Managing Director Q&A drawer
 *
 * Light institutional chrome (header, suggested prompts, input rail) matches
 * the dashboard shell. The transcript area stays terminal-dark for readability
 * of streamed MD-style replies.
 */

import React, { useState, useEffect, useRef, KeyboardEvent } from "react";
import { Send, X, Bot, User } from "lucide-react";
import { ActionCard } from "@/components/ActionCard";

interface Position {
  symbol: string;
  shares: number;
  price: number;
  value: number;
  weight: number;
}

interface KeyNumbers {
  [metric: string]: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  agent?: string;
  keyNumbers?: KeyNumbers;
  action?: string;
  steps?: string[];
  error?: boolean;
}

export interface SlidingChatPaneProps {
  isOpen: boolean;
  onClose: () => void;
  recordId?: string | null;
  thesisContext?: Record<string, unknown>;
  positions?: Position[];
  totalValue?: number;
  apiBase?: string;
}

const MONO = "'Fira Code','JetBrains Mono','ui-monospace',monospace";
const TRANS_BG = "#0B0F14";
const TRANS_BORDER = "#1e293b";
const TRANS_MUTED = "#94a3b8";
const TRANS_ACCENT = "#F5A623";

const SUGGESTED_QUESTIONS = [
  "What is my biggest tail risk right now?",
  "Why is my portfolio underperforming SPY?",
  "Which position should I trim first?",
  "How exposed am I to a rate hike?",
  "Walk me through the worst stress scenario.",
  "What tax moves should I make before year-end?",
];

function useTypewriter(text: string, active: boolean, speed = 14): string {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!active || !text) {
      setDisplayed(text);
      return;
    }
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return displayed;
}

function StreamingBubble({ msg }: { msg: Message }) {
  const displayed = useTypewriter(msg.content, !!msg.streaming, 12);
  const text = msg.streaming ? displayed : msg.content;
  const isDone = !msg.streaming || displayed.length >= msg.content.length;

  return (
    <div className="flex justify-start gap-2">
      <div
        className="mt-1 h-fit flex-shrink-0 px-1 py-0.5 text-xs font-bold uppercase tracking-wider"
        style={{
          border: `1px solid ${TRANS_ACCENT}66`,
          color: TRANS_ACCENT,
          fontFamily: MONO,
        }}
      >
        {msg.agent ? msg.agent.toUpperCase().slice(0, 2) : "MD"}
      </div>

      <div className="flex max-w-[88%] flex-1 flex-col gap-2">
        <div
          className="px-2.5 py-2 text-sm leading-relaxed"
          style={{
            background: "#0f1419",
            border: `1px solid ${msg.error ? "#ef4444" : TRANS_BORDER}`,
            color: msg.error ? "#fca5a5" : TRANS_MUTED,
            fontFamily: MONO,
          }}
        >
          {text}
          {msg.streaming && !isDone && (
            <span className="animate-pulse" style={{ color: TRANS_ACCENT }}>
              █
            </span>
          )}
        </div>

        {isDone && msg.keyNumbers && Object.keys(msg.keyNumbers).length > 0 && (
          <div
            className="flex flex-wrap gap-x-3.5 gap-y-1 px-2 py-1.5"
            style={{
              background: "#080d12",
              border: `1px solid ${TRANS_BORDER}`,
              fontFamily: MONO,
            }}
          >
            {Object.entries(msg.keyNumbers).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  {k}:
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: TRANS_ACCENT }}
                >
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        )}

        {isDone && msg.action && (
          <div style={{ fontFamily: MONO }}>
            <ActionCard raw={msg.action} />
          </div>
        )}

        {isDone && msg.steps && msg.steps.length > 0 && (
          <details className="text-xs" style={{ fontFamily: MONO }}>
            <summary className="cursor-pointer uppercase tracking-wide text-slate-600">
              {msg.steps.length} reasoning steps
            </summary>
            <div className="mt-1 flex flex-col gap-0.5 text-slate-600">
              {msg.steps.map((s, i) => (
                <div key={i}>{s}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export function SlidingChatPane({
  isOpen,
  onClose,
  recordId,
  thesisContext,
  positions,
  totalValue,
}: SlidingChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "IC system online. I'm the Managing Director — I've reviewed the swarm's stress tests and risk clusters. Ask me anything about this portfolio's risk exposure, tax position, or regime sensitivity.",
      agent: "MD",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggested, setShowSuggested] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    setInput("");
    setShowSuggested(false);
    setLoading(true);

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "...", agent: "MD", streaming: false },
    ]);

    try {
      const body: Record<string, unknown> = { message: q };
      if (thesisContext) body.thesis_context = thesisContext;
      if (recordId) body.record_id = recordId;
      if (positions?.length) body.positions = positions;
      if (totalValue !== undefined) body.total_value = totalValue;

      const res = await fetch("/api/swarm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as Record<string, unknown>;
      const reply =
        (data.reply as string) ??
        (data.response as Record<string, string>)?.answer ??
        "Analysis complete.";
      const keyNumbers =
        (data.key_numbers as KeyNumbers) ??
        (data.response as Record<string, KeyNumbers>)?.key_numbers ??
        {};
      const action =
        (data.action as string) ??
        (data.response as Record<string, string>)?.recommended_action ??
        "";
      const agent = (data.agent as string) ?? "MD";
      const steps = (data.thinking_steps as string[]) ?? [];

      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: reply,
          agent,
          keyNumbers,
          action,
          steps,
          streaming: true,
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: `Connection error: ${msg}`,
          agent: "SYS",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-navy/40 backdrop-blur-[1px]"
          aria-label="Close panel"
          onClick={onClose}
        />
      )}

      <div
        className="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-white shadow-xl transition-transform duration-300 ease-out"
        style={{
          width: 420,
          maxWidth: "100vw",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border-light bg-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">
                Managing Director
              </span>
              <span className="text-sm font-medium uppercase tracking-wide text-muted2">
                IC Q&amp;A
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {recordId && (
              <span className="hidden font-mono text-sm text-muted2 sm:inline">
                #{recordId.slice(0, 8)}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted2 transition-colors hover:bg-surface-3 hover:text-navy"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {showSuggested && (
          <div className="shrink-0 border-b border-border-light bg-white px-4 py-2">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted2">
              Suggested questions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void send(q)}
                  className="max-w-full rounded border border-border bg-surface-2 px-2 py-1 text-left text-sm text-slate2 transition-colors hover:border-primary/40 hover:text-primary-dark"
                  style={{ fontFamily: MONO }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          style={{ background: TRANS_BG, scrollbarWidth: "thin" }}
        >
          <div className="flex flex-col gap-4">
            {messages.map((msg, idx) =>
              msg.role === "user" ? (
                <div key={idx} className="flex justify-end gap-2">
                  <div
                    className="max-w-[85%] px-2.5 py-2 text-sm leading-relaxed text-slate-300"
                    style={{
                      background: "#0f1419",
                      border: `1px solid ${TRANS_BORDER}`,
                      fontFamily: MONO,
                    }}
                  >
                    <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-600">
                      <User className="h-3 w-3" /> You
                    </div>
                    {msg.content}
                  </div>
                </div>
              ) : (
                <StreamingBubble key={idx} msg={msg} />
              ),
            )}

            {loading && (
              <div
                className="flex items-center gap-2 text-sm"
                style={{ fontFamily: MONO, color: TRANS_MUTED }}
              >
                <span
                  className="shrink-0 px-1 py-0.5 text-xs font-bold uppercase tracking-wider text-primary"
                  style={{ border: `1px solid ${TRANS_ACCENT}44` }}
                >
                  MD
                </span>
                <span className="animate-pulse text-primary-dark">
                  Reviewing analysis…
                </span>
              </div>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-border-light bg-surface-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-primary" aria-hidden>
              ›
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about risk, a ticker, or a scenario…"
              disabled={loading}
              className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-navy outline-none ring-primary focus:ring-1 disabled:opacity-50"
              style={{ fontFamily: MONO }}
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-md border border-border p-2 text-muted2 transition-colors enabled:border-primary enabled:text-primary-dark enabled:hover:bg-primary-light disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div
            className="mt-1.5 flex justify-between text-sm text-muted2"
            style={{ fontFamily: MONO }}
          >
            <span>
              {thesisContext
                ? "Thesis loaded"
                : recordId
                  ? `Report ${recordId.slice(0, 8)}`
                  : "Demo mode"}
            </span>
            <span>Enter to send</span>
          </div>
        </footer>
      </div>
    </>
  );
}

export default SlidingChatPane;
