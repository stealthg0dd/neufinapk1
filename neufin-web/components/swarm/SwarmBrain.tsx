"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Agent definitions ─────────────────────────────────────────────────────────

export interface AgentState {
  id: string;
  label: string;
  mono: string;
  role: string;
  color: string;
  status: "idle" | "running" | "complete" | "failed";
  output?: string;
}

const AGENTS: AgentState[] = [
  {
    id: "market_regime",
    label: "Market Regime",
    mono: "MR",
    role: "Reads macro signals, VIX, yield curve & trend regime",
    color: "#DC2626",
    status: "idle",
  },
  {
    id: "strategist",
    label: "Strategist",
    mono: "PS",
    role: "Maps portfolio to strategic themes & sector tilts",
    color: "#D97706",
    status: "idle",
  },
  {
    id: "quant",
    label: "Quant Analyst",
    mono: "QA",
    role: "Computes beta, Sharpe, HHI, correlation matrix",
    color: "#2563EB",
    status: "idle",
  },
  {
    id: "tax_architect",
    label: "Tax Architect",
    mono: "TO",
    role: "Identifies harvest opportunities, wash-sale windows",
    color: "#D97706",
    status: "idle",
  },
  {
    id: "risk_sentinel",
    label: "Risk Sentinel",
    mono: "RS",
    role: "Stress-tests concentration, liquidity & tail risk",
    color: "#DC2626",
    status: "idle",
  },
  {
    id: "alpha_scout",
    label: "Alpha Scout",
    mono: "AS",
    role: "Scans for mis-priced positions & rebalance signals",
    color: "#16A34A",
    status: "idle",
  },
  {
    id: "synthesizer",
    label: "Synthesizer",
    mono: "IC",
    role: "Integrates all signals into the IC briefing memo",
    color: "#7C3AED",
    status: "idle",
  },
];

// ── Layout helpers ────────────────────────────────────────────────────────────

const CX = 160; // SVG center x
const CY = 160; // SVG center y
const R = 108;  // orbit radius

