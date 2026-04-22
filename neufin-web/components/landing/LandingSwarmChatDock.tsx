"use client";

/**
 * Landing-only floating swarm demo — POST /api/swarm/global-chat (same as GlobalChatWidget).
 * Light glass shell; simulates agent handoffs while the backend responds.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { ActionCard } from "@/components/ActionCard";

const STARTERS = [
  "What does the 7-agent swarm do?",
  "How is NeuFin different from a robo-advisor?",
  "What does the IC report include?",
  "How does the API integration work?",
  "What is a DNA score?",
  "How do I upload a portfolio?",
] as const;

const HANDOFF_STEPS = [
  "Triage Agent: routing your question…",
  "Strategist Agent is analyzing…",
  "Quant Analyst is refining the response…",
] as const;

interface Message {
  role: "user" | "assistant";
  text: string;
  keyNumbers?: Record<string, string>;
  action?: string;
  agent?: string;
  loading?: boolean;
}

export default function LandingSwarmChatDock() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [handoffIdx, setHandoffIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handoffTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHandoffTimer = useCallback(() => {
    if (handoffTimer.current) {
      clearInterval(handoffTimer.current);
      handoffTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          text: "Hi — I'm the Triage Agent for this product demo. Ask anything about NeuFin's swarm, DNA scores, uploads, IC reports, or API integration. I'll coordinate specialist agents behind the scenes.",
          agent: "triage",
        },
      ]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, handoffIdx]);

  useEffect(() => () => clearHandoffTimer(), [clearHandoffTimer]);

  const send = async (question: string) => {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    setHandoffIdx(0);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", agent: "swarm", loading: true },
    ]);

    handoffTimer.current = setInterval(() => {
      setHandoffIdx((i) =>
        i + 1 >= HANDOFF_STEPS.length ? HANDOFF_STEPS.length - 1 : i + 1,
      );
    }, 700);

    try {
      const res = await fetch("/api/swarm/global-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, agent_type: "general" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply =
        data.reply ??
        data.response?.answer ??
        "Here is what I can share about NeuFin.";
      const keyNumbers = data.key_numbers ?? data.response?.key_numbers ?? {};
      const action = data.action ?? data.response?.recommended_action ?? "";
      clearHandoffTimer();
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          agent: data.agent ?? "general",
          text: reply,
          keyNumbers,
          action,
        },
      ]);
    } catch (e: unknown) {
      clearHandoffTimer();
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          agent: "general",
          text: `We could not reach the swarm right now. Please try again. (${msg})`,
        },
      ]);
    } finally {
      clearHandoffTimer();
      setLoading(false);
      setHandoffIdx(0);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const showStarters = messages.length === 1 && !loading;

  return (
    <div className="fixed bottom-24 right-4 z-[9980] flex w-[min(100vw-2rem,380px)] flex-col-reverse items-end gap-3 sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          open ? "Close swarm demo chat" : "Open swarm product demo chat"
        }
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#1EB8CC]/35 bg-[#0F172A] text-white shadow-[0_6px_28px_rgba(30,184,204,0.35)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2} />
        ) : (
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div
          className="glass-card-light flex h-[min(72vh,520px)] w-full flex-col overflow-hidden rounded-2xl border border-[#1EB8CC]/25 shadow-[0_20px_50px_rgba(15,23,42,0.12)] animate-[landingChatIn_0.2s_ease-out]"
          role="dialog"
          aria-label="NeuFin swarm product demo"
        >
          <div className="flex items-center justify-between border-b border-[#E2E8F0]/90 bg-white/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">
                Swarm product demo
              </p>
              <p className="text-xs font-medium uppercase tracking-wide text-[#1EB8CC]">
                Triage → specialist agents
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              aria-label="Close demo chat"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <p className="border-b border-[#F1F5F9] bg-[#F8FAFC]/80 px-4 py-2 text-[11px] leading-snug text-[#64748B]">
            Intelligent assistant preview — answers reflect live swarm routing
            where available.
          </p>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-gradient-to-b from-white to-[#F8FAFC]/95 px-4 py-3">
            {showStarters && (
              <div className="mb-1 flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 text-left text-xs font-medium leading-snug text-[#475569] transition-colors hover:border-[#1EB8CC]/40 hover:text-[#0F172A]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[88%] flex flex-col gap-1">
                  {msg.loading ? (
                    <div className="rounded-2xl rounded-bl-md border border-[#E2E8F0] bg-white px-3 py-2.5 shadow-sm">
                      <p className="text-xs font-semibold text-[#1EB8CC]">
                        {HANDOFF_STEPS[handoffIdx]}
                      </p>
                      <p className="mt-1 text-xs text-[#64748B]">
                        Coordinating the agent swarm…
                      </p>
                    </div>
                  ) : msg.role === "user" ? (
                    <div className="rounded-2xl rounded-br-md border border-[#1EB8CC]/25 bg-[#E0F7FA]/90 px-3 py-2 text-sm leading-relaxed text-[#0F172A]">
                      {msg.text}
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl rounded-bl-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm leading-relaxed text-[#334155] shadow-sm">
                        {msg.text}
                      </div>
                      {msg.keyNumbers &&
                        Object.keys(msg.keyNumbers).length > 0 && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-2">
                            {Object.entries(msg.keyNumbers).map(([k, v]) => (
                              <div
                                key={k}
                                className="flex items-center gap-1 text-xs"
                              >
                                <span className="font-medium uppercase tracking-wider text-[#94A3B8]">
                                  {k}
                                </span>
                                <span className="font-semibold text-[#0F172A]">
                                  {String(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      {msg.action ? (
                        <ActionCard raw={msg.action} />
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-[#E2E8F0] bg-white/90 px-3 py-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              placeholder="Ask about NeuFin, DNA score, API…"
              className="min-w-0 flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none ring-[#1EB8CC]/0 transition-[box-shadow,border-color] placeholder:text-[#94A3B8] focus:border-[#1EB8CC]/40 focus:ring-2 focus:ring-[#1EB8CC]/15 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#1EB8CC]/30 bg-[#1EB8CC] text-white transition-opacity disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:bg-[#F1F5F9] disabled:text-[#CBD5E1]"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes landingChatIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
