'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { debugAuth } from '@/lib/auth-debug'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { getChartData, getPortfolioHistory, createCheckout, type DNAResult, type CandleData, type LinePoint, type Position } from '@/lib/api'

// CandlestickChart is client-only (lightweight-charts touches DOM)
const CandlestickChart = dynamic(() => import('@/components/CandlestickChart'), { ssr: false })

// ── Sector classification ──────────────────────────────────────────────────────
const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Tech', MSFT: 'Tech', GOOGL: 'Tech', GOOG: 'Tech', META: 'Tech',
  NVDA: 'Tech', AMD: 'Tech', TSLA: 'Tech', AMZN: 'Tech', NFLX: 'Tech',
  JPM: 'Finance', BAC: 'Finance', GS: 'Finance', MS: 'Finance',
  V: 'Finance', MA: 'Finance', WFC: 'Finance', C: 'Finance',
  JNJ: 'Healthcare', PFE: 'Healthcare', UNH: 'Healthcare', MRK: 'Healthcare',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy',
  WMT: 'Consumer', TGT: 'Consumer', COST: 'Consumer', MCD: 'Consumer',
  BRK: 'Other', SPY: 'ETF', QQQ: 'ETF', VTI: 'ETF', VOO: 'ETF',
}

const SECTOR_COLORS: Record<string, string> = {
  Tech: '#3b82f6', Finance: '#8b5cf6', Healthcare: '#22c55e',
  Energy: '#f59e0b', Consumer: '#ec4899', ETF: '#06b6d4', Other: '#6b7280',
}

function getSector(symbol: string): string {
  return SECTOR_MAP[symbol.toUpperCase()] ?? 'Other'
}

function buildSectorData(positions: Position[]) {
  const sectors: Record<string, number> = {}
  for (const p of positions) {
    const s = getSector(p.symbol)
    sectors[s] = (sectors[s] ?? 0) + p.value
  }
  return Object.entries(sectors).map(([name, value]) => ({ name, value: Math.round(value) }))
}

// ── Score badge ────────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'
  return (
    <span className={`font-bold ${color}`}>{score}<span className="text-xs text-gray-500">/100</span></span>
  )
}

// ── Signal badge ───────────────────────────────────────────────────────────────
function SignalBadge({ type }: { type: string }) {
  const classes: Record<string, string> = {
    BUY: 'bg-green-500/15 text-green-400 border-green-500/30',
    SELL: 'bg-red-500/15 text-red-400 border-red-500/30',
    HOLD: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  }
  return <span className={`badge border ${classes[type] ?? 'bg-gray-700 text-gray-300'}`}>{type}</span>
}

