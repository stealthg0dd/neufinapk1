"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, X } from "lucide-react";
import AgentChat from "@/components/AgentChat";
import SwarmTerminal from "@/components/SwarmTerminal";
import { apiGet } from "@/lib/api-client";

const RAIL_AGENT_DOTS = [
  "Strategist",
  "Quant",
  "Tax",
  "Critic",
  "Synthesizer",
  "Router",
  "System",
] as const;

const QUICK_PROMPTS = [
  "Summarize portfolio risk",
  "Generate IC memo",
  "Detect bias patterns",
] as const;

type MetricPosition = {
  symbol: string;
  shares: number;
  current_price: number;
  current_value: number;
  weight: number;
};

type PortfolioMetrics = {
  total_value: number;
  positions: MetricPosition[];
};

export function CopilotRail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [positions, setPositions] = useState<
    {
      symbol: string;
      shares: number;
      price: number;
      value: number;
      weight: number;
    }[]
  >([]);
  const [totalValue, setTotalValue] = useState(0);
  const [chatBusy, setChatBusy] = useState(false);
  const [quickFill, setQuickFill] = useState<{
    id: number;
    text: string;
  } | null>(null);

  const onQuickFillConsumed = useCallback(() => setQuickFill(null), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiGet<Array<{ portfolio_id: string }>>(
          "/api/portfolio/list",
          { cache: "no-store" },
        );
        if (cancelled || !Array.isArray(list) || list.length === 0) {
          if (!cancelled) {
            setPositions([]);
            setTotalValue(0);
          }
          return;
        }
        const m = await apiGet<PortfolioMetrics>(
          `/api/portfolio/${list[0].portfolio_id}/metrics`,
          {
            cache: "no-store",
          },
        );
        if (cancelled) return;
        setTotalValue(m.total_value ?? 0);
        setPositions(
          (m.positions ?? []).map((p) => ({
            symbol: p.symbol,
            shares: p.shares,
            price: p.current_price,
            value: p.current_value,
            weight: p.weight,
          })),
        );
      } catch {
        if (!cancelled) {
          setPositions([]);
          setTotalValue(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <aside
      aria-hidden={!open}
      className={`fixed right-0 top-11 bottom-0 z-40 flex w-80 flex-col border-l border-border/60 bg-copilot transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/40 px-4">
        <div className="flex items-center gap-2">
          <Brain
            className="h-3.5 w-3.5 shrink-0 text-accent"
            strokeWidth={2}
            aria-hidden
          />
          <span className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
            NEUFIN COPILOT
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          aria-label="Close Copilot"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 border-b border-border/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {RAIL_AGENT_DOTS.map((name) => {
            const running = chatBusy && name === "Synthesizer";
            const dotClass = running
              ? "bg-primary animate-pulse"
              : "bg-muted-foreground/30";
            return (
              <span
                key={name}
                title={name}
                className={`h-1.5 w-1.5 rounded-full ${dotClass}`}
              />
            );
          })}
        </div>
        <p className="mt-1.5 font-mono text-sm text-muted-foreground/60">
          7 agents active
        </p>
      </div>

      <div className="shrink-0 border-b border-border/40 px-2 py-2">
        <SwarmTerminal traces={[]} compact rail />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col p-4 pt-3">
          <AgentChat
            thesis={{}}
            positions={positions}
            totalValue={totalValue}
            apiBase=""
            onClose={onClose}
            embedded
            quickFill={quickFill}
            onQuickFillConsumed={onQuickFillConsumed}
            onBusyChange={setChatBusy}
            className="min-h-0 flex-1 rounded-md border border-border/50"
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-border/40 px-4 py-3">
        <p className="mb-2 font-mono text-sm uppercase text-muted-foreground/50">
          Quick prompts
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setQuickFill({ id: Date.now(), text: label })}
              className="rounded bg-surface-2 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
