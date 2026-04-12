'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Position } from '@/lib/api'

/** Muted institutional palette — teal primary, slate neutrals, restrained accents */
const PALETTE = [
  '#1EB8CC',
  '#64748B',
  '#94A3B8',
  '#158A99',
  '#CBD5E1',
  '#0F172A',
  '#22C55E',
  '#F5A623',
  '#94A3B8',
  '#334155',
  '#1EB8CC',
  '#64748B',
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
    <div className="rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-mono font-semibold text-navy">{d.symbol}</p>
      <p className="mt-0.5 text-slate2">{usd(d.value)}</p>
      <p className="mt-0.5 text-sm text-muted2">{pct(d.weight)} of portfolio</p>
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
      <div className="aspect-square w-full max-h-52">
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

      <ul className="space-y-1.5">
        {data.map((entry) => (
          <li key={entry.symbol} className="flex items-center gap-2.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="w-14 shrink-0 font-mono text-sm font-semibold text-navy">{entry.symbol}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(entry.weight, 100)}%`, backgroundColor: entry.color }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-sm text-muted2">{pct(entry.weight)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
