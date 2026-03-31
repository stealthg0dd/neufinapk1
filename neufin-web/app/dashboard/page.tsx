'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import dynamicImport from 'next/dynamic'
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
import { getChartData, getPortfolioHistory, createCheckout, type DNAResult, type CandleData, type LinePoint, type Position, authFetch } from '@/lib/api'

// CandlestickChart is client-only (lightweight-charts touches DOM)
const CandlestickChart = dynamicImport(() => import('@/components/CandlestickChart'), { ssr: false })

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

const SECTOR_LOOKUP = new Map<string, string>(Object.entries(SECTOR_MAP))
const SECTOR_COLOR_LOOKUP = new Map<string, string>(Object.entries(SECTOR_COLORS))

function getSector(symbol: string): string {
  const key = symbol.toUpperCase()
  return SECTOR_LOOKUP.get(key) ?? 'Other'
}

function buildSectorData(positions: Position[]) {
  const sectors = new Map<string, number>()
  for (const p of positions) {
    const s = getSector(p.symbol)
    sectors.set(s, (sectors.get(s) ?? 0) + p.value)
  }
  return Array.from(sectors.entries()).map(([name, value]) => ({ name, value: Math.round(value) }))
}

function signalClass(type: string): string {
  switch (type) {
    case 'BUY':
      return 'bg-green-500/15 text-green-400 border-green-500/30'
    case 'SELL':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'HOLD':
      return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
    default:
      return 'bg-gray-700 text-gray-300'
  }
}

function sectorColor(sector: string): string {
  return SECTOR_COLOR_LOOKUP.get(sector) ?? '#6b7280'
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
  return <span className={`badge border ${signalClass(type)}`}>{type}</span>
}