function agentPosition(index: number, total: number): { x: number; y: number } {
  // Synthesizer (index 6) sits at center; others in ring
  if (index === 6) return { x: CX, y: CY };
  const angle = (2 * Math.PI * index) / (total - 1) - Math.PI / 2;
  return {
    x: CX + R * Math.cos(angle),
    y: CY + R * Math.sin(angle),
  };
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState {
  agent: AgentState;
  x: number;
  y: number;
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SwarmBrainProps {
  /** Pass live agent states when swarm is running */
  agentStates?: Partial<Record<string, AgentState["status"]>>;
  /** Pass latest output snippet per agent id */
  agentOutputs?: Partial<Record<string, string>>;
  className?: string;
  /** Compact mode for sidebar/rail embedding */
  compact?: boolean;
}

export function SwarmBrain({
  agentStates,
  agentOutputs,
  className = "",
  compact = false,
}: SwarmBrainProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [tick, setTick] = useState(0);
  const animRef = useRef<number>(0);

  // Merge live states with defaults
  const agents: AgentState[] = AGENTS.map((a) => ({
    ...a,
    status: agentStates?.[a.id] ?? a.status,
    output: agentOutputs?.[a.id] ?? a.output,
  }));

  const isRunning = agents.some((a) => a.status === "running");

  // Ticker for particle animation
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame++;
      setTick(frame);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleMouseEnter = useCallback(
    (agent: AgentState, svgX: number, svgY: number) => {
      setTooltip({ agent, x: svgX, y: svgY });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  const size = compact ? 200 : 320;
  const viewBox = `0 0 ${compact ? 200 : 320} ${compact ? 200 : 320}`;

  // Scale positions for compact mode
  const scale = compact ? 200 / 320 : 1;
  const scalePos = (pos: { x: number; y: number }) => ({
    x: pos.x * scale,
    y: pos.y * scale,
  });

  return (
    <div className={`relative select-none ${className}`}>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={viewBox}
        className="overflow-visible"
        aria-label="NeuFin Swarm Brain — 7 AI agents collaborating"
      >
        {/* Background orbit ring */}
        <circle
          cx={CX * scale}
          cy={CY * scale}
          r={R * scale}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
          strokeDasharray="4 6"
          opacity={0.6}
        />

        {/* Connection lines from ring agents → synthesizer */}
        {agents.slice(0, 6).map((agent, i) => {
          const from = scalePos(agentPosition(i, agents.length));
          const to = scalePos(agentPosition(6, agents.length));
          const active = agent.status === "running" || agent.status === "complete";

          return (
            <g key={`line-${agent.id}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={active ? agent.color : "#cbd5e1"}
                strokeWidth={active ? 1.5 : 0.75}
                opacity={active ? 0.55 : 0.25}
                strokeDasharray={active ? "none" : "3 4"}
              />
              {/* Animated data-flow particle */}
              {isRunning && active && (
                <DataParticle
                  from={from}
                  to={to}
                  color={agent.color}
                  tick={tick}
                  phase={i * 18}
                />
              )}
            </g>
          );
        })}

        {/* Agent nodes */}
        {agents.map((agent, i) => {
          const pos = scalePos(agentPosition(i, agents.length));
          const isSynthesizer = agent.id === "synthesizer";
          const nodeR = isSynthesizer ? 22 * scale : 16 * scale;
          const isActive = agent.status === "running";
          const isDone = agent.status === "complete";

          return (
            <g
              key={agent.id}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => handleMouseEnter(agent, pos.x, pos.y)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Pulse ring when running */}
              {isActive && (
                <PulseRing
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeR}
                  color={agent.color}
                  tick={tick}
                />
              )}

              {/* Node body */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeR}
                fill={isDone || isActive ? agent.color : "#f8fafc"}
                stroke={agent.color}
                strokeWidth={isSynthesizer ? 2 : 1.5}
                opacity={agent.status === "idle" ? 0.85 : 1}
              />

              {/* Mono label */}
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={compact ? 7 : 9}
                fontFamily="monospace"
                fontWeight="700"
                fill={isDone || isActive ? "white" : agent.color}
              >
                {agent.mono}
              </text>

              {/* Agent name label (outside node, below) — only in full mode */}
              {!compact && (
                <text
                  x={pos.x}
                  y={pos.y + nodeR + 10}
                  textAnchor="middle"
                  fontSize={7.5}
                  fontFamily="sans-serif"
                  fill="#64748b"
                >
                  {isSynthesizer ? agent.label : agent.label.split(" ")[0]}
                </text>
              )}

              {/* Done checkmark */}
              {isDone && !compact && (
                <text
                  x={pos.x + nodeR - 4}
                  y={pos.y - nodeR + 4}
                  fontSize={8}
                  textAnchor="middle"
                >
                  ✓
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip overlay */}
      <AnimatePresence>
        {tooltip && (
          <AgentTooltip tooltip={tooltip} compact={compact} size={size} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PulseRing({
  cx,
  cy,
  r,
  color,
  tick,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  tick: number;
}) {
  const phase = (tick % 60) / 60; // 0→1 over ~1s at 60fps
  const pulseR = r + phase * 12;
  const opacity = (1 - phase) * 0.5;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={pulseR}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      opacity={opacity}
    />
  );
}

function DataParticle({
  from,
  to,
  color,
  tick,
  phase,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  tick: number;
  phase: number;
}) {
  const t = ((tick + phase) % 90) / 90; // 0→1 over ~1.5s
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  return <circle cx={x} cy={y} r={2.5} fill={color} opacity={0.9} />;
}

function AgentTooltip({
  tooltip,
  compact,
  size,
}: {
  tooltip: TooltipState;
  compact: boolean;
  size: number;
}) {
  const { agent, x, y } = tooltip;
  // Flip tooltip left/right based on x position
  const flipX = x > size / 2;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      style={{
        position: "absolute",
        top: y - (compact ? 40 : 50),
        left: flipX ? undefined : x + 18,
        right: flipX ? size - x + 18 : undefined,
        zIndex: 50,
        pointerEvents: "none",
      }}
      className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: agent.color }}
        />
        <p className="text-[11px] font-bold text-navy">{agent.label}</p>
        <span
          className={`ml-auto text-[9px] font-semibold rounded px-1 py-0.5 ${
            agent.status === "running"
              ? "bg-amber-100 text-amber-700"
              : agent.status === "complete"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {agent.status.toUpperCase()}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">{agent.role}</p>
      {agent.output && (
        <p className="mt-1 text-[10px] text-slate-600 italic leading-snug line-clamp-2">
          &quot;{agent.output}&quot;
        </p>
      )}
    </motion.div>
  );
}
