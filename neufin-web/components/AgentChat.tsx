"use client";

/**
 * AgentChat.tsx — Managing Director Q&A panel.
 *
 * Calls POST /api/swarm/chat with the user's question + portfolio positions.
 * Displays the routed agent name, thinking steps, answer, key numbers,
 * and recommended action.
 *
 * Design: dark analysis panel — compact monospace, readable 12px+ body.
 */

import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { apiFetch } from "@/lib/api-client";
import { ActionCard } from "@/components/ActionCard";

const MONO = "'Fira Code','JetBrains Mono','Courier New',monospace";
const A = "#F5A623";
const G = "#22c55e";
const R = "#ef4444";
const DIM = "#64748b";
const BODY = "#e2e8f0";

// Agent colour map (mirrors SwarmTerminal)
const AGENT_COLORS: Record<string, string> = {
  tax: "#34d399",
  quant: "#1EB8CC",
  macro: "#60a5fa",
  strategist: "#60a5fa",
  synthesis: "#94a3b8",
  default: BODY,
};

interface Position {
  symbol: string;
  shares: number;
  price: number;
  value: number;
  weight: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  agent?: string;
  keyNumbers?: Record<string, string>;
  action?: string;
  steps?: string[];
  loading?: boolean;
}

interface AgentChatProps {
  thesis: Record<string, any>;
  positions: Position[];
  totalValue: number;
  apiBase: string;
  onClose: () => void;
  /** Hide terminal header when embedded in Copilot rail */
  embedded?: boolean;
  /** One-shot quick fill — use a new `id` each click so the same label can re-apply */
  quickFill?: { id: number; text: string } | null;
  onQuickFillConsumed?: () => void;
  /** Copilot rail: drive agent status dots while a message is in flight */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

// Suggested prompts seeded from common thesis risks
const SUGGESTED = [
  "Why is my portfolio fragile in a rate shock?",
  "What is my biggest single-stock concentration risk?",
  "How would a 2008-style crash affect my holdings?",
  "What tax harvesting moves should I make now?",
  "Explain my alpha gap vs SPY",
];

export default function AgentChat({
  thesis,
  positions,
  totalValue,
  apiBase,
  onClose,
  embedded = false,
  quickFill,
  onQuickFillConsumed,
  onBusyChange,
  className,
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: `IC system online. I'm your Managing Director — ask me anything about this portfolio's risks, tax position, or macro exposure.`,
      agent: "synthesis",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (quickFill) {
      setInput(quickFill.text);
      onQuickFillConsumed?.();
    }
  }, [quickFill, onQuickFillConsumed]);