// ── Tooltip formatter ──────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function DashboardPage() {
    // Data for first-time dashboard
    const [portfolio, setPortfolio] = useState<any>(null)
    const [market, setMarket] = useState<any>(null)
    const [dna, setDna] = useState<any>(null)
    const [regime, setRegime] = useState<any>(null)
    const [trial, setTrial] = useState<any>(null)
    const [loadingAll, setLoadingAll] = useState(true)
    const [alerts, setAlerts] = useState<string[]>([])

    // Fetch all data in parallel for first-time experience
    useEffect(() => {
      if (!firstVisit) return
      setLoadingAll(true)
      Promise.all([
        authFetch('/api/portfolio/list', {}, token).then(r => r?.json()),
        authFetch('/api/market/prices?symbols=SPY,VIX', {}, token).then(r => r?.json()),
        authFetch('/api/analyze-dna/latest', {}, token).then(r => r?.json()),
        authFetch('/api/market/regime', {}, token).then(r => r?.json()),
        authFetch('/api/auth/subscription-status', {}, token).then(r => r?.json()),
      ]).then(([portfolio, market, dna, regime, trial]) => {
        setPortfolio(portfolio)
        setMarket(market)
        setDna(dna)
        setRegime(regime)
        setTrial(trial)
        // Build alerts from DNA warnings and regime
        const alertList: string[] = []
        if (dna?.warnings?.length) alertList.push(...dna.warnings)
        if (regime?.alerts?.length) alertList.push(...regime.alerts)
        setAlerts(alertList)
      }).finally(() => setLoadingAll(false))
    }, [firstVisit, token])
  // ...existing code...
  const { loading: isLoading, token, user } = useAuth()
  const [result, setResult] = useState<DNAResult | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string>('')
  const [candleData, setCandleData] = useState<CandleData[]>([])
  const [portfolioHistory, setPortfolioHistory] = useState<LinePoint[]>([])
  const [candleLoading, setCandleLoading] = useState(false)
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState<string | null>(null)
  const [candleError, setCandleError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  // First-time dashboard visit logic
  const [firstVisit, setFirstVisit] = useState<boolean | null>(null)
  const hasPatchedVisit = useRef(false)

  useEffect(() => {
    debugAuth('dashboard:mount')
    // If onboarding is not complete, redirect to onboarding
    if (!isLoading && user && user.user_metadata && !user.user_metadata.onboarding_complete) {
      window.location.replace('/onboarding')
      return
    }
    // Check first_dashboard_visit
    if (!isLoading && user && user.user_metadata) {
      if (user.user_metadata.first_dashboard_visit === undefined || user.user_metadata.first_dashboard_visit === null) {
        setFirstVisit(true)
      } else {
        setFirstVisit(false)
      }
    }
  }, [isLoading, user])

  // PATCH first_dashboard_visit after first render
  useEffect(() => {
    if (firstVisit && token && !hasPatchedVisit.current) {
      hasPatchedVisit.current = true
      authFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_dashboard_visit: true }),
      }, token).catch(() => {})
    }
  }, [firstVisit, token])

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
    if (!result?.positions?.length || !token) return
    const symbols = result.positions.map((p) => p.symbol)
    const shares = result.positions.map((p) => p.shares)
    setHistLoading(true)
    setHistError(null)
    getPortfolioHistory(symbols, shares, '1mo', token)
      .then((d) => setPortfolioHistory(d.history))
      .catch((err) => setHistError(err.message || 'Portfolio history unavailable'))
      .finally(() => setHistLoading(false))
  }, [result, token])

  // Fetch candlestick data when symbol changes
  const fetchCandle = useCallback(async (symbol: string) => {
    if (!symbol || !token) return
    setCandleLoading(true)
    setCandleError(null)
    try {
      const d = await getChartData(symbol, '3mo', token)
      setCandleData(d.data)
    } catch (err: any) {
      setCandleData([])
      setCandleError(err?.message || 'Chart data unavailable')
    } finally {
      setCandleLoading(false)
    }
  }, [token])

  useEffect(() => { fetchCandle(selectedSymbol) }, [selectedSymbol, fetchCandle])

  const handleReportCheckout = async () => {
    if (!result || !token) return
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

  if (isLoading || firstVisit === null || (firstVisit && loadingAll)) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  // FIRST-TIME DASHBOARD EXPERIENCE
  if (firstVisit) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0F172A] text-white">
        {/* SECTION 1 — COMMAND BAR */}
        <div className="w-full border-b border-[#1E293B] bg-[#0D1117] px-6 py-2 flex items-center gap-6 text-sm font-sans tracking-tight" style={{minHeight: 48}}>
          <span className="font-bold tracking-widest text-[#1E88E5]">NEUFIN</span>
          <span className="border-l border-[#1E293B] h-6 mx-3" />
          <span className="font-semibold">PORTFOLIO: <span className="font-mono text-white">{portfolio?.name || '—'}</span> ▾</span>
          <span className="text-slate-400">| Last sync: <span className="font-mono">{portfolio?.last_sync || '--:--'}</span></span>
          <span className="text-slate-400">| Regime: <span className={`font-semibold ${regime?.regime === 'GROWTH' ? 'text-green-400 animate-pulse' : 'text-red-400 animate-pulse'}`}>{regime?.regime || '—'} ●</span></span>
          <span className="text-slate-400">| VIX: <span className="font-mono">{market?.VIX?.price ?? '--'}</span></span>
          <span className="text-slate-400">| SPY: <span className="font-mono">{market?.SPY?.price ?? '--'} ({market?.SPY?.change_pct ?? '--'}%)</span></span>
          <button className="ml-4 px-4 py-1 rounded bg-[#1E88E5] text-white font-bold shadow-none hover:shadow-[0_0_8px_2px_#1E88E5] transition-all animate-pulse" style={{boxShadow: '0 0 8px 2px #1E88E5'}}>⚡ RUN SWARM</button>
          <span className="text-yellow-400 ml-4 cursor-pointer">🟡 TRIAL: 14D</span>
          <span className="ml-auto rounded-full w-8 h-8 bg-slate-800 flex items-center justify-center">{/* avatar */}</span>
        </div>

        {/* SECTION 2 — ALERT BANNER */}
        {alerts.length > 0 && (
          <div className="w-full bg-amber-900 border-b border-amber-500 text-amber-200 font-mono px-6 py-2 overflow-hidden relative" style={{whiteSpace:'nowrap'}}>
            <div className="animate-marquee" style={{display:'inline-block',animation:'marquee 20s linear infinite'}}>
              {alerts.map((a, i) => <span key={i} className="mr-10">⚠ {a}</span>)}
            </div>
            <style>{`@keyframes marquee { 0%{transform:translateX(100%);} 100%{transform:translateX(-100%);} } .animate-marquee:hover{animation-play-state:paused}`}</style>
          </div>
        )}

        {/* SECTION 3 — SWARM CTA HERO */}
        <div className="w-full bg-gradient-to-br from-[#0D1117] to-[#1E293B] border border-[#1E293B] rounded-none mt-4 mb-2 flex flex-row gap-0 min-h-[220px] relative overflow-hidden">
          {/* Left: Swarm info */}
          <div className="flex-1 p-8 flex flex-col justify-center">
            <div className="font-mono text-slate-400 text-lg mb-1">NEUFIN INTELLIGENCE SWARM</div>
            <div className="text-2xl font-semibold mb-2">7 AI agents. 6 data providers. 1 institutional-grade analysis.</div>
            <div className="text-slate-400 mb-4">Market Regime Agent · Quant Strategist · Tax Architect · Risk Sentinel · Alpha Scout<br/>Running simultaneously across your {portfolio?.positions?.length ?? '--'}-position portfolio.</div>
            <div className="flex flex-row gap-8 mb-6">
              <div className="flex items-center gap-2"><span>⚡</span><span className="font-mono">&lt; 90 seconds</span><span className="text-slate-400 text-xs ml-1">Full analysis time</span></div>
              <div className="flex items-center gap-2"><span>📊</span><span className="font-mono">47% more accurate</span><span className="text-slate-400 text-xs ml-1">vs single-model analysis</span></div>
              <div className="flex items-center gap-2"><span>🏦</span><span className="font-mono">IC-grade output</span><span className="text-slate-400 text-xs ml-1">Investment Committee briefing format</span></div>
            </div>
            <button className="w-full max-w-xs py-3 rounded bg-[#1E88E5] text-white font-bold text-lg shadow-none hover:shadow-[0_0_8px_2px_#1E88E5] transition-all animate-pulse">⚡ LAUNCH SWARM ANALYSIS</button>
            <div className="text-slate-400 text-xs mt-2">Free during your 14-day trial · No rate limits</div>
          </div>
          {/* Right: Animated terminal */}
          <div className="w-[40%] min-w-[320px] bg-[#0D1117] border-l border-[#1E293B] flex flex-col justify-end p-6">
            <AnimatedTerminal />
          </div>
        </div>

        {/* SECTION 4 — TRIAL UNLOCK STRIP */}
        <div className="w-full bg-[#0D1117] border border-[#1E293B] rounded-none flex flex-row mt-2 mb-4 px-6 py-4 gap-4 items-center">
          <div className="flex-1 flex flex-col items-center"><span>⚡</span><span className="font-mono">Swarm Analysis</span><span className="text-slate-400 text-xs">Unlimited runs</span><button className="text-[#1E88E5] underline">Launch →</button></div>
          <div className="flex-1 flex flex-col items-center"><span>📄</span><span className="font-mono">Full Reports</span><span className="text-slate-400 text-xs">PDF download, no watermark</span><button className="text-[#1E88E5] underline">Download →</button></div>
          <div className="flex-1 flex flex-col items-center"><span>🧬</span><span className="font-mono">DNA Vault</span><span className="text-slate-400 text-xs">Save & compare scores</span><button className="text-[#1E88E5] underline">Open Vault →</button></div>
          <div className="flex-1 flex flex-col items-center"><span>📡</span><span className="font-mono">Market Alerts</span><span className="text-slate-400 text-xs">Regime change notifications</span><button className="text-[#1E88E5] underline">Enable →</button></div>
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-[#1E88E5]/30">
            <div className="h-full bg-[#1E88E5]" style={{width:`${trial?.days_remaining ? 100 - (trial.days_remaining/14)*100 : 0}%`}} />
          </div>
          <div className="absolute right-6 bottom-2 text-xs text-slate-400">14 days free · Day {trial?.days_remaining ? 15-trial.days_remaining : 1} of 14 <button className="underline ml-2">What happens after 14 days?</button></div>
        </div>

        {/* SECTION 5 — PORTFOLIO INTELLIGENCE GRID */}
        <div className="flex flex-row gap-6 px-6 pb-8">
          {/* LEFT: Holdings Table */}
          <div className="flex-1 bg-[#0D1117] border border-[#1E293B] rounded p-4 overflow-x-auto">
            {/* Table header */}
            <div className="grid grid-cols-8 gap-2 text-xs text-slate-400 font-sans border-b border-[#1E293B] pb-2 mb-2">
              <div>SYMBOL</div><div>SHARES</div><div>PRICE</div><div>VALUE</div><div>WEIGHT%</div><div>BETA</div><div>30D %</div><div>STATUS</div>
            </div>
            {/* Table rows */}
            {portfolio?.positions?.slice(0,8).map((p:any,i:number) => (
              <div key={p.symbol} className={`grid grid-cols-8 gap-2 text-xs items-center font-mono border-l-2 ${p.stale ? 'border-amber-400 bg-amber-900/10' : 'border-transparent'} ${i>0?'mt-1':''}`} style={{minHeight:28}}>
                <div className="font-bold">{p.symbol}</div>
                <div>{p.shares}</div>
                <div>${p.price}</div>
                <div>${p.value}</div>
                <div className="flex items-center gap-1">{p.weight}% <div className="h-1 w-10 bg-slate-700 rounded"><div className="h-1 rounded bg-[#1E88E5]" style={{width:`${p.weight}%`}} /></div></div>
                <div className={p.beta > 1.5 ? 'text-red-400' : p.beta > 1.0 ? 'text-yellow-400' : 'text-green-400'}>{p.beta} {p.beta > 1.5 ? '(elevated)' : p.beta > 1.0 ? '(mod)' : '(low)'}</div>
                <div className={p.change_30d >= 0 ? 'text-green-400' : 'text-red-400'}>{p.change_30d >= 0 ? '▲' : '▼'} {p.change_30d}%</div>
                <div>{p.stale ? <span className="text-amber-400">⚠ STALE</span> : <span className="text-green-400">● LIVE</span>}</div>
              </div>
            ))}
            {/* Pagination if >8 */}
            {portfolio?.positions?.length > 8 && <div className="text-xs text-slate-400 mt-2">Showing 8 of {portfolio.positions.length} positions. <button className="underline text-[#1E88E5]">Next page →</button></div>}
          </div>
          {/* RIGHT: Mini-cards */}
          <div className="w-[340px] flex flex-col gap-4">
            {/* Mini-card 1: DNA SCORE SUMMARY */}
            <div className="bg-[#0D1117] border border-[#1E293B] rounded p-4 flex flex-col items-center">
              <div className="w-20 h-20 rounded-full border-4 border-[#1E88E5] flex items-center justify-center text-3xl font-mono mb-2">{dna?.score ?? '--'}</div>
              <div className="text-slate-400 text-xs mb-1">{dna?.investor_type ?? '—'}</div>
              <div className="text-white text-sm mb-1">{dna?.insight ?? 'Your behavioral profile'}</div>
              <button className="text-[#1E88E5] underline text-xs">Full breakdown →</button>
            </div>
            {/* Mini-card 2: CONCENTRATION MAP */}
            <div className="bg-[#0D1117] border border-[#1E293B] rounded p-4">
              <div className="text-xs text-slate-400 mb-2">Sector Allocation</div>
              {/* TODO: Render recharts treemap or bar chart here */}
              <div className="h-20 bg-slate-800 rounded mb-2 flex items-center justify-center text-slate-500">[Sector Chart]</div>
              <div className="text-amber-400 text-xs">Tech: 45% — 1.8x above recommended threshold</div>
            </div>
            {/* Mini-card 3: QUICK METRICS ROW */}
            <div className="bg-[#0D1117] border border-[#1E293B] rounded p-4 grid grid-cols-2 gap-2">
              <div>
                <div className="font-mono text-lg">{dna?.beta ?? '--'}</div>
                <div className="text-slate-400 text-xs">Portfolio Beta</div>
              </div>
              <div>
                <div className="font-mono text-lg">{dna?.sharpe ?? '--'}</div>
                <div className="text-slate-400 text-xs">Sharpe (est.)</div>
              </div>
              <div>
                <div className="font-mono text-lg">{dna?.tax_drag ?? '--'}%</div>
                <div className="text-slate-400 text-xs">Tax Drag %</div>
              </div>
              <div>
                <div className="font-mono text-lg">{dna?.correlation_risk ?? '--'}</div>
                <div className="text-slate-400 text-xs">Correlation Risk</div>
              </div>
            </div>
          </div>
        </div>

        {/* AnimatedTerminal component for hero terminal window */}
        {/* Place this at the bottom of the file or in a separate file */}
      </div>
    )
  }
