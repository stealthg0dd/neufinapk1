"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";
import {
  CAPABILITY_SCORES,
  GROWTH_TIMELINE,
  BENCHMARK_STATS,
} from "./BenchmarkData";

// ── Radar chart (capability spider) ──────────────────────────────────────────

function CapabilityRadar() {
  const data = CAPABILITY_SCORES.map((c) => ({
    dimension: c.dimension,
    "NeuFin": c.neufin,
    "Market Average": c.market_average,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 11, fill: "#64748b" }}
        />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          name="NeuFin"
          dataKey="NeuFin"
          stroke="#0ea5e9"
          fill="#0ea5e9"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Radar
          name="Market Average"
          dataKey="Market Average"
          stroke="#94a3b8"
          fill="#94a3b8"
          fillOpacity={0.12}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(val: number, name: string) => [`${val}/100`, name]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Growth timeline line chart ────────────────────────────────────────────────

const GROWTH_LINES = [
  { key: "accuracy",          label: "Accuracy",           color: "#0ea5e9" },
  { key: "agent_intelligence",label: "Agent Intelligence", color: "#8b5cf6" },
  { key: "speed",             label: "Speed",              color: "#10b981" },
  { key: "coverage",          label: "Coverage",           color: "#f59e0b" },
] as const;

function GrowthTimeline() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={GROWTH_TIMELINE} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: "#94a3b8" }} />
        <YAxis domain={[50, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} unit="" />
        <ReferenceLine y={100} stroke="#e2e8f0" strokeDasharray="4 3" />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(val: number, name: string) => [`${val}`, name]}
        />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
        />
        {GROWTH_LINES.map(({ key, label, color }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            animationDuration={1200}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Stat cards ────────────────────────────────────────────────────────────────

function StatCards() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {BENCHMARK_STATS.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-slate-100 bg-white px-3 py-3 shadow-sm"
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {s.label}
          </p>
          <p className="mt-1 text-sm font-bold text-navy">{s.neufin}</p>
          <p className="text-xs text-muted-foreground">{s.market}</p>
          <span
            className={`mt-1 inline-block rounded px-1 py-0.5 text-[10px] font-semibold ${
              s.positive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {s.delta}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main BenchmarkChart export ────────────────────────────────────────────────

interface BenchmarkChartProps {
  /** Show the growth timeline tab by default (vs radar) */
  defaultTab?: "radar" | "growth";
  className?: string;
}

export function BenchmarkChart({ defaultTab = "radar", className = "" }: BenchmarkChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-navy">
          📊 Platform Performance vs Market
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          NeuFin vs traditional tools &amp; generic AI platforms — anonymized industry baseline
        </p>
      </div>

      <StatCards />

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Capability dimensions vs industry peers
        </p>
        <CapabilityRadar />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          NeuFin platform evolution over time
        </p>
        <GrowthTimeline />
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Baseline scores derived from published benchmarks of traditional portfolio tools, legacy advisory platforms, and generic AI chat tools. All comparisons are anonymized.
      </p>
    </motion.div>
  );
}