// ── Tooltip formatter ──────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function DashboardPage() {
  const { user, loading: authLoading, signOut, token } = useAuth()
  const [result, setResult] = useState<DNAResult | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string>('')
  const [candleData, setCandleData] = useState<CandleData[]>([])
  const [portfolioHistory, setPortfolioHistory] = useState<LinePoint[]>([])
  const [candleLoading, setCandleLoading] = useState(false)
  const [histLoading, setHistLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  useEffect(() => {
    debugAuth('dashboard:mount')
  }, [])

  // Load result from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('dnaResult')
    if (!stored) return
    const parsed: DNAResult = JSON.parse(stored)
    setResult(parsed)
    if (parsed.positions?.length) {
      setSelectedSymbol(parsed.positions[0].symbol)
    }
  }, [])

  // Fetch portfolio value history
  useEffect(() => {
    if (!result?.positions?.length) return
    const symbols = result.positions.map((p) => p.symbol)
    const shares = result.positions.map((p) => p.shares)
    setHistLoading(true)
    getPortfolioHistory(symbols, shares, '1mo')
      .then((d) => setPortfolioHistory(d.history))
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [result])

  // Fetch candlestick data when symbol changes
  const fetchCandle = useCallback(async (symbol: string) => {
    if (!symbol) return
    setCandleLoading(true)
    try {
      const d = await getChartData(symbol, '3mo')
      setCandleData(d.data)
    } catch {
      setCandleData([])
    } finally {
      setCandleLoading(false)
    }
  }, [])

  useEffect(() => { fetchCandle(selectedSymbol) }, [selectedSymbol, fetchCandle])

  const handleReportCheckout = async () => {
    if (!result) return
    setReportLoading(true)
    setReportError('')
    try {
      const { checkout_url } = await createCheckout({
        plan: 'single',
        positions: result.positions.map((p) => ({
          symbol: p.symbol,
          shares: p.shares,
          price: p.price,
          value: p.value,
          weight: p.weight,
        })),
        success_url: `${window.location.origin}/results?checkout_success=1`,
        cancel_url: `${window.location.origin}/dashboard`,
      }, token)
      window.location.href = checkout_url
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setReportLoading(false)
    }
  }

  const sectorData = result ? buildSectorData(result.positions ?? []) : []
  const currentPrice = result?.positions.find((p) => p.symbol === selectedSymbol)?.price ?? 0
  const lastHistValue = portfolioHistory[portfolioHistory.length - 1]?.value ?? result?.total_value ?? 0
  const firstHistValue = portfolioHistory[0]?.value ?? lastHistValue
  const pctChange = firstHistValue ? ((lastHistValue - firstHistValue) / firstHistValue) * 100 : 0

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        {/* Skeleton loader for empty state */}
        <div className="w-full max-w-screen-xl px-4 space-y-4">
          <div className="shimmer rounded-xl h-40 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <div className="shimmer rounded-xl h-64" />
            <div className="shimmer rounded-xl h-64" />
            <div className="shimmer rounded-xl h-64" />
          </div>
        </div>
        <p className="text-gray-500 text-sm mt-4">No portfolio data found.</p>
        <Link href="/upload" className="btn-primary">Upload Portfolio →</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
            <span className="hidden sm:block text-gray-600">|</span>
            <span className="hidden sm:block text-sm text-gray-400">Portfolio Dashboard</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400 hidden sm:block">{result.investor_type}</span>
            <ScoreBadge score={result.dna_score} />
            <Link href="/swarm" className="btn-outline py-1.5 text-xs">Swarm Analysis</Link>
            <Link href="/upload" className="btn-outline py-1.5 text-xs">New Analysis</Link>
            {user && (
              <button
                onClick={signOut}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-4 flex flex-col gap-4">

        {/* ── Top row: Portfolio value line chart ──────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card-dark rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Portfolio Value (30d)</h2>
              <p className="text-2xl font-bold mt-0.5">{fmt.format(lastHistValue)}</p>
            </div>
            <span className={`text-sm font-semibold ${pctChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%
            </span>
          </div>
          {histLoading ? (
            <div className="shimmer rounded-lg h-32 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={portfolioHistory} margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: '#4b5563' }}
                  tickFormatter={(v) => v.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#4b5563' }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  width={48}
                />
                <Tooltip
                  formatter={(v: number) => [fmt.format(v), 'Value']}
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* ── Three-column row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-4 flex-1">

          {/* ── Left: Holdings list ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass-card-dark rounded-xl p-5 flex flex-col overflow-hidden"
          >
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Holdings · {result.positions.length} positions
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1 -mx-1 px-1">
              {result.positions
                .sort((a, b) => b.value - a.value)
                .map((p) => {
                  const active = p.symbol === selectedSymbol
                  const sector = getSector(p.symbol)
                  return (
                    <motion.button
                      key={p.symbol}
                      onClick={() => setSelectedSymbol(p.symbol)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm
                        ${active
                          ? 'bg-blue-600/20 border border-blue-500/40 shadow-sm shadow-blue-500/10'
                          : 'hover:bg-gray-800/60 border border-transparent'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-white">{p.symbol}</span>
                        <span className="text-gray-300 font-medium">{fmt.format(p.value)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-gray-600">{sector}</span>
                        <span className="text-xs text-gray-500">{p.weight.toFixed(1)}%</span>
                      </div>
                      {/* Weight bar */}
                      <div className="mt-1.5 h-0.5 bg-gray-800 rounded-full">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(p.weight, 100)}%`,
                            background: SECTOR_COLORS[sector] ?? '#6b7280',
                          }}
                        />
                      </div>
                    </motion.button>
                  )
                })}
            </div>
          </motion.div>

          {/* ── Center: Candlestick chart ────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card-dark rounded-xl p-5 flex flex-col"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-white font-mono text-lg">{selectedSymbol}</h3>
                <span className="text-sm text-gray-400">${currentPrice.toFixed(2)}</span>
                <span className="text-xs badge bg-gray-800 text-gray-400">3 months</span>
              </div>
              {candleLoading && (
                <div className="shimmer rounded w-32 h-4" />
              )}
            </div>
            <div className="flex-1 min-h-0">
              <CandlestickChart
                key={selectedSymbol}
                data={candleData}
                symbol={selectedSymbol}
                height={320}
              />
            </div>
            {candleData.length > 0 && (() => {
              const last = candleData[candleData.length - 1]
              const prev = candleData[candleData.length - 2]
              const chg = prev ? ((last.close - prev.close) / prev.close) * 100 : 0
              return (
                <div className="mt-3 grid grid-cols-4 gap-2 pt-3 border-t border-gray-800">
                  {[
                    { label: 'Open', value: last.open.toFixed(2) },
                    { label: 'High', value: last.high.toFixed(2) },
                    { label: 'Low', value: last.low.toFixed(2) },
                    { label: '1d Chg', value: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` },
                  ].map((item) => (
                    <div key={item.label} className="text-center">
                      <p className="text-xs text-gray-600">{item.label}</p>
                      <p className={`text-xs font-semibold mt-0.5 ${item.label === '1d Chg' ? (chg >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-300'}`}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              )
            })()}
          </motion.div>

          {/* ── Right: AI Insights ───────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="glass-card-dark rounded-xl p-5 flex flex-col gap-4 overflow-y-auto"
          >
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Recommendation</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{result.recommendation}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-2">Strengths</h3>
              <ul className="space-y-1.5">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-gray-400 flex gap-1.5">
                    <span className="text-green-500 shrink-0">✓</span>{s}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Watch out</h3>
              <ul className="space-y-1.5">
                {result.weaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-gray-400 flex gap-1.5">
                    <span className="text-red-500 shrink-0">!</span>{w}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <Link href="/results" className="btn-outline w-full text-xs py-2 text-center block">
                Full DNA Report →
              </Link>

              {/* ── Professional Report CTA ─────────────────────────────── */}
              <button
                onClick={handleReportCheckout}
                disabled={reportLoading}
                className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors
                  bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
                  text-white disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {reportLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Preparing checkout…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    Download Professional Report · $29
                  </>
                )}
              </button>

              {reportError && (
                <p className="text-xs text-red-400 text-center">{reportError}</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Bottom row: Sector allocation pie ────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="glass-card-dark rounded-xl p-5"
        >
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Sector Allocation
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={sectorData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {sectorData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SECTOR_COLORS[entry.name] ?? '#6b7280'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [fmt.format(v), 'Value']}
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: '#9ca3af', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Sector breakdown table */}
            <div className="w-full sm:w-64 space-y-2">
              {sectorData
                .sort((a, b) => b.value - a.value)
                .map((s) => {
                  const total = sectorData.reduce((acc, x) => acc + x.value, 0)
                  const pct = total ? (s.value / total) * 100 : 0
                  return (
                    <div key={s.name} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: SECTOR_COLORS[s.name] ?? '#6b7280' }}
                      />
                      <span className="flex-1 text-gray-400">{s.name}</span>
                      <span className="text-gray-300 font-medium">{pct.toFixed(1)}%</span>
                    </div>
                  )
                })}
            </div>
          </div>
        </motion.div>

      </main>
    </div>
  )
}