// AnimatedTerminal: typewriter effect for agent activity
function AnimatedTerminal() {
  const lines = [
    '> MARKET_REGIME_AGENT: Fetching FRED macro data...',
    '> MARKET_REGIME_AGENT: Regime classified → GROWTH (conf: 0.87)',
    '> QUANT_AGENT: Computing HHI concentration score...',
    '> QUANT_AGENT: HHI = 0.31 → ELEVATED concentration',
    '> TAX_AGENT: Scanning cost basis for harvest opportunities...',
    '> RISK_SENTINEL: Flagging correlated clusters...',
    '> SYNTHESIZER: Building IC briefing...',
    '> STATUS: Ready. Awaiting portfolio input.'
  ]
  const [displayed, setDisplayed] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      setDisplayed((d) => {
        if (d.length === lines.length) return []
        return [...d, lines[d.length]]
      })
      setIdx((i) => (i + 1) % (lines.length + 1))
    }, 200)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="font-mono text-xs bg-[#0D1117] text-green-400 p-2 rounded h-48 overflow-y-auto" style={{minHeight:192}}>
      {displayed.map((l, i) => (
        <div key={i} className={l.includes('ELEVATED') || l.includes('Flagging') ? 'text-amber-400' : l.includes('Ready') ? 'text-white' : l.includes('conf:') ? 'text-green-400' : 'text-white'}>{l}</div>
      ))}
    </div>
  )
}

  return (
    <div className="flex flex-col">
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
          ) : histError ? (
            <div className="text-red-400 text-sm py-4">{histError}</div>
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
                            background: sectorColor(sector),
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
              {candleError && (
                  <div className="text-red-400 text-xs py-2">{candleError}</div>
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