  const send = async (question: string) => {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    onBusyChange?.(true);

    // Optimistic loading placeholder
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", loading: true },
    ]);

    try {
      const savedReportId =
        typeof window !== "undefined"
          ? localStorage.getItem("neufin-swarm-report-id")
          : null;
      const body: Record<string, unknown> = { message: q };
      if (positions.length > 0) {
        body.positions = positions;
        body.total_value = totalValue;
      } else if (savedReportId) {
        body.record_id = savedReportId;
      }

      const res = await apiFetch("/api/swarm/chat", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const resp = data.response ?? {};

      setMessages((prev) => [
        ...prev.slice(0, -1), // remove loading placeholder
        {
          role: "assistant",
          agent: data.agent ?? "synthesis",
          text: resp.answer ?? "Analysis complete.",
          keyNumbers: resp.key_numbers ?? {},
          action: resp.recommended_action ?? undefined,
          steps: data.thinking_steps ?? [],
        },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", agent: "default", text: `Error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        fontFamily: MONO,
        background: "#0a0a0a",
      }}
    >
      {/* Header */}
      {!embedded ? (
        <div
          style={{
            background: "#111",
            borderBottom: `1px solid #222`,
            padding: "7px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                color: A,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Managing Director
            </span>
            <span style={{ color: DIM, fontSize: 12 }}>|</span>
            <span
              style={{
                color: DIM,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              IC Q&amp;A
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: DIM,
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Suggested prompts — only shown when just the greeting is present */}
      {messages.length === 1 && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: `1px solid #1a1a1a`,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {SUGGESTED.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              style={{
                background: "transparent",
                border: `1px solid #2a2a2a`,
                color: "#94a3b8",
                fontSize: 12,
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: MONO,
                textAlign: "left",
                textTransform: "none",
                letterSpacing: 0,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.borderColor = `${A}66`;
                (e.target as HTMLButtonElement).style.color = A;
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.borderColor = "#2a2a2a";
                (e.target as HTMLButtonElement).style.color = "#666";
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          scrollbarWidth: "thin",
          scrollbarColor: "#2a2a2a #0a0a0a",
        }}
      >
        {messages.map((msg, idx) => (
          <div key={idx}>
            {msg.role === "user" ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    background: "#161616",
                    border: `1px solid #2a2a2a`,
                    color: BODY,
                    fontSize: 13,
                    padding: "8px 12px",
                    maxWidth: "85%",
                    lineHeight: 1.6,
                  }}
                >
                  {msg.text}
                </div>
                <span
                  style={{
                    color: DIM,
                    fontSize: 11,
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                >
                  You
                </span>
              </div>
            ) : (
              <div
                style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
              >
                <span
                  style={{
                    color: AGENT_COLORS[msg.agent ?? "default"] ?? BODY,
                    fontSize: 11,
                    fontWeight: 700,
                    marginTop: 3,
                    flexShrink: 0,
                    border: `1px solid ${AGENT_COLORS[msg.agent ?? "default"] ?? BODY}40`,
                    padding: "1px 4px",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {msg.agent ? msg.agent.toUpperCase().slice(0, 5) : "MD"}
                </span>

                {msg.loading ? (
                  <span style={{ color: A, fontSize: 12 }}>Analysing…</span>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {/* Answer */}
                    <p
                      style={{
                        color: BODY,
                        fontSize: 13,
                        lineHeight: 1.65,
                        margin: 0,
                      }}
                    >
                      {msg.text}
                    </p>

                    {/* Key numbers */}
                    {msg.keyNumbers &&
                      Object.keys(msg.keyNumbers).length > 0 && (
                        <div
                          style={{
                            background: "#0f0f0f",
                            border: `1px solid #1e1e1e`,
                            padding: "5px 8px",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px 16px",
                          }}
                        >
                          {Object.entries(msg.keyNumbers).map(([k, v]) => (
                            <div
                              key={k}
                              style={{
                                display: "flex",
                                gap: 5,
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  color: DIM,
                                  fontSize: 11,
                                  textTransform: "uppercase",
                                  letterSpacing: 0.06,
                                }}
                              >
                                {k}:
                              </span>
                              <span
                                style={{
                                  color: A,
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                {String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                    {/* Recommended action */}
                    {msg.action && (
                      <div style={{ maxWidth: "100%" }}>
                        <ActionCard raw={msg.action} />
                      </div>
                    )}

                    {/* Thinking steps (collapsed by default, toggle on click) */}
                    {msg.steps && msg.steps.length > 0 && (
                      <details style={{ cursor: "pointer" }}>
                        <summary
                          style={{
                            color: DIM,
                            fontSize: 11,
                            letterSpacing: 0.06,
                            textTransform: "uppercase",
                            listStyle: "none",
                          }}
                        >
                          {msg.steps.length} thinking steps
                        </summary>
                        <div
                          style={{
                            paddingTop: 4,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {msg.steps.map((s, i) => (
                            <div
                              key={i}
                              style={{
                                color: "#94a3b8",
                                fontSize: 12,
                                lineHeight: 1.5,
                              }}
                            >
                              {s}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: `1px solid #1e1e1e`,
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexShrink: 0,
          background: "#0d0d0d",
        }}
      >
        <span style={{ color: A, fontSize: 11, flexShrink: 0 }}>›</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the Managing Director..."
          disabled={loading}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: BODY,
            fontSize: 10,
            fontFamily: MONO,
            caretColor: A,
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            background: "transparent",
            border: `1px solid ${input.trim() && !loading ? A : "#333"}`,
            color: input.trim() && !loading ? A : "#333",
            fontSize: 12,
            padding: "4px 10px",
            cursor: "pointer",
            fontFamily: MONO,
            textTransform: "uppercase",
            letterSpacing: 1,
            transition: "all 0.15s",
          }}
        >
          {loading ? "..." : "SEND"}
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        details summary::-webkit-details-marker { display: none; }
      `}</style>
    </div>
  );
}
