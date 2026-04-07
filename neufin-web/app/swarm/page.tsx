'use client'

export const dynamic = 'force-dynamic'

import React, { Suspense, useState, useCallback, useEffect, useMemo } from 'react'
import AppHeader from '@/components/AppHeader'
import SwarmTerminal from '@/components/SwarmTerminal'
import CommandPalette from '@/components/CommandPalette'
import RiskMatrix from '@/components/RiskMatrix'
import PaywallOverlay from '@/components/PaywallOverlay'
import SlidingChatPane from '@/components/SlidingChatPane'
import { useNeufinAnalytics, perfTimer, captureSentrySlowOp } from '@/lib/analytics'
import { PriceWarningBanner } from '@/components/PriceWarningBanner'
import { useUser } from '@/lib/store'
import { debugAuth } from '@/lib/auth-debug'
import { useBackendHealth } from '@/lib/useBackendHealth'
import { motion, AnimatePresence } from 'framer-motion'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import {
  LineChart, Line, XAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Cell,
} from 'recharts'
import {
  Globe, BarChart2, ShieldAlert, Receipt, Zap,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
} from 'lucide-react'

// ── Radix tooltip wrapper ─────────────────────────────────────────────────────
function Tip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            className="z-50 rounded px-2 py-1 text-[10px] text-white"
            style={{ background: '#1a1a1a', border: '1px solid #333', maxWidth: 220, lineHeight: 1.5 }}
            sideOffset={5}
          >
            {content}
            <RadixTooltip.Arrow style={{ fill: '#333' }} />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}

