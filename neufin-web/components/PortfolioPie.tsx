'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Position } from '@/lib/api'

const PALETTE = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#a855f7', // purple-500
  '#14b8a6', // teal-500
  '#fb923c', // orange-400
  '#6366f1', // indigo-500
  '#22d3ee', // cyan-400
  '#4ade80', // green-400
]

interface Props {
  positions: Position[]
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

const pct = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n / 100)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as Position & { color: string }
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="font-mono font-bold text-white">{d.symbol}</p>
      <p className="text-gray-400 mt-0.5">{usd(d.value)}</p>
      <p className="text-gray-500 text-xs">{pct(d.weight)} of portfolio</p>
    </div>
  )
}

export default function PortfolioPie({ positions }: Props) {
  const data = positions
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((p, i) => ({ ...p, color: PALETTE[i % PALETTE.length] }))

  return (
    <div className="flex flex-col gap-4">
      {/* Doughnut */}
      <div className="w-full aspect-square max-h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="symbol"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              strokeWidth={0}
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

      {/* Legend */}
      <ul className="space-y-1.5">
        {data.map((entry) => (
          <li key={entry.symbol} className="flex items-center gap-2.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-mono text-sm text-white font-semibold w-14 shrink-0">
              {entry.symbol}
            </span>
            <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(entry.weight, 100)}%`, backgroundColor: entry.color }}
              />
            </div>
            <span className="text-xs text-gray-400 w-10 text-right shrink-0">
              {pct(entry.weight)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
