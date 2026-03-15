'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LineChart, Line, CartesianGrid, Legend,
  Treemap,
} from 'recharts'
import { PageView, EVENTS, trackEvent } from '@/components/Analytics'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StrategyEntry {
  type: string
  count: number
  pct: number
  color: string
  sector: string
}

interface ScoreBand {
  range: string
  label: string
  count: number
  pct: number
}

interface TrendPoint {
  date: string
  avg_score: number
  count: number
}

interface MarketHealth {
  total_portfolios: number
  avg_dna_score: number
  median_dna_score: number
  avg_concentration: number
  score_distribution: ScoreBand[]
  strategy_mix: StrategyEntry[]
}

interface Props {
  health: MarketHealth
  trend: TrendPoint[]
}

// ── Framer variants ────────────────────────────────────────────────────────────

const fadeUp = {
  hidden:  { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } },
}

const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
}

// ── DNA Score Gauge ────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const clamped  = Math.max(0, Math.min(100, score))
  const angle    = -135 + (clamped / 100) * 270   // -135° to +135°
  const color    = clamped >= 70 ? '#22c55e' : clamped >= 40 ? '#f59e0b' : '#ef4444'

  // SVG arc path
  const r = 52
  const cx = 70, cy = 70
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const arcX  = (deg: number) => cx + r * Math.cos(toRad(deg))
  const arcY  = (deg: number) => cy + r * Math.sin(toRad(deg))

  const startAngle = 225   // degrees (SVG coordinate, 0=right)
  const endAngle   = 315
  const sweepDeg   = 270
  const fillDeg    = (clamped / 100) * sweepDeg

  function arcPath(start: number, sweep: number, color: string, strokeWidth = 10) {
    const s = start - 90  // offset so 0° = top
    const e = s + sweep
    const x1 = arcX(s), y1 = arcY(s)
    const x2 = arcX(e), y2 = arcY(e)
    const large = sweep > 180 ? 1 : 0
    return (
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    )
  }

  const needleAngle = -135 + (clamped / 100) * 270
  const nRad = toRad(needleAngle - 90)
  const nx = cx + (r - 6) * Math.cos(nRad)
  const ny = cy + (r - 6) * Math.sin(nRad)

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 110" className="w-44 h-36">
        {/* Track */}
        {arcPath(startAngle, sweepDeg, '#1f2937', 10)}
        {/* Fill */}
        {arcPath(startAngle, fillDeg, color, 10)}
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx} y2={ny}
          stroke={color} strokeWidth={2.5} strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4} fill={color} />
        {/* Labels */}
        <text x={cx - 33} y={cy + 22} fill="#6b7280" fontSize={9} textAnchor="middle">0</text>
        <text x={cx + 33} y={cy + 22} fill="#6b7280" fontSize={9} textAnchor="middle">100</text>
      </svg>
      <div className="text-center -mt-3">
        <span className="text-4xl font-bold" style={{ color }}>{score}</span>
        <span className="text-gray-500 text-lg">/100</span>
      </div>
    </div>
  )
}

// ── Custom Treemap label ───────────────────────────────────────────────────────

function TreemapLabel({ x, y, width, height, name, pct }: {
  x?: number; y?: number; width?: number; height?: number; name?: string; pct?: number
}) {
  const w = width ?? 0
  const h = height ?? 0
  if (w < 50 || h < 30) return null
  return (
    <g>
      <text x={(x ?? 0) + w / 2} y={(y ?? 0) + h / 2 - 6}
        fill="#fff" fontSize={12} fontWeight={600} textAnchor="middle">
        {name}
      </text>
      <text x={(x ?? 0) + w / 2} y={(y ?? 0) + h / 2 + 10}
        fill="rgba(255,255,255,0.7)" fontSize={10} textAnchor="middle">
        {pct}%
      </text>
    </g>
  )
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────

function ScoreTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-400">{d.date}</p>
      <p className="text-white font-semibold">Avg Score: {d.avg_score}</p>
      <p className="text-gray-500">{d.count} portfolios</p>
    </div>
  )
}

function DistTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScoreBand }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-white font-semibold">{d.label} ({d.range})</p>
      <p className="text-gray-400">{d.count} portfolios · {d.pct}%</p>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export default function MarketClient({ health, trend }: Props) {
  useEffect(() => {
    trackEvent(EVENTS.MARKET_PAGE_VIEWED, { total_portfolios: health.total_portfolios })
  }, [health.total_portfolios])

  const trendData = trend.slice(-30)  // last 30 days

  // Treemap needs size field
  const treemapData = health.strategy_mix.map(s => ({
    name:  s.type,
    size:  s.count,
    pct:   s.pct,
    color: s.color,
  }))

  const scoreColors = ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#22c55e']

  return (
    <>
      <PageView page="market" />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >

        {/* ── Hero stat row ─────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Portfolios Analyzed', value: health.total_portfolios.toLocaleString(), icon: '📊' },
            { label: 'Avg DNA Score',        value: health.avg_dna_score,                    icon: '🧬' },
            { label: 'Median DNA Score',     value: health.median_dna_score,                 icon: '📐' },
            { label: 'Avg Concentration',    value: `${health.avg_concentration}%`,           icon: '🎯' },
          ].map(stat => (
            <div key={stat.label} className="card text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* ── Platform DNA gauge + score distribution ───────────── */}
        <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-6">

          {/* Gauge */}
          <div className="card flex flex-col items-center justify-center gap-2">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider w-full">
              Average Investor DNA
            </h2>
            <ScoreGauge score={health.avg_dna_score} />
            <p className="text-xs text-gray-600 text-center">
              Live average across {health.total_portfolios.toLocaleString()} portfolios on Neufin
            </p>
          </div>

          {/* Score distribution */}
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Score Distribution
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={health.score_distribution} barSize={32}>
                <XAxis dataKey="range" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<DistTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {health.score_distribution.map((_, i) => (
                    <Cell key={i} fill={scoreColors[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-3 flex-wrap">
              {health.score_distribution.map((b, i) => (
                <div key={b.range} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: scoreColors[i] }} />
                  <span className="text-xs text-gray-500">{b.label} <span className="text-gray-600">{b.pct}%</span></span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Strategy mix treemap ──────────────────────────────── */}
        <motion.div variants={fadeUp} className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Strategy Mix Heatmap
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              How Neufin users are positioned — concentration of investment strategies across the platform.
            </p>
          </div>
          {treemapData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <Treemap
                data={treemapData}
                dataKey="size"
                aspectRatio={4 / 3}
                content={<TreemapLabel />}
              >
                {treemapData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Treemap>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
              Not enough data yet
            </div>
          )}
          {/* Legend */}
          <div className="flex gap-4 flex-wrap">
            {health.strategy_mix.map(s => (
              <div key={s.type} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-gray-400">{s.type}</span>
                <span className="text-xs text-gray-600">{s.pct}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Score trend over time ─────────────────────────────── */}
        <motion.div variants={fadeUp} className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Platform DNA Score — 30-Day Trend
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Daily average DNA score across all portfolio uploads.
            </p>
          </div>
          {trendData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickFormatter={d => d.slice(5)}   // MM-DD
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  width={28}
                />
                <Tooltip content={<ScoreTooltip />} />
                <Line
                  type="monotone"
                  dataKey="avg_score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                  name="Avg DNA Score"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
              More data needed — trend appears after multiple days of uploads
            </div>
          )}
        </motion.div>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="card border-blue-800/30 bg-gradient-to-br from-blue-950/30 to-purple-950/20 text-center space-y-3">
          <p className="text-white font-semibold">Where do you rank?</p>
          <p className="text-gray-500 text-sm">
            Upload your portfolio and see how your DNA Score compares to the platform average of {health.avg_dna_score}.
          </p>
          <div className="flex justify-center gap-3">
            <a href="/upload" className="btn-primary text-sm px-5 py-2.5">
              Analyze My Portfolio →
            </a>
            <a href="/leaderboard" className="btn-outline text-sm px-5 py-2.5">
              🏆 Leaderboard
            </a>
          </div>
        </motion.div>

      </motion.div>
    </>
  )
}
