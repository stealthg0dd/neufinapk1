"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { Position } from "@/lib/api";
import { chartPalette } from "@/lib/chart-palette";

/** Institutional slices: primary teal, slate neutrals, green sparingly — no neon */
const SLICE_COLORS = [
  chartPalette.primary,
  chartPalette.neutral,
  chartPalette.neutralMuted,
  "#158A99",
  "#CBD5E1",
  "#334155",
  chartPalette.positive,
  chartPalette.primary,
  chartPalette.neutral,
  chartPalette.neutralMuted,
];

interface Props {
  positions: Position[];
}

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const pct = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n / 100);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Position & { color: string };
  const v =
    typeof d.value === "number" && !Number.isNaN(d.value) ? d.value : 0;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-mono font-semibold text-foreground">{d.symbol}</p>
      <p className="mt-0.5 text-muted-foreground">{usd(v)}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {pct(d.weight)} of portfolio
      </p>
    </div>
  );
}

export default function PortfolioPie({ positions }: Props) {
  const data = positions
    .filter(
      (p): p is Position & { value: number } =>
        typeof p.value === "number" &&
        !Number.isNaN(p.value) &&
        p.value > 0,
    )
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((p, i) => ({ ...p, color: SLICE_COLORS[i % SLICE_COLORS.length] }));

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="aspect-square w-full max-h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="symbol"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke={chartPalette.grid}
              strokeWidth={1}
              animationBegin={100}
              animationDuration={900}
            >
              {data.map((entry) => (
                <Cell key={entry.symbol} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="space-y-1.5 border-t border-gray-100 pt-3">
        {data.map((entry) => (
          <li key={entry.symbol} className="flex items-center gap-2.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="w-14 shrink-0 font-mono text-sm font-semibold text-foreground">
              {entry.symbol}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(entry.weight, 100)}%`,
                  backgroundColor: entry.color,
                }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-sm text-muted-foreground">
              {pct(entry.weight)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
