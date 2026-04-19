"use client";

import { SwarmBrain, type AgentState } from "./SwarmBrain";

interface SwarmBrainPanelProps {
  /** Live per-agent status map, keyed by agent id */
  agentStates?: Partial<Record<string, AgentState["status"]>>;
  agentOutputs?: Partial<Record<string, string>>;
  isRunning?: boolean;
  className?: string;
}

export function SwarmBrainPanel({
  agentStates,
  agentOutputs,
  isRunning = false,
  className = "",
}: SwarmBrainPanelProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm flex flex-col items-center gap-3 ${className}`}
    >
      <div className="w-full">
        <h3 className="text-sm font-semibold text-navy">🧠 Swarm Intelligence</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isRunning
            ? "7 agents processing your portfolio in parallel…"
            : "Hover an agent node to explore its role. Run the Swarm to see it live."}
        </p>
      </div>

      <SwarmBrain
        agentStates={agentStates}
        agentOutputs={agentOutputs}
        className="shrink-0"
      />

      <div className="w-full grid grid-cols-3 gap-1.5 sm:grid-cols-7">
        {[
          { mono: "MR", label: "Regime",    color: "#DC2626" },
          { mono: "PS", label: "Strategy",  color: "#D97706" },
          { mono: "QA", label: "Quant",     color: "#2563EB" },
          { mono: "TO", label: "Tax",       color: "#D97706" },
          { mono: "RS", label: "Risk",      color: "#DC2626" },
          { mono: "AS", label: "Alpha",     color: "#16A34A" },
          { mono: "IC", label: "Synth",     color: "#7C3AED" },
        ].map(({ mono, label, color }) => (
          <div key={mono} className="flex flex-col items-center gap-0.5">
            <span
              className="h-1 w-1 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[9px] text-muted-foreground font-mono">{mono}</span>
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
