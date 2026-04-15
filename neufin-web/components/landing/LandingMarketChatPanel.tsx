"use client";

/**
 * Full-width landing chat — same backend as GlobalChatWidget (POST /api/swarm/global-chat).
 * Inline panel so visitors can run prompts without a floating corner widget.
 */

import React, { useState, useRef, useEffect, KeyboardEvent } from "react";

const AGENTS = [
  {
    value: "general",
    label: "General",
    fullLabel: "General Agent",
    mono: "GN",
    color: "text-primary",
    accent: "border-primary/50",
    ring: "ring-primary/30",
  },
  {
    value: "quant",
    label: "Quant",
    fullLabel: "Quant Agent",
    mono: "QT",
    color: "text-warning",
    accent: "border-warning/50",
    ring: "ring-warning/30",
  },
  {
    value: "macro",
    label: "Macro",
    fullLabel: "Macro Strategist",
    mono: "MC",
    color: "text-positive",
    accent: "border-positive/50",
    ring: "ring-positive/30",
  },
  {
    value: "technical",
    label: "Technical",
    fullLabel: "Technical Analyst",
    mono: "TA",
    color: "text-accent",
    accent: "border-accent/50",
    ring: "ring-accent/30",
  },
] as const;

type AgentValue = (typeof AGENTS)[number]["value"];

const STARTERS: Record<AgentValue, string[]> = {
  general: [
    "What is the best-performing sector this year?",
    "How do I hedge against inflation?",
  ],
  quant: [
    "What is the Sharpe ratio of SPY vs QQQ?",
    "Explain the VIX and how to use it",
  ],
  macro: [
    "How does the Fed rate affect tech stocks?",
    "What does an inverted yield curve mean?",
  ],
  technical: [
    "What are key support levels for SPY?",
    "How do I identify a breakout pattern?",
  ],
};

interface Message {
  role: "user" | "assistant";
  text: string;
  keyNumbers?: Record<string, string>;
  action?: string;
  agent?: string;
  loading?: boolean;
}

export default function LandingMarketChatPanel() {
  const [agent, setAgent] = useState<AgentValue>("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  const currentAgent = AGENTS.find((a) => a.value === agent) ?? AGENTS[0];

  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      setMessages([
        {
          role: "assistant",
          text: "Ask anything about markets, portfolio psychology, or macro — no upload required. Pick an agent and run a prompt below.",
          agent: "general",
        },
      ]);
    }
  }, []);

  useEffect(() => {
    // Only auto-scroll when the user has sent at least one message,
    // not on the initial assistant seed (which would scroll the landing page down).
    const hasUserMessage = messages.some((m) => m.role === "user");
    if (hasUserMessage) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const send = async (question: string) => {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", agent, loading: true },
    ]);

    try {
      const res = await fetch("/api/swarm/global-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, agent_type: agent }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply = data.reply ?? data.response?.answer ?? "Analysis complete.";
      const keyNumbers = data.key_numbers ?? data.response?.key_numbers ?? {};
      const action = data.action ?? data.response?.recommended_action ?? "";

      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          agent: data.agent ?? agent,
          text: reply,
          keyNumbers,
          action,
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          agent,
          text: `Connection error — please try again. (${msg})`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <section
      className="border-y border-border/40 bg-surface/20 py-section"
      aria-labelledby="landing-chat-heading"
    >
      <div className="mx-auto max-w-4xl px-6">
        <p className="text-center font-mono text-sm uppercase tracking-widest text-primary">
          Market intelligence
        </p>
        <h2
          id="landing-chat-heading"
          className="mt-2 text-center text-2xl font-bold text-foreground md:text-3xl"
        >
          Ask Neufin anything
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          Multi-agent answers for research-style questions. Use the prompts or
          type your own.
        </p>

        <div className="mt-8 flex min-h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="agent-badge">{currentAgent.mono}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  Neufin market desk
                </p>
                <p
                  className={`truncate text-sm uppercase tracking-widest ${currentAgent.color}`}
                >
                  {currentAgent.fullLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-1 border-b border-border bg-background/40 px-2 py-2">
            {AGENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAgent(a.value)}
                className={`flex-1 rounded-md border py-2 text-sm font-medium transition-all sm:text-sm ${
                  agent === a.value
                    ? `bg-surface-2 ${a.color} ${a.accent}`
                    : "border-transparent text-muted-foreground hover:bg-surface-2/80 hover:text-foreground"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2">
                {STARTERS[agent].map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "items-start justify-start"}`}
              >
                {msg.role === "assistant" && !msg.loading && (
                  <span className="agent-badge mt-0.5 shrink-0">
                    {AGENTS.find((a) => a.value === msg.agent)?.mono ?? "GN"}
                  </span>
                )}
                <div className="max-w-[90%] sm:max-w-[85%]">
                  {msg.loading ? (
                    <div className="rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
                      <span className="animate-pulse">●</span> Thinking…
                    </div>
                  ) : msg.role === "user" ? (
                    <div className="rounded-2xl rounded-br-sm border border-primary/25 bg-primary/10 px-3 py-2 text-sm leading-relaxed text-foreground">
                      {msg.text}
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-3 py-2 text-sm leading-relaxed text-foreground/95">
                        {msg.text}
                      </div>
                      {msg.keyNumbers &&
                        Object.keys(msg.keyNumbers).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-background/50 px-3 py-2">
                            {Object.entries(msg.keyNumbers).map(([k, v]) => (
                              <div
                                key={k}
                                className="flex items-center gap-1.5"
                              >
                                <span className="text-sm uppercase tracking-wider text-muted-foreground">
                                  {k}:
                                </span>
                                <span
                                  className={`text-sm font-semibold tabular-nums ${currentAgent.color}`}
                                >
                                  {String(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      {msg.action ? (
                        <div
                          className={`mt-2 border-l-2 pl-2.5 text-sm leading-relaxed ${currentAgent.accent} ${currentAgent.color}`}
                        >
                          ▶ {msg.action}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border bg-surface-2/80 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading}
                rows={2}
                placeholder="Ask about markets, risk, or run a research prompt…"
                className="min-h-[44px] flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={loading || !input.trim()}
                className="h-11 shrink-0 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "…" : "Send"}
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground/70">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