// ── Typewriter text ───────────────────────────────────────────────────────────
function TypewriterText({ text, speed = 8 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = React.useState('')
  React.useEffect(() => {
    setDisplayed('')
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed])
  return <>{displayed}</>
}

// Positions are loaded from localStorage (set by the upload flow) — no hardcoded values
type SwarmPosition = { symbol: string; shares: number; price: number; value: number; weight: number }

function loadPortfolioFromStorage(): { positions: SwarmPosition[]; totalValue: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('dnaResult')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const positions: SwarmPosition[] = (parsed.positions ?? []).map((p: any) => ({
      symbol: p.symbol,
      shares: p.shares ?? 0,
      price:  p.price  ?? 0,
      value:  p.value  ?? 0,
      weight: p.weight ?? 0,
    }))
    const totalValue: number = parsed.total_value ?? positions.reduce((s, p) => s + p.value, 0)
    return positions.length > 0 ? { positions, totalValue } : null
  } catch {
    return null
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Generate 12-month CPI disinflation sparkline — deterministic, no Math.random */
function cpiSparkline(yoy: number | null | undefined): { t: string; v: number }[] {
  const val = typeof yoy === 'number' ? yoy : 2.8
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  // Small seasonal offsets that sum to zero — gives realistic wave pattern
  const seasonal = [0.15, -0.05, 0.20, -0.10, 0.10, -0.15, 0.05, 0.10, -0.10, 0.15, -0.10, -0.25]
  const startOffset = 1.4
  return months.map((m, i) => ({
    t: m,
    v: Math.round((val + startOffset - (startOffset * i) / 11 + (seasonal.at(i) ?? 0)) * 10) / 10,
  }))
}

/** Return background + text color for a correlation value */
function corrCellStyle(v: number, isDiag: boolean): { bg: string; text: string } {
  if (isDiag) return { bg: '#111', text: '#555' }
  if (v >= 0.85) return { bg: 'rgba(239,68,68,0.35)', text: '#fca5a5' }
  if (v >= 0.70) return { bg: 'rgba(245,158,11,0.30)', text: '#fcd34d' }
  if (v >= 0.50) return { bg: 'rgba(99,102,241,0.20)', text: '#a5b4fc' }
  return { bg: 'rgba(34,197,94,0.15)', text: '#86efac' }
}

const REGIME_META: Record<string, { label: string; color: string; bg: string }> = {
  growth:      { label: 'GROWTH REGIME',      color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  inflation:   { label: 'INFLATION REGIME',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  stagflation: { label: 'STAGFLATION REGIME', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  recession:   { label: 'RECESSION REGIME',   color: '#6b7280', bg: 'rgba(107,114,128,0.15)'},
  'risk-off':  { label: 'RISK-OFF REGIME',    color: '#FFB900', bg: 'rgba(255,185,0,0.15)'  },
}

function regimeMeta(regime: string) {
  switch (regime) {
    case 'growth':
      return REGIME_META.growth
    case 'inflation':
      return REGIME_META.inflation
    case 'stagflation':
      return REGIME_META.stagflation
    case 'recession':
      return REGIME_META.recession
    case 'risk-off':
      return REGIME_META['risk-off']
    default:
      return REGIME_META.growth
  }
}

// ── Base card wrapper ──────────────────────────────────────────────────────────
function IntelCard({
  title,
  icon,
  accent,
  children,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  children: React.ReactNode
}) {
  return (
    <div
      className="glass-card-dark rounded-md overflow-hidden flex flex-col transition-all duration-300 hover:shadow-lg"
      style={{ ['--glow' as string]: accent + '22' }}
    >
      <div className="bg-[#141414] px-3 py-2 border-b border-[#2a2a2a] flex items-center gap-2 shrink-0">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>
          {title}
        </span>
      </div>
      <div className="flex-1 px-3 py-3 space-y-2.5 text-[11px]">{children}</div>
    </div>
  )
}

// ── Card 1: Market Regime ──────────────────────────────────────────────────────
function MarketRegimeCard({ data }: { data: Record<string, any> }) {
  const regime  = (data.regime ?? 'growth').toLowerCase().replace(/\s+/g, '-')
  const meta    = regimeMeta(regime)
  const conf    = Math.round((data.confidence ?? 0.82) * 100)
  const cpiYoy  = data.cpi_yoy ?? null
  const cpiStr  = typeof cpiYoy === 'number' ? `${cpiYoy.toFixed(1)}%` : 'N/A'
  const sparkData = cpiSparkline(cpiYoy)

  return (
    <IntelCard title="Market Regime" icon={<Globe size={12} />} accent={meta.color}>
      {/* Regime badge */}
      <div
        className="w-full py-2 px-3 rounded text-center font-bold text-[12px] uppercase tracking-widest"
        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}
      >
        {meta.label}
      </div>

      {/* CPI sparkline */}
      <div>
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-[#555] uppercase tracking-wide">CPI YoY (12m)</span>
          <span style={{ color: meta.color }} className="font-bold">{cpiStr}</span>
        </div>
        <ResponsiveContainer width="100%" height={42}>
          <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={meta.color}
              strokeWidth={1.5}
              dot={false}
              animationDuration={800}
            />
            <Tooltip
              contentStyle={{ background: '#111', border: `1px solid ${meta.color}44`, fontSize: 10, padding: '2px 6px' }}
              formatter={(v: number) => [`${v}%`, 'CPI']}
              labelFormatter={(l) => l}
              labelStyle={{ color: '#888' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence + 3m trend */}
      <div className="flex gap-3">
        <div className="flex-1 bg-[#141414] rounded px-2 py-1.5">
          <p className="text-[9px] text-[#555] uppercase tracking-wider mb-0.5">Confidence</p>
          <p className="font-bold" style={{ color: meta.color }}>{conf}%</p>
        </div>
        {typeof data.cpi_trend_3m === 'number' && (
          <div className="flex-1 bg-[#141414] rounded px-2 py-1.5">
            <p className="text-[9px] text-[#555] uppercase tracking-wider mb-0.5">3m Ann.</p>
            <p className="font-bold text-[#888]">{data.cpi_trend_3m.toFixed(1)}%</p>
          </div>
        )}
      </div>

      {/* Portfolio implication */}
      {data.portfolio_implication && (
        <p className="text-[#666] leading-relaxed border-t border-[#1e1e1e] pt-2">
          {(data.portfolio_implication as string).slice(0, 140)}
          {(data.portfolio_implication as string).length > 140 ? '…' : ''}
        </p>
      )}

      {/* Key drivers */}
      {Array.isArray(data.drivers) && data.drivers.length > 0 && (
        <div className="space-y-1 border-t border-[#1e1e1e] pt-2">
          {(data.drivers as string[]).slice(0, 3).map((d, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <span style={{ color: meta.color }} className="shrink-0 mt-0.5">›</span>
              <span className="text-[#666]">{d}</span>
            </div>
          ))}
        </div>
      )}
    </IntelCard>
  )
}

// ── Card 2: Strategist Intel ───────────────────────────────────────────────────
function StrategistIntelCard({ data }: { data: Record<string, any> }) {
  const sentiment   = (data.sentiment ?? 'constructive') as string
  const sentimentCfg = sentiment === 'cautious'
    ? { color: '#FFB900', Icon: TrendingDown, label: 'CAUTIOUS' }
    : sentiment === 'bearish'
    ? { color: '#ef4444', Icon: TrendingDown, label: 'BEARISH'  }
    : { color: '#00FF00', Icon: TrendingUp,   label: 'CONSTRUCTIVE' }

  return (
    <IntelCard title="Strategist Intel" icon={<Globe size={12} />} accent="#60a5fa">
      {/* Sentiment badge */}
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded"
        style={{ background: `${sentimentCfg.color}15`, border: `1px solid ${sentimentCfg.color}33` }}
      >
        <sentimentCfg.Icon size={12} style={{ color: sentimentCfg.color }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: sentimentCfg.color }}>
          {sentimentCfg.label}
        </span>
      </div>

      {/* Narrative */}
      {data.narrative && (
        <p className="text-[#A8A8A8] leading-relaxed">
          {(data.narrative as string).slice(0, 220)}
          {(data.narrative as string).length > 220 ? '…' : ''}
        </p>
      )}

      {/* Key drivers */}
      {Array.isArray(data.key_drivers) && data.key_drivers.length > 0 && (
        <div className="border-t border-[#1e1e1e] pt-2 space-y-1">
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1.5">Key Drivers</p>
          {(data.key_drivers as string[]).slice(0, 3).map((d, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <span className="text-[#60a5fa] shrink-0 mt-0.5">›</span>
              <span className="text-[#777]">{d}</span>
            </div>
          ))}
        </div>
      )}

      {/* News risks */}
      {Array.isArray(data.news_risks) && data.news_risks.length > 0 && (
        <div className="border-t border-[#1e1e1e] pt-2 space-y-1">
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1.5">News Risks</p>
          {(data.news_risks as string[]).slice(0, 2).map((r, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <AlertTriangle size={10} className="text-[#FFB900] shrink-0 mt-0.5" />
              <span className="text-[#666]">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Positioning advice */}
      {data.positioning_advice && (
        <div className="border-t border-[#1e1e1e] pt-2">
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1">MD Directive</p>
          <p className="text-[#888] italic">{data.positioning_advice as string}</p>
        </div>
      )}
    </IntelCard>
  )
}

// ── Card 3: Quant Analysis ─────────────────────────────────────────────────────
function QuantAnalysisCard({ data }: { data: Record<string, any> }) {
  const hhi     = data.hhi_pts         ?? 9
  const beta    = data.weighted_beta   ?? 1.62
  const sharpe  = data.sharpe_ratio    ?? 0.74
  const avgCorr = data.avg_corr        ?? 0.76
  const interp  = data.hhi_interpretation ?? 'High Concentration'
  const sRating = data.sharpe_rating   ?? 'Acceptable'

  const betaColor  = beta  > 1.8 ? '#ef4444' : beta  > 1.4 ? '#FFB900' : '#00FF00'
  const sharpeColor = sharpe < 0 ? '#ef4444' : sharpe < 0.5 ? '#FFB900' : '#00FF00'
  const corrColor  = avgCorr > 0.80 ? '#ef4444' : avgCorr > 0.65 ? '#FFB900' : '#00FF00'

  const cmData   = data.corr_matrix_data as { symbols: string[]; values: number[][] } | undefined
  const hasCm    = cmData && cmData.symbols.length > 0

  return (
    <IntelCard title="Quant Analysis" icon={<BarChart2 size={12} />} accent="#c084fc">
      {/* Metric rows */}
      <div className="space-y-2">
        {/* HHI */}
        <div>
          <div className="flex justify-between mb-0.5">
            <span className="text-[#555] uppercase tracking-wider text-[9px]">HHI Concentration</span>
            <span className="text-[#FFB900] font-bold text-[10px]">{hhi}/25 · {interp}</span>
          </div>
          <div className="h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
            <div className="h-full bg-[#FFB900] rounded-full" style={{ width: `${(hhi / 25) * 100}%`, transition: 'width 0.7s' }} />
          </div>
        </div>

        {/* Beta, Sharpe, Corr */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          {[
            { label: 'Wtd Beta',  value: beta.toFixed(2),    color: betaColor  },
            { label: 'Sharpe',    value: sharpe.toFixed(2),  color: sharpeColor },
            { label: 'Avg ρ',     value: avgCorr.toFixed(3), color: corrColor  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#141414] rounded px-2 py-1.5 text-center">
              <p className="text-[9px] text-[#555] uppercase tracking-wider mb-0.5">{label}</p>
              <p className="font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Per-symbol betas */}
        {data.beta_map && Object.keys(data.beta_map).length > 0 && (
          <div className="space-y-1 border-t border-[#1e1e1e] pt-2">
            <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Per-Symbol Beta</p>
            {Object.entries(data.beta_map as Record<string, number>)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([sym, b]) => (
                <div key={sym} className="flex items-center gap-2">
                  <span className="text-white font-mono w-12 shrink-0 text-[10px]">{sym}</span>
                  <div className="flex-1 h-[2px] bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((b / 2.5) * 100, 100)}%`,
                        background: b > 1.8 ? '#ef4444' : b > 1.3 ? '#FFB900' : '#00FF00',
                        transition: 'width 0.7s',
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono w-8 text-right" style={{ color: b > 1.8 ? '#ef4444' : b > 1.3 ? '#FFB900' : '#00FF00' }}>
                    {b.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Correlation heatmap */}
      {hasCm && (
        <div className="border-t border-[#1e1e1e] pt-2">
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-2">Correlation Heatmap (top holdings)</p>
          {/* Column labels */}
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `40px repeat(${cmData.symbols.length}, 1fr)` }}
          >
            <div />
            {cmData.symbols.map((s) => (
              <div key={s} className="text-center text-[8px] text-[#444] font-mono pb-0.5">{s}</div>
            ))}
          </div>
          {/* Rows */}
          {cmData.values.map((row, i) => (
            <div
              key={i}
              className="grid gap-px mb-px"
              style={{ gridTemplateColumns: `40px repeat(${cmData.symbols.length}, 1fr)` }}
            >
              <div className="text-[8px] text-[#444] font-mono flex items-center pr-1 justify-end">
                {cmData.symbols.at(i) ?? ''}
              </div>
              {row.map((v, j) => {
                const { bg, text } = corrCellStyle(v, i === j)
                const rowSym = cmData.symbols.at(i) ?? ''
                const colSym = cmData.symbols.at(j) ?? ''
                return (
                  <div
                    key={j}
                    className="aspect-square flex items-center justify-center rounded-sm text-[7px] font-mono cursor-default"
                    style={{ background: bg, color: text }}
                    title={`${rowSym} × ${colSym}: ρ=${v.toFixed(2)}`}
                  >
                    {i === j ? '—' : v.toFixed(2)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Clusters */}
      {Array.isArray(data.clusters) && data.clusters.length > 0 && (
        <div className="border-t border-[#1e1e1e] pt-2">
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Correlation Clusters</p>
          {(data.clusters as string[][]).map((cl, i) => (
            <div key={i} className="flex gap-1 flex-wrap mb-1">
              <span className="text-[#FFB900] text-[9px]">C{i + 1}:</span>
              {cl.map((s) => (
                <span key={s} className="bg-[#FFB900]/10 text-[#FFB900] border border-[#FFB900]/20 rounded px-1 text-[9px] font-mono">
                  {s}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </IntelCard>
  )
}

// ── Card 4: Tax Optimization ───────────────────────────────────────────────────
function TaxOptimizationCard({ data }: { data: Record<string, any> }) {
  const available = data.available as boolean
  const liability = (data.total_liability ?? 0) as number
  const taxDrag   = data.tax_drag_pct as number | null
  const taxPts    = (data.tax_pts ?? 10) as number
  const harvest   = (data.harvest_opportunities ?? []) as any[]

  return (
    <IntelCard title="Tax Optimization" icon={<Receipt size={12} />} accent="#34d399">
      {!available ? (
        /* No cost basis */
        <div className="space-y-2">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded p-3 text-center space-y-2">
            <Receipt size={20} className="text-[#333] mx-auto" />
            <p className="text-[#555] text-[10px] leading-relaxed">{data.narrative as string}</p>
            <div className="text-[9px] text-[#444] font-mono">
              Add <span className="text-[#34d399]">cost_basis</span> column to CSV to unlock
            </div>
          </div>
          {/* Tax score bar */}
          <div>
            <div className="flex justify-between mb-0.5">
              <span className="text-[#555] text-[9px] uppercase tracking-wider">Tax Alpha Score</span>
              <span className="text-[#34d399] font-bold text-[10px]">{taxPts}/20</span>
            </div>
            <div className="h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
              <div className="h-full bg-[#34d399] rounded-full" style={{ width: `${(taxPts / 20) * 100}%` }} />
            </div>
          </div>
        </div>
      ) : (
        /* Has cost basis */
        <div className="space-y-2">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#141414] rounded px-2 py-1.5">
              <p className="text-[9px] text-[#555] uppercase tracking-wider mb-0.5">Unrealized Liability</p>
              <p className="font-bold text-[#ef4444]">
                ${liability.toLocaleString()}
              </p>
            </div>
            <div className="bg-[#141414] rounded px-2 py-1.5">
              <p className="text-[9px] text-[#555] uppercase tracking-wider mb-0.5">Tax Drag</p>
              <p className="font-bold" style={{ color: taxDrag ? (taxDrag > 3 ? '#ef4444' : '#FFB900') : '#888' }}>
                {taxDrag !== null ? `${taxDrag.toFixed(1)}% / yr` : 'N/A'}
              </p>
            </div>
          </div>

          {/* Tax score */}
          <div>
            <div className="flex justify-between mb-0.5">
              <span className="text-[#555] text-[9px] uppercase">Tax Alpha Score</span>
              <span className="text-[#34d399] font-bold text-[10px]">{taxPts}/20</span>
            </div>
            <div className="h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
              <div className="h-full bg-[#34d399] rounded-full" style={{ width: `${(taxPts / 20) * 100}%` }} />
            </div>
          </div>

          {/* Harvest opportunities */}
          {harvest.length > 0 && (
            <div className="border-t border-[#1e1e1e] pt-2">
              <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1.5">Harvest Opportunities</p>
              {harvest.slice(0, 3).map((h: any, i: number) => (
                <div key={i} className="flex items-center justify-between mb-1">
                  <span className="text-white font-mono text-[10px]">{h.symbol}</span>
                  <span className="text-[#34d399] text-[10px] font-bold">
                    +${(h.harvest_credit ?? 0).toLocaleString()} saved
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </IntelCard>
  )
}

// ── Card 5: Risk Watchdog ──────────────────────────────────────────────────────
function RiskWatchdogCard({ data }: { data: Record<string, any> }) {
  const level  = (data.risk_level ?? 'medium') as string
  const score  = (data.risk_score ?? 5.0) as number
  const risks  = (data.primary_risks  ?? []) as string[]
  const mits   = (data.mitigations    ?? []) as string[]

  const levelCfg = level === 'high'
    ? { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: 'HIGH RISK',   icon: AlertTriangle }
    : level === 'low'
    ? { color: '#00FF00', bg: 'rgba(0,255,0,0.10)',   label: 'LOW RISK',    icon: CheckCircle   }
    : { color: '#FFB900', bg: 'rgba(255,185,0,0.15)', label: 'MEDIUM RISK', icon: Minus         }

  // Gauge data for RadialBar
  const gaugeData = [{ name: 'score', value: Math.round((score / 10) * 100), fill: levelCfg.color }]

  return (
    <IntelCard title="Risk Watchdog" icon={<ShieldAlert size={12} />} accent={levelCfg.color}>
      {/* Level badge + gauge */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 flex-1 py-1.5 px-2 rounded"
          style={{ background: levelCfg.bg, border: `1px solid ${levelCfg.color}33` }}
        >
          <levelCfg.icon size={13} style={{ color: levelCfg.color }} />
          <span className="text-[11px] font-bold" style={{ color: levelCfg.color }}>{levelCfg.label}</span>
        </div>
        {/* Mini gauge */}
        <div className="relative w-14 h-14 shrink-0">
          <RadialBarChart
            width={56}
            height={56}
            innerRadius={18}
            outerRadius={26}
            data={gaugeData}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#1a1a1a' }}>
              <Cell fill={levelCfg.color} />
            </RadialBar>
          </RadialBarChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] font-bold" style={{ color: levelCfg.color }}>{score.toFixed(1)}</span>
            <span className="text-[7px] text-[#555]">/10</span>
          </div>
        </div>
      </div>

      {/* Risk flags */}
      {risks.length > 0 && (
        <div className="space-y-1.5 border-t border-[#1e1e1e] pt-2">
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Risk Flags</p>
          {risks.slice(0, 3).map((r, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <span style={{ color: levelCfg.color }} className="shrink-0 mt-0.5 text-[10px]">⚠</span>
              <span className="text-[#777] leading-relaxed">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top mitigation */}
      {mits.length > 0 && (
        <div className="border-t border-[#1e1e1e] pt-2">
          <p className="text-[9px] text-[#555] uppercase tracking-widest mb-1">Top Mitigation</p>
          <div className="flex gap-1.5 items-start">
            <span className="text-[#00FF00] shrink-0 mt-0.5">›</span>
            <span className="text-[#888]">{mits[0]}</span>
          </div>
        </div>
      )}
    </IntelCard>
  )
}

// ── Card 6: Alpha Scout ────────────────────────────────────────────────────────
function AlphaScoutCard({ data }: { data: Record<string, any> }) {
  const opps = (data.opportunities ?? []) as any[]

  return (
    <IntelCard title="Alpha Scout" icon={<Zap size={12} />} accent="#FFB900">
      <p className="text-[#555] text-[10px] uppercase tracking-widest pb-1">
        Consider diversifying into:
      </p>
      {opps.length === 0 ? (
        <p className="text-[#444] text-center py-4">No opportunities identified</p>
      ) : (
        <div className="space-y-3">
          {opps.slice(0, 3).map((o: any, i: number) => {
            const conf = Math.round((o.confidence ?? 0.65) * 100)
            const confColor = conf >= 75 ? '#00FF00' : conf >= 60 ? '#FFB900' : '#6b7280'
            return (
              <div key={i} className="border border-[#1e1e1e] rounded p-2 space-y-1.5">
                {/* Symbol + confidence */}
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white text-[13px]">{o.symbol}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${conf}%`, background: confColor, transition: 'width 0.7s' }}
                      />
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: confColor }}>{conf}%</span>
                  </div>
                </div>
                {/* Reason */}
                <p className="text-[#666] leading-relaxed">
                  {(o.reason as string).slice(0, 160)}
                  {(o.reason as string).length > 160 ? '…' : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Spacer note */}
      <p className="text-[#333] text-[9px] text-center border-t border-[#1e1e1e] pt-2 uppercase tracking-widest">
        Alpha Scout · {opps.length} opportunity(ies) identified
      </p>
    </IntelCard>
  )
}

// ── Existing helper components ─────────────────────────────────────────────────
function renderBoldInline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="text-white font-bold">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

function ICBriefing({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  return (
    <div className="space-y-[3px] text-[11px] leading-relaxed">
      {lines.map((line, idx) => {
        if (/^## /.test(line)) {
          return (
            <div key={idx} className="pt-4 first:pt-0">
              <div className="text-[#FFB900] font-bold text-[12px] uppercase tracking-widest border-b border-[#FFB900]/20 pb-1 mb-2">
                {line.replace(/^##\s*/, '')}
              </div>
            </div>
          )
        }
        if (/^### /.test(line)) {
          return (
            <div key={idx} className="text-[#aaa] font-bold uppercase tracking-wider text-[10px] mt-2">
              {line.replace(/^###\s*/, '')}
            </div>
          )
        }
        if (/^[-*]\s/.test(line)) {
          const content = line.replace(/^[-*]\s/, '')
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#00FF00] shrink-0 mt-0.5">›</span>
              <span className="text-[#C8C8C8]">{renderBoldInline(content, `b${idx}`)}</span>
            </div>
          )
        }
        if (/^\d+\.\s/.test(line)) {
          const num     = line.match(/^(\d+)\./)?.[1]
          const content = line.replace(/^\d+\.\s/, '')
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#FFB900] shrink-0 font-bold w-4">{num}.</span>
              <span className="text-[#C8C8C8]">{renderBoldInline(content, `n${idx}`)}</span>
            </div>
          )
        }
        if (/^---+$/.test(line.trim())) {
          return <div key={idx} className="border-t border-[#2a2a2a] my-2" />
        }
        if (!line.trim()) {
          return <div key={idx} className="h-1" />
        }
        return (
          <p key={idx} className="text-[#A8A8A8]">
            {renderBoldInline(line, `p${idx}`)}
          </p>
        )
      })}
    </div>
  )
}

function ScorePill({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[9px] uppercase tracking-wider">
        <span className="text-[#555]">{label}</span>
        <span style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SwarmPage() {
  const [traces,          setTraces]         = useState<string[]>([])
  const [isRunning,       setIsRunning]       = useState(false)
  const [thesis,          setThesis]          = useState<Record<string, any> | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [unlockedLocally, setUnlockedLocally] = useState(false)
  const [toast,           setToast]           = useState<string | null>(null)
  const [chatOpen,        setChatOpen]        = useState(false)
  const [failedTickers,   setFailedTickers]   = useState<string[]>([])
  const [positions,       setPositions]       = useState<SwarmPosition[]>([])
  const [totalValue,      setTotalValue]      = useState(0)

  const { isPro, token, loading: authLoading, user } = useUser()
  const { capture } = useNeufinAnalytics()
  const isTrialBypass = useMemo(() => {
    const createdAt = user?.created_at
    if (!createdAt) return false
    const createdTs = new Date(createdAt).getTime()
    if (!Number.isFinite(createdTs)) return false
    const ageDays = (Date.now() - createdTs) / (1000 * 60 * 60 * 24)
    return ageDays < 14
  }, [user?.created_at])
  const isUnlocked = isPro || unlockedLocally || isTrialBypass

  useEffect(() => {
    debugAuth('swarm:mount')
  }, [])

  // Load portfolio from localStorage (written by upload/analyze flow)
  useEffect(() => {
    const stored = loadPortfolioFromStorage()
    if (stored) {
      setPositions(stored.positions)
      setTotalValue(stored.totalValue)
    }
  }, [])

  useBackendHealth()

  const API_BASE = ''

  const handlePaymentSuccess = useCallback(async () => {
    const sessionId = typeof window !== 'undefined'
      ? localStorage.getItem('neufin-session-id')
      : null

    if (sessionId && token) {
      try {
        await fetch(`${API_BASE}/api/vault/claim-session`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ session_id: sessionId }),
        })
        localStorage.removeItem('neufin-session-id')
      } catch {
        // non-critical
      }
    }

    setUnlockedLocally(true)
    setToast('REPORT UNLOCKED — Full IC Briefing now available')
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('checkout_success')
      window.history.replaceState({}, '', url.toString())
    }
    setTimeout(() => setToast(null), 5000)
  }, [API_BASE, token])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout_success') === '1') {
      handlePaymentSuccess()
    }
  }, [handlePaymentSuccess])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/reports/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          plan: 'single',
          positions: positions.map((p) => ({
            symbol: p.symbol,
            shares: p.shares,
            price: p.price,
            value: p.value,
            weight: p.weight,
          })),
          success_url: `${window.location.origin}/swarm?checkout_success=1`,
          cancel_url: window.location.href,
        }),
      })
      const data = await res.json()
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch {
      setCheckoutLoading(false)
    }
  }, [API_BASE, token, positions])

  // Restore last report from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedId = localStorage.getItem('neufin-swarm-report-id')
    if (!savedId || thesis) return
    fetch(`${API_BASE}/api/swarm/report/${savedId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.investment_thesis) {
          setThesis(data.investment_thesis)
          setTraces(['[System] Previous session report restored.'])
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, token])

  const runSwarm = async () => {
    if (positions.length === 0) return
    setTraces([])
    setThesis(null)
    setIsRunning(true)

    const portfolioId = typeof window !== 'undefined'
      ? (JSON.parse(localStorage.getItem('dnaResult') ?? 'null')?.record_id ?? undefined)
      : undefined
    capture('swarm_analysis_started', { portfolio_id: portfolioId })
    perfTimer.start('swarm')

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }

      const res = await fetch(`${API_BASE}/api/swarm/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          positions,
          total_value: totalValue
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const data = await res.json()
      const newThesis = data.investment_thesis ?? null
      setTraces(data.agent_trace ?? [])
      setThesis(newThesis)
      if (data.failed_tickers?.length) setFailedTickers(data.failed_tickers)

      const swarmDurationMs = perfTimer.end('swarm') ?? 0
      capture('swarm_analysis_completed', {
        report_id:   newThesis?.swarm_report_id,
        duration_ms: swarmDurationMs,
      })
      captureSentrySlowOp('swarm_analysis', swarmDurationMs)

      if (newThesis?.swarm_report_id && typeof window !== 'undefined') {
        localStorage.setItem('neufin-swarm-report-id', newThesis.swarm_report_id)
      }
    } catch (e: any) {
      perfTimer.end('swarm') // clean up timer
      setTraces(prev => [...prev, `[System] ERROR: ${e.message}`])
    } finally {
      setIsRunning(false)
    }
  }

  const sb = thesis?.score_breakdown ?? {}

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-500/40 border-t-green-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-[#080808] text-white"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace" }}
    >
      <AppHeader />
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#0D0D0D', border: '1px solid #FFB900',
          color: '#FFB900', fontFamily: "'Fira Code','Courier New',monospace",
          fontSize: 11, letterSpacing: 2, padding: '10px 24px',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          boxShadow: '0 0 24px #FFB90033',
          animation: 'fadeInDown 0.2s ease',
        }}>
          ◈ {toast}
          <style>{`@keyframes fadeInDown { from { opacity:0;transform:translateX(-50%) translateY(-8px); } to { opacity:1;transform:translateX(-50%) translateY(0); } }`}</style>
        </div>
      )}

      {/* Nav */}
      <nav className="border-b border-[#1e1e1e] bg-[#0d0d0d] px-6 h-12 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-[#FFB900] font-bold text-[13px] tracking-widest hover:text-[#FFD040] transition-colors">NEUFIN</a>
          <span className="text-[#333] text-[11px]">/</span>
          <span className="text-[#555] text-[11px] uppercase tracking-widest">Investment Committee</span>
        </div>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <CommandPalette
              positions={positions}
              total_value={totalValue}
              onResponse={r => setTraces(prev => [...prev, ...r.thinking_steps])}
            />
          </Suspense>
          {thesis && (
            <button
              onClick={() => setChatOpen(o => !o)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest border transition-all"
              style={{
                background:  chatOpen ? '#FFB90022' : 'transparent',
                color:       '#FFB900',
                borderColor: '#FFB90066',
              }}
            >
              {chatOpen ? '✕ CLOSE MD' : '◈ ASK MD'}
            </button>
          )}
          <button
            onClick={runSwarm}
            disabled={isRunning || positions.length === 0}
            title={positions.length === 0 ? 'Upload a portfolio on neufin.app first' : undefined}
            className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded border transition-all disabled:opacity-40"
            style={{
              background:  isRunning ? 'transparent' : '#FFB900',
              color:       isRunning ? '#FFB900'     : '#000',
              borderColor: '#FFB900',
            }}
          >
            {isRunning ? '● RUNNING...' : positions.length === 0 ? '▶ NO PORTFOLIO' : '▶ RUN SWARM'}
          </button>
        </div>
      </nav>

      {/* Main 3-column layout */}
      <div className="max-w-[1600px] mx-auto px-4 py-5 grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Agent trace terminal */}
        <div className="xl:col-span-5">
          <SwarmTerminal traces={traces} isRunning={isRunning} />
        </div>

        {/* IC Briefing */}
        <div className="xl:col-span-5">
          <div className="bg-[#0D0D0D] border border-[#2a2a2a] rounded-md overflow-hidden flex flex-col h-full min-h-[420px]">
            <div className="bg-[#141414] px-4 py-2 border-b border-[#2a2a2a] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[#00FF00] text-[11px] font-bold uppercase tracking-widest">IC BRIEFING</span>
                <span className="text-[#333] text-[10px]">|</span>
                <span className="text-[#555] text-[10px] uppercase">PE Managing Director</span>
              </div>
              {thesis?.dna_score && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#555] uppercase">DNA</span>
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: thesis.dna_score >= 70 ? '#00FF00' : thesis.dna_score >= 45 ? '#FFB900' : '#ff4444' }}
                  >
                    {thesis.dna_score}<span className="text-[#555] text-[10px]">/100</span>
                  </span>
                </div>
              )}
            </div>
            <div
              className="flex-1 overflow-y-auto px-5 py-4"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a #0d0d0d' }}
            >
              {!thesis && !isRunning && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <div className="text-[#222] text-[40px]">◈</div>
                  <p className="text-[#333] text-[11px] uppercase tracking-widest">
                    IC Briefing awaiting swarm execution
                  </p>
                  <p className="text-[#222] text-[10px]">
                    Click ▶ RUN SWARM to generate the Investment Committee report
                  </p>
                </div>
              )}
              {isRunning && !thesis && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-[#FFB900] text-[11px] animate-pulse uppercase tracking-widest">
                    ● MD is reviewing analyst outputs...
                  </div>
                </div>
              )}
              {thesis?.briefing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <ICBriefing markdown={thesis.briefing} />
                </motion.div>
              )}
            </div>
            {thesis && (
              <div className="bg-[#111] border-t border-[#1e1e1e] px-4 py-2 flex gap-3 flex-wrap shrink-0">
                <MetaItem label="REGIME"  value={thesis.regime    ?? 'N/A'} color="blue" />
                <MetaItem label="β"       value={thesis.weighted_beta?.toFixed(2)  ?? '—'} color="amber" />
                <MetaItem label="SHARPE"  value={thesis.sharpe_ratio?.toFixed(2)   ?? '—'} color={
                  (thesis.sharpe_ratio ?? 0) > 1 ? 'green' : (thesis.sharpe_ratio ?? 0) > 0 ? 'amber' : 'red'
                } />
                <MetaItem label="ρ avg"   value={thesis.avg_correlation?.toFixed(3) ?? '—'} color="amber" />
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="xl:col-span-2 space-y-3">
          <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md overflow-hidden">
            <div className="bg-[#141414] px-3 py-1.5 border-b border-[#2a2a2a]">
              <span className="text-[10px] text-[#FFB900] font-bold uppercase tracking-widest">Holdings</span>
            </div>
            <div className="px-3 py-2 space-y-2">
              {positions.length === 0 ? (
                <div className="text-[10px] text-[#444] py-2 text-center">
                  Upload portfolio on neufin.app to populate
                </div>
              ) : positions.map(p => (
                <div key={p.symbol} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white font-bold">{p.symbol}</span>
                    <span className="text-[#666]">{Math.round(p.weight * 100)}%</span>
                  </div>
                  <div className="h-[2px] bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FFB900]/70 rounded-full"
                      style={{ width: `${Math.round(p.weight * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {positions.length > 0 && (
                <div className="pt-1.5 border-t border-[#1e1e1e] flex justify-between text-[10px]">
                  <span className="text-[#444]">AUM</span>
                  <span className="text-[#00FF00] font-bold">${totalValue.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {thesis && Object.keys(sb).length > 0 && (
            <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md overflow-hidden">
              <div className="bg-[#141414] px-3 py-1.5 border-b border-[#2a2a2a]">
                <span className="text-[10px] text-[#00FF00] font-bold uppercase tracking-widest">Score</span>
              </div>
              <div className="px-3 py-3 space-y-2.5">
                <ScorePill label="HHI"   value={sb.hhi_concentration ?? 0} max={25}  color="#FFB900" />
                <ScorePill label="Beta"  value={sb.beta_risk         ?? 0} max={25}  color="#60a5fa" />
                <ScorePill label="Tax α" value={sb.tax_alpha         ?? 0} max={20}  color="#34d399" />
                <ScorePill label="Corr"  value={sb.correlation       ?? 0} max={30}  color="#c084fc" />
                <div className="border-t border-[#1e1e1e] pt-2 flex justify-between text-[10px]">
                  <span className="text-[#555] uppercase tracking-wider">DNA</span>
                  <span className="text-white font-bold">{thesis.dna_score}/100</span>
                </div>
              </div>
            </div>
          )}

          <div className="text-center space-y-1 py-2">
            <div className="text-[10px] text-[#333]">
              Press <kbd className="border border-[#2a2a2a] rounded px-1 py-0.5 text-[#444]">⌘K</kbd> to query agents
            </div>
            <div className="text-[9px] text-[#222] uppercase tracking-widest">
              Powered by LangGraph
            </div>
          </div>
        </div>

        {/* Risk Matrix */}
        {thesis && (
          ((thesis as any).stress_results?.length > 0 || (thesis as any).risk_factors?.length > 0)
        ) && (() => {
          const clusters = ((thesis as any).risk_factors ?? []).map((f: any) => ({
            ticker:      f.symbol,
            beta:        f.beta ?? 1.0,
            correlation: f.spy_correlation ?? 0,
            weight:      (f.weight_pct ?? 0) / 100,
          }))
          const stressResults = ((thesis as any).stress_results ?? []).map((s: any) => ({
            scenario:            s.label ?? s.scenario_name ?? s.key,
            impact:              s.portfolio_return_pct ?? s.impact_pct ?? 0,
            spyImpact:           s.spy_return_pct ?? s.benchmark_impact?.SPY ?? 0,
            qqqImpact:           s.qqq_return_pct ?? s.benchmark_impact?.QQQ ?? 0,
            weakLink:            s.weakest_link?.symbol ?? s.weak_link?.ticker ?? '—',
            alpha_gap_narrative: s.alpha_gap_narrative ?? undefined,
          }))
          return (
            <div className="xl:col-span-12 mt-1">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-[#FFB900] font-bold text-[11px] tracking-widest uppercase">RISK MATRIX</span>
                <span className="text-[#333] text-[10px]">|</span>
                <span className="text-[#555] text-[10px] uppercase tracking-widest">Cluster Map · Historical Regime Stress</span>
              </div>
              <PaywallOverlay locked={!isUnlocked} onUnlock={startCheckout} loading={checkoutLoading}>
                <RiskMatrix clusters={clusters} stressResults={stressResults} />
              </PaywallOverlay>
            </div>
          )
        })()}

      </div>

      {/* ── Research Intelligence Grid ────────────────────────────────────────── */}
      {thesis && (
        <div className="max-w-[1600px] mx-auto px-4 pb-8">
          <div className="border-t border-[#1e1e1e] pt-5 mb-4 flex items-center gap-3">
            <span className="text-[#FFB900] font-bold text-[11px] tracking-widest uppercase">
              Research Intelligence
            </span>
            <span className="text-[#333] text-[10px]">|</span>
            <span className="text-[#555] text-[10px] uppercase tracking-widest">
              7-Agent Deep Analysis · {thesis.regime ?? 'N/A'} Regime
            </span>
            {thesis.dna_score && (
              <>
                <span className="text-[#333] text-[10px]">|</span>
                <span className="text-[#555] text-[10px] uppercase">
                  DNA{' '}
                  <span
                    className="font-bold"
                    style={{ color: thesis.dna_score >= 70 ? '#00FF00' : thesis.dna_score >= 45 ? '#FFB900' : '#ef4444' }}
                  >
                    {thesis.dna_score}/100
                  </span>
                </span>
              </>
            )}
          </div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            initial="hidden"
            animate="visible"
          >
            {[
              thesis.market_regime    && <MarketRegimeCard    key="regime"     data={thesis.market_regime}    />,
              thesis.strategist_intel && <StrategistIntelCard key="strategist" data={thesis.strategist_intel} />,
              thesis.quant_analysis   && <QuantAnalysisCard   key="quant"      data={thesis.quant_analysis}   />,
              thesis.tax_report       && <TaxOptimizationCard key="tax"        data={thesis.tax_report}        />,
              thesis.risk_sentinel    && <RiskWatchdogCard    key="risk"       data={thesis.risk_sentinel}     />,
              thesis.alpha_scout      && <AlphaScoutCard      key="alpha"      data={thesis.alpha_scout}       />,
            ].filter(Boolean).map((card, i) => (
              <motion.div
                key={i}
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } }}
              >
                {card}
              </motion.div>
            ))}
            {/* If any card data is missing, show a skeleton placeholder */}
            {[thesis.market_regime, thesis.strategist_intel, thesis.quant_analysis, thesis.tax_report, thesis.risk_sentinel, thesis.alpha_scout]
              .filter(Boolean).length < 6 &&
              Array.from({ length: 6 - [thesis.market_regime, thesis.strategist_intel, thesis.quant_analysis, thesis.tax_report, thesis.risk_sentinel, thesis.alpha_scout].filter(Boolean).length })
                .map((_, i) => (
                  <motion.div
                    key={`skel-${i}`}
                    variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                    className="shimmer rounded-md h-48"
                  />
                ))
            }
          </motion.div>
        </div>
      )}

      {/* Sliding MD Chat */}
      <PriceWarningBanner
        failedTickers={failedTickers}
        onDismiss={() => setFailedTickers([])}
      />

      <SlidingChatPane
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        recordId={thesis?.swarm_report_id ?? null}
        thesisContext={thesis ?? undefined}
        positions={positions}
        totalValue={totalValue}
        apiBase={API_BASE}
      />
    </div>
  )
}

const META_TIPS: Record<string, string> = {
  REGIME:  'Macro regime detected by FRED CPI analysis — growth, inflation, stagflation, recession, or risk-off',
  'β':     'Weighted portfolio beta vs S&P 500. >1 = amplified market moves, <1 = defensive',
  SHARPE:  'Risk-adjusted return ratio. >1 is good, >2 is excellent, <0 is losing on a risk-adjusted basis',
  'ρ avg': 'Average pairwise Pearson correlation between holdings. High correlation = limited diversification',
}

function metaTip(label: string): string | undefined {
  switch (label) {
    case 'REGIME':
      return META_TIPS.REGIME
    case 'β':
      return META_TIPS['β']
    case 'SHARPE':
      return META_TIPS.SHARPE
    case 'ρ avg':
      return META_TIPS['ρ avg']
    default:
      return undefined
  }
}

function MetaItem({ label, value, color }: { label: string; value: string; color: string }) {
  const cls = color === 'green' ? 'text-[#00FF00]'
            : color === 'amber' ? 'text-[#FFB900]'
            : color === 'blue'  ? 'text-blue-400'
            : color === 'red'   ? 'text-red-400'
            : 'text-[#888]'
  const tip = metaTip(label)
  const inner = (
    <div className="flex items-center gap-1 text-[10px] cursor-help">
      <span className="text-[#444] uppercase border-b border-dotted border-[#333]">{label}:</span>
      <span className={`font-bold ${cls}`}>{value}</span>
    </div>
  )
  return tip ? <Tip content={tip}>{inner}</Tip> : inner
}
