'use client'

export const dynamic = 'force-dynamic'

import React, { Suspense, useState, useCallback, useEffect, useMemo } from 'react'
import AppHeader from '@/components/AppHeader'
import SwarmTerminal from '@/components/SwarmTerminal'
import type { AgentTraceItem } from '@/components/SwarmTerminal'
import CommandPalette from '@/components/CommandPalette'
import RiskMatrix from '@/components/RiskMatrix'
import PaywallOverlay from '@/components/PaywallOverlay'
import SlidingChatPane from '@/components/SlidingChatPane'
import {
  SwarmSourcesPanel,
  type SwarmObservabilityPayload,
  type SwarmSourcesPayload,
} from '@/components/swarm/SwarmSourcesPanel'
import { useNeufinAnalytics, perfTimer, captureSentrySlowOp } from '@/lib/analytics'
import { apiFetch, apiGet, apiPost } from '@/lib/api-client'
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
            className="z-50 rounded-md border border-border bg-white px-2 py-1.5 text-xs text-slate2 shadow-md"
            style={{ maxWidth: 220, lineHeight: 1.5 }}
            sideOffset={5}
          >
            {content}
            <RadixTooltip.Arrow style={{ fill: '#e2e8f0' }} />
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
type JobStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed' | 'result_unavailable'
type SwarmResult = Record<string, any>

/** Retry fetching the swarm result up to `retries` times with a 2s delay.
 *  Needed because the backend persist is async — the result may be in Supabase
 *  a few seconds after the job transitions to "complete" in the job store. */
async function fetchResultWithRetry(id: string, retries = 3): Promise<SwarmResult> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await apiGet<SwarmResult>(`/api/swarm/result/${id}`)
      if (result && !('error' in result && result.error)) return result
    } catch (err) {
      if (i < retries - 1) {
        await new Promise<void>(r => setTimeout(r, 2000))
      } else {
        throw err
      }
    }
  }
  throw new Error('Result not available after retries')
}

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
  if (isDiag) return { bg: '#f1f5f9', text: '#64748b' }
  if (v >= 0.85) return { bg: 'rgba(239,68,68,0.12)', text: '#b91c1c' }
  if (v >= 0.70) return { bg: 'rgba(245,166,35,0.15)', text: '#b45309' }
  if (v >= 0.50) return { bg: 'rgba(30,184,204,0.12)', text: '#0e7490' }
  return { bg: 'rgba(22,163,74,0.12)', text: '#15803d' }
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
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-light bg-surface-2 px-3 py-2">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-navy" style={{ color: accent }}>
          {title}
        </span>
      </div>
      <div className="flex-1 space-y-2.5 px-3 py-3 text-sm text-slate2">{children}</div>
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
        className="w-full py-2 px-3 rounded text-center font-bold text-sm uppercase tracking-widest"
        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}
      >
        {meta.label}
      </div>

      {/* CPI sparkline */}
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="uppercase tracking-wide text-muted2">CPI YoY (12m)</span>
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
              contentStyle={{
                background: '#ffffff',
                border: `1px solid ${meta.color}44`,
                fontSize: 10,
                padding: '4px 8px',
                borderRadius: 6,
                color: '#0f172a',
              }}
              formatter={(v: number) => [`${v}%`, 'CPI']}
              labelFormatter={(l) => l}
              labelStyle={{ color: '#64748b' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence + 3m trend */}
      <div className="flex gap-3">
        <div className="flex-1 rounded border border-border-light bg-surface-2 px-2 py-1.5">
          <p className="mb-0.5 text-xs uppercase tracking-wider text-muted2">Confidence</p>
          <p className="font-bold" style={{ color: meta.color }}>{conf}%</p>
        </div>
        {typeof data.cpi_trend_3m === 'number' && (
          <div className="flex-1 rounded border border-border-light bg-surface-2 px-2 py-1.5">
            <p className="mb-0.5 text-xs uppercase tracking-wider text-muted2">3m Ann.</p>
            <p className="font-bold text-slate2">{data.cpi_trend_3m.toFixed(1)}%</p>
          </div>
        )}
      </div>

      {/* Portfolio implication */}
      {data.portfolio_implication && (
        <p className="border-t border-border-light pt-2 leading-relaxed text-slate2">
          {(data.portfolio_implication as string).slice(0, 140)}
          {(data.portfolio_implication as string).length > 140 ? '…' : ''}
        </p>
      )}

      {/* Key drivers */}
      {Array.isArray(data.drivers) && data.drivers.length > 0 && (
        <div className="space-y-1 border-t border-border-light pt-2">
          {(data.drivers as string[]).slice(0, 3).map((d, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <span style={{ color: meta.color }} className="shrink-0 mt-0.5">›</span>
              <span className="text-slate2">{d}</span>
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
    ? { color: '#b45309', Icon: TrendingDown, label: 'CAUTIOUS' }
    : sentiment === 'bearish'
    ? { color: '#ef4444', Icon: TrendingDown, label: 'BEARISH'  }
    : { color: '#15803d', Icon: TrendingUp,   label: 'CONSTRUCTIVE' }

  return (
    <IntelCard title="Strategist Intel" icon={<Globe size={12} />} accent="#60a5fa">
      {/* Sentiment badge */}
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded"
        style={{ background: `${sentimentCfg.color}15`, border: `1px solid ${sentimentCfg.color}33` }}
      >
        <sentimentCfg.Icon size={12} style={{ color: sentimentCfg.color }} />
        <span className="text-sm font-bold uppercase tracking-widest" style={{ color: sentimentCfg.color }}>
          {sentimentCfg.label}
        </span>
      </div>

      {/* Narrative */}
      {data.narrative && (
        <p className="leading-relaxed text-slate2">
          {(data.narrative as string).slice(0, 220)}
          {(data.narrative as string).length > 220 ? '…' : ''}
        </p>
      )}

      {/* Key drivers */}
      {Array.isArray(data.key_drivers) && data.key_drivers.length > 0 && (
        <div className="space-y-1 border-t border-border-light pt-2">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted2">Key drivers</p>
          {(data.key_drivers as string[]).slice(0, 3).map((d, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <span className="shrink-0 text-primary-dark mt-0.5">›</span>
              <span className="text-slate2">{d}</span>
            </div>
          ))}
        </div>
      )}

      {/* News risks */}
      {Array.isArray(data.news_risks) && data.news_risks.length > 0 && (
        <div className="space-y-1 border-t border-border-light pt-2">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted2">News risks</p>
          {(data.news_risks as string[]).slice(0, 2).map((r, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber-700" />
              <span className="text-slate2">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Positioning advice */}
      {data.positioning_advice && (
        <div className="border-t border-border-light pt-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted2">MD directive</p>
          <p className="italic text-muted2">{data.positioning_advice as string}</p>
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

  const betaColor  = beta  > 1.8 ? '#ef4444' : beta  > 1.4 ? '#b45309' : '#15803d'
  const sharpeColor = sharpe < 0 ? '#ef4444' : sharpe < 0.5 ? '#b45309' : '#15803d'
  const corrColor  = avgCorr > 0.80 ? '#ef4444' : avgCorr > 0.65 ? '#b45309' : '#15803d'

  const cmData   = data.corr_matrix_data as { symbols: string[]; values: number[][] } | undefined
  const hasCm    = cmData && Array.isArray(cmData.symbols) && cmData.symbols.length > 0

  return (
    <IntelCard title="Quant Analysis" icon={<BarChart2 size={12} />} accent="#c084fc">
      {/* Metric rows */}
      <div className="space-y-2">
        {/* HHI */}
        <div>
          <div className="mb-0.5 flex justify-between">
            <span className="text-xs uppercase tracking-wider text-muted2">HHI concentration</span>
            <span className="text-xs font-bold text-amber-800">{hhi}/25 · {interp}</span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-amber-600" style={{ width: `${(hhi / 25) * 100}%`, transition: 'width 0.7s' }} />
          </div>
        </div>

        {/* Beta, Sharpe, Corr */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          {[
            { label: 'Wtd Beta',  value: beta.toFixed(2),    color: betaColor  },
            { label: 'Sharpe',    value: sharpe.toFixed(2),  color: sharpeColor },
            { label: 'Avg ρ',     value: avgCorr.toFixed(3), color: corrColor  },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded border border-border-light bg-surface-2 px-2 py-1.5 text-center">
              <p className="mb-0.5 text-xs uppercase tracking-wider text-muted2">{label}</p>
              <p className="font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Per-symbol betas */}
        {data.beta_map && Object.keys(data.beta_map).length > 0 && (
          <div className="space-y-1 border-t border-border-light pt-2">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted2">Per-symbol beta</p>
            {Object.entries(data.beta_map as Record<string, number>)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([sym, b]) => (
                <div key={sym} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs font-semibold text-navy">{sym}</span>
                  <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((b / 2.5) * 100, 100)}%`,
                        background: b > 1.8 ? '#ef4444' : b > 1.3 ? '#b45309' : '#15803d',
                        transition: 'width 0.7s',
                      }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-xs" style={{ color: b > 1.8 ? '#ef4444' : b > 1.3 ? '#b45309' : '#15803d' }}>
                    {b.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Correlation heatmap */}
      {hasCm && (
        <div className="border-t border-border-light pt-2">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted2">Correlation heatmap (top holdings)</p>
          {/* Column labels */}
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `40px repeat(${cmData.symbols.length}, 1fr)` }}
          >
            <div />
            {cmData.symbols.map((s) => (
              <div key={s} className="pb-0.5 text-center font-mono text-sm text-muted2">{s}</div>
            ))}
          </div>
          {/* Rows */}
          {cmData.values.map((row, i) => (
            <div
              key={i}
              className="mb-px grid gap-px"
              style={{ gridTemplateColumns: `40px repeat(${cmData.symbols.length}, 1fr)` }}
            >
              <div className="flex items-center justify-end pr-1 font-mono text-sm text-muted2">
                {cmData.symbols.at(i) ?? ''}
              </div>
              {row.map((v, j) => {
                const { bg, text } = corrCellStyle(v, i === j)
                const rowSym = cmData.symbols.at(i) ?? ''
                const colSym = cmData.symbols.at(j) ?? ''
                return (
                  <div
                    key={j}
                    className="aspect-square flex cursor-default items-center justify-center rounded-sm font-mono text-xs"
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
        <div className="border-t border-border-light pt-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted2">Correlation clusters</p>
          {(data.clusters as string[][]).map((cl, i) => (
            <div key={i} className="mb-1 flex flex-wrap gap-1">
              <span className="text-xs font-medium text-amber-800">C{i + 1}:</span>
              {cl.map((s) => (
                <span
                  key={s}
                  className="rounded border border-amber-200 bg-amber-50 px-1 font-mono text-sm text-amber-900"
                >
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
    <IntelCard title="Tax Optimization" icon={<Receipt size={12} />} accent="#16a34a">
      {!available ? (
        /* No cost basis */
        <div className="space-y-2">
          <div className="space-y-2 rounded border border-border bg-surface-2 p-3 text-center">
            <Receipt size={20} className="mx-auto text-muted2" />
            <p className="text-sm leading-relaxed text-slate2">{data.narrative as string}</p>
            <div className="font-mono text-xs text-muted2">
              Add <span className="font-semibold text-emerald-700">cost_basis</span> column to CSV to unlock
            </div>
          </div>
          {/* Tax score bar */}
          <div>
            <div className="mb-0.5 flex justify-between">
              <span className="text-xs uppercase tracking-wider text-muted2">Tax alpha score</span>
              <span className="text-xs font-bold text-emerald-800">{taxPts}/20</span>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(taxPts / 20) * 100}%` }} />
            </div>
          </div>
        </div>
      ) : (
        /* Has cost basis */
        <div className="space-y-2">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-border-light bg-surface-2 px-2 py-1.5">
              <p className="mb-0.5 text-xs uppercase tracking-wider text-muted2">Unrealized liability</p>
              <p className="font-bold text-red-600">${liability.toLocaleString()}</p>
            </div>
            <div className="rounded border border-border-light bg-surface-2 px-2 py-1.5">
              <p className="mb-0.5 text-xs uppercase tracking-wider text-muted2">Tax drag</p>
              <p className="font-bold" style={{ color: taxDrag ? (taxDrag > 3 ? '#ef4444' : '#b45309') : '#64748b' }}>
                {taxDrag !== null ? `${taxDrag.toFixed(1)}% / yr` : 'N/A'}
              </p>
            </div>
          </div>

          {/* Tax score */}
          <div>
            <div className="mb-0.5 flex justify-between">
              <span className="text-xs uppercase text-muted2">Tax alpha score</span>
              <span className="text-xs font-bold text-emerald-800">{taxPts}/20</span>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(taxPts / 20) * 100}%` }} />
            </div>
          </div>

          {/* Harvest opportunities */}
          {harvest.length > 0 && (
            <div className="border-t border-border-light pt-2">
              <p className="mb-1.5 text-xs uppercase tracking-wide text-muted2">Harvest opportunities</p>
              {harvest.slice(0, 3).map((h: any, i: number) => (
                <div key={i} className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-navy">{h.symbol}</span>
                  <span className="text-xs font-bold text-emerald-800">
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
    ? { color: '#15803d', bg: 'rgba(22,163,74,0.12)',   label: 'LOW RISK',    icon: CheckCircle   }
    : { color: '#b45309', bg: 'rgba(245,166,35,0.15)', label: 'MEDIUM RISK', icon: Minus         }

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
          <span className="text-sm font-bold" style={{ color: levelCfg.color }}>{levelCfg.label}</span>
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
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#e2e8f0' }}>
              <Cell fill={levelCfg.color} />
            </RadialBar>
          </RadialBarChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold" style={{ color: levelCfg.color }}>{score.toFixed(1)}</span>
            <span className="text-sm text-muted2">/10</span>
          </div>
        </div>
      </div>

      {/* Risk flags */}
      {risks.length > 0 && (
        <div className="space-y-1.5 border-t border-border-light pt-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted2">Risk flags</p>
          {risks.slice(0, 3).map((r, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <span style={{ color: levelCfg.color }} className="mt-0.5 shrink-0 text-xs">⚠</span>
              <span className="leading-relaxed text-slate2">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top mitigation */}
      {mits.length > 0 && (
        <div className="border-t border-border-light pt-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted2">Top mitigation</p>
          <div className="flex gap-1.5 items-start">
            <span className="mt-0.5 shrink-0 text-emerald-700">›</span>
            <span className="text-muted2">{mits[0]}</span>
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
    <IntelCard title="Alpha Scout" icon={<Zap size={12} />} accent="#F5A623">
      <p className="pb-1 text-xs uppercase tracking-wide text-muted2">Consider diversifying into:</p>
      {opps.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted2">No opportunities identified</p>
      ) : (
        <div className="space-y-3">
          {opps.slice(0, 3).map((o: any, i: number) => {
            const conf = Math.round((o.confidence ?? 0.65) * 100)
            const confColor = conf >= 75 ? '#15803d' : conf >= 60 ? '#b45309' : '#64748b'
            return (
              <div key={i} className="space-y-1.5 rounded border border-border-light bg-surface-2/50 p-2">
                {/* Symbol + confidence */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-navy">{o.symbol}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-[3px] w-16 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${conf}%`, background: confColor, transition: 'width 0.7s' }}
                      />
                    </div>
                    <span className="text-xs font-bold" style={{ color: confColor }}>{conf}%</span>
                  </div>
                </div>
                {/* Reason */}
                <p className="leading-relaxed text-slate2">
                  {(o.reason as string).slice(0, 160)}
                  {(o.reason as string).length > 160 ? '…' : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Spacer note */}
      <p className="border-t border-border-light pt-2 text-center text-sm uppercase tracking-wide text-muted2">
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
          ? <strong key={i} className="font-bold text-navy">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

function ICBriefing({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  return (
    <div className="space-y-1 text-sm leading-relaxed text-slate2">
      {lines.map((line, idx) => {
        if (/^## /.test(line)) {
          return (
            <div key={idx} className="pt-4 first:pt-0">
              <div className="mb-2 border-b border-primary/20 pb-1 text-xs font-bold uppercase tracking-wide text-primary-dark">
                {line.replace(/^##\s*/, '')}
              </div>
            </div>
          )
        }
        if (/^### /.test(line)) {
          return (
            <div key={idx} className="mt-2 text-xs font-bold uppercase tracking-wide text-muted2">
              {line.replace(/^###\s*/, '')}
            </div>
          )
        }
        if (/^[-*]\s/.test(line)) {
          const content = line.replace(/^[-*]\s/, '')
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="mt-0.5 shrink-0 text-primary">›</span>
              <span>{renderBoldInline(content, `b${idx}`)}</span>
            </div>
          )
        }
        if (/^\d+\.\s/.test(line)) {
          const num     = line.match(/^(\d+)\./)?.[1]
          const content = line.replace(/^\d+\.\s/, '')
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="w-4 shrink-0 font-bold text-primary-dark">{num}.</span>
              <span>{renderBoldInline(content, `n${idx}`)}</span>
            </div>
          )
        }
        if (/^---+$/.test(line.trim())) {
          return <div key={idx} className="my-2 border-t border-border" />
        }
        if (!line.trim()) {
          return <div key={idx} className="h-1" />
        }
        return (
          <p key={idx}>
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
      <div className="flex justify-between text-xs uppercase tracking-wide text-muted2">
        <span>{label}</span>
        <span style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SwarmPage() {
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle')
  const [agentTrace, setAgentTrace] = useState<AgentTraceItem[]>([])
  const [result, setResult] = useState<SwarmResult | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [pollIntervalRef, setPollIntervalRef] = useState<ReturnType<typeof setInterval> | null>(null)
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [unlockedLocally, setUnlockedLocally] = useState(false)
  const [toast,           setToast]           = useState<string | null>(null)
  const [chatOpen,        setChatOpen]        = useState(false)
  const [failedTickers,   setFailedTickers]   = useState<string[]>([])
  const [positions,       setPositions]       = useState<SwarmPosition[]>([])
  const [totalValue,      setTotalValue]      = useState(0)
  const [exportingPdf,    setExportingPdf]    = useState(false)
  const thesis = (result?.investment_thesis ?? result) as Record<string, any> | null
  const isRunning = jobStatus === 'queued' || jobStatus === 'running'

  const { isPro, loading: authLoading, user } = useUser()
  const { capture } = useNeufinAnalytics()
  const isTrialBypass = useMemo(() => {
    // 1. Check subscription cache first (populated by mount effect below)
    try {
      const cached = localStorage.getItem('neufin:subscription-status:cache')
      if (cached) {
        const parsed = JSON.parse(cached) as { ts?: number; data?: { status?: string; plan?: string } }
        const d = parsed?.data
        if (
          d?.status === 'trial' ||
          d?.plan === 'advisor' ||
          d?.plan === 'enterprise'
        ) {
          return true
        }
      }
    } catch {}

    // 2. Fallback: user object not available yet
    if (!user) return false

    // 3. created_at heuristic — broad fallback for accounts < 14 days old
    const createdAt = user?.created_at
    if (createdAt) {
      const created = new Date(createdAt)
      const daysSince = (Date.now() - created.getTime()) / 86_400_000
      if (Number.isFinite(daysSince) && daysSince < 14) return true
    }

    return false
  }, [user])
  const isUnlocked = isPro || unlockedLocally || isTrialBypass

  useEffect(() => {
    debugAuth('swarm:mount')
  }, [])

  // Refresh subscription cache on mount so isTrialBypass has fresh data
  useEffect(() => {
    apiGet<{
      plan?: string
      status?: string
      days_remaining?: number
    }>('/api/subscription/status')
      .then((data) => {
        if (data && typeof data === 'object') {
          localStorage.setItem(
            'neufin:subscription-status:cache',
            JSON.stringify({
              ts: Date.now(),
              data: {
                plan: data.plan,
                status: data.status,
                days_remaining: data.days_remaining,
              },
            })
          )
        }
      })
      .catch(() => {/* non-blocking */})
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

    if (sessionId) {
      try {
        await apiFetch(`${API_BASE}/api/vault/claim-session`, {
          method:  'POST',
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
  }, [API_BASE])

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
      const data = await apiPost<{ checkout_url?: string }>(
        '/api/reports/checkout',
        {
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
        }
      )
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch {
      setCheckoutLoading(false)
    }
  }, [positions])

  async function pollStatus(id: string) {
    try {
      const status = await apiGet<{
        status: JobStatus
        agent_trace?: AgentTraceItem[]
      }>(`/api/swarm/status/${id}`)

      setJobStatus(status.status)
      setAgentTrace(Array.isArray(status.agent_trace) ? status.agent_trace : [])

      if (status.status === 'complete') {
        if (pollIntervalRef) clearInterval(pollIntervalRef)
        setPollIntervalRef(null)
        try {
          const fullResult = await fetchResultWithRetry(id)
          setResult(fullResult)
          setResultError(null)
          localStorage.setItem('neufin-swarm-job-id', id)
        } catch (err) {
          console.error('[swarm] Result fetch failed after retries:', err)
          setJobStatus('result_unavailable')
          setResultError(
            'Analysis completed but result could not be loaded. ' +
            'This is a temporary issue — try refreshing or click Retry.'
          )
        }
      } else if (status.status === 'failed') {
        if (pollIntervalRef) clearInterval(pollIntervalRef)
        setPollIntervalRef(null)
      }
    } catch (err: any) {
      console.error('[swarm] Poll error:', err)
    }
  }

  const startSwarm = async () => {
    if (positions.length === 0) return
    setJobStatus('queued')
    setAgentTrace([])
    setResult(null)
    setResultError(null)
    setStartedAtMs(Date.now())

    const portfolioId = typeof window !== 'undefined'
      ? (JSON.parse(localStorage.getItem('dnaResult') ?? 'null')?.record_id ?? undefined)
      : undefined
    capture('swarm_analysis_started', { portfolio_id: portfolioId })
    perfTimer.start('swarm')

    try {
      const data = await apiPost<{ job_id: string; status: JobStatus }>('/api/swarm/analyze', {
        positions: positions.map((p) => ({
          symbol: p.symbol,
          shares: p.shares,
          price: p.price,
          value: p.value,
          weight: p.weight,
        })),
        total_value: totalValue,
      })
      setJobId(data.job_id)
      setJobStatus(data.status ?? 'queued')
      const interval = setInterval(() => {
        void pollStatus(data.job_id)
      }, 3000)
      setPollIntervalRef(interval)
      void pollStatus(data.job_id)
    } catch (e: any) {
      perfTimer.end('swarm') // clean up timer
      setJobStatus('failed')
      console.error('[swarm] Failed to start:', e)
    }
  }

  async function exportSwarmPdf() {
    if (!user) {
      setToast('Sign in to export PDF')
      return
    }
    setExportingPdf(true)
    try {
      const res = await apiFetch('/api/swarm/export-pdf', { method: 'POST' })
      if (!res.ok) {
        let msg = `Export failed (${res.status})`
        try {
          const j = (await res.json()) as { detail?: string }
          if (j?.detail) msg = String(j.detail)
        } catch {
          /* non-JSON body */
        }
        setToast(msg)
        return
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = 'neufin-swarm-ic-export.pdf'
      a.click()
      URL.revokeObjectURL(href)
      setToast('PDF downloaded')
    } catch (e) {
      console.error('[swarm] PDF export:', e)
      setToast('Export failed')
    } finally {
      setExportingPdf(false)
    }
  }

  useEffect(() => {
    if (jobStatus !== 'complete' || !result) return
    const swarmDurationMs = perfTimer.end('swarm') ?? 0
    capture('swarm_analysis_completed', {
      report_id: thesis?.swarm_report_id,
      duration_ms: swarmDurationMs,
    })
    captureSentrySlowOp('swarm_analysis', swarmDurationMs)
  }, [jobStatus, result, capture, thesis?.swarm_report_id])

  useEffect(() => {
    return () => {
      if (pollIntervalRef) clearInterval(pollIntervalRef)
    }
  }, [pollIntervalRef])

  const sb = thesis?.score_breakdown ?? {}

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-app font-sans text-navy">
      <AppHeader />
      {toast && (
        <div
          className="fixed left-1/2 z-[9999] -translate-x-1/2 rounded-lg border border-primary/30 bg-white px-6 py-2.5 text-sm font-medium text-primary-dark shadow-md"
          style={{ top: 56, animation: 'fadeInDown 0.2s ease' }}
        >
          {toast}
          <style>{`@keyframes fadeInDown { from { opacity:0;transform:translateX(-50%) translateY(-8px); } to { opacity:1;transform:translateX(-50%) translateY(0); } }`}</style>
        </div>
      )}

      <nav className="sticky top-0 z-10 flex min-h-12 flex-wrap items-center justify-between gap-2 gap-y-2 border-b border-border bg-white/95 px-4 py-2 backdrop-blur-sm sm:px-6">
        <div className="flex min-w-0 flex-shrink-0 items-center gap-3">
          <a href="/dashboard" className="text-sm font-bold tracking-wide text-primary transition-colors hover:text-primary-dark">
            NEUFIN
          </a>
          <span className="text-sm text-border">/</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted2">Investment Committee</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <Suspense fallback={null}>
            <CommandPalette
              positions={positions}
              total_value={totalValue}
              onResponse={r => setAgentTrace(prev => [
                ...prev,
                ...(r.thinking_steps ?? []).map((step: string) => ({
                  agent: 'synthesizer',
                  status: 'complete' as const,
                  summary: step,
                  ts: new Date().toISOString(),
                })),
              ])}
            />
          </Suspense>
          {user && (
            <button
              type="button"
              onClick={() => void exportSwarmPdf()}
              disabled={exportingPdf}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted2 transition-colors hover:border-primary hover:text-primary-dark disabled:opacity-40"
            >
              {exportingPdf ? 'Exporting…' : 'Export PDF'}
            </button>
          )}
          {thesis && (
            <button
              type="button"
              onClick={() => setChatOpen(o => !o)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                chatOpen
                  ? 'border-primary bg-primary-light text-primary-dark'
                  : 'border-border text-slate2 hover:border-primary/50 hover:text-primary-dark'
              }`}
            >
              {chatOpen ? 'Close MD' : 'Ask MD'}
            </button>
          )}
          <button
            type="button"
            onClick={startSwarm}
            disabled={isRunning || positions.length === 0}
            title={positions.length === 0 ? 'Upload a portfolio on neufin.app first' : undefined}
            className="rounded-md border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all disabled:opacity-40"
            style={{
              background:
                jobStatus === 'failed' ? '#fef2f2' : isRunning ? 'transparent' : 'var(--primary, #1EB8CC)',
              color:
                jobStatus === 'failed' ? '#b91c1c' : isRunning ? '#b45309' : '#ffffff',
              borderColor:
                jobStatus === 'failed' ? '#fecaca' : isRunning ? '#fbbf24' : 'var(--primary, #1EB8CC)',
            }}
          >
            {positions.length === 0
              ? 'No portfolio'
              : jobStatus === 'queued'
                ? 'Queuing…'
                : jobStatus === 'running'
                  ? `Agents running… ${agentTrace.filter((t) => t.status === 'complete').length}/7`
                  : jobStatus === 'complete'
                    ? 'Run new analysis'
                    : jobStatus === 'failed'
                      ? 'Retry analysis'
                      : 'Run IC analysis'}
          </button>
        </div>
      </nav>

      {/* Main 3-column layout */}
      <div className="max-w-[1600px] mx-auto px-4 py-5 grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Agent trace terminal */}
        <div className="xl:col-span-5">
          <SwarmTerminal status={jobStatus} trace={agentTrace} onRetry={startSwarm} />
          {/* Result unavailable error state — analysis done but result fetch failed */}
          {jobStatus === 'result_unavailable' && resultError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span className="min-w-0 flex-1">{resultError}</span>
              {jobId && (
                <button
                  type="button"
                  onClick={() => {
                    setJobStatus('complete')
                    void pollStatus(jobId)
                  }}
                  className="shrink-0 whitespace-nowrap rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-dark"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* IC Briefing */}
        <div className="xl:col-span-5">
          <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-white shadow-sm">
            <div className="flex shrink-0 items-center justify-between border-b border-border-light bg-surface-2 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">IC briefing</span>
                <span className="text-xs text-border">|</span>
                <span className="text-xs font-medium uppercase text-muted2">PE Managing Director</span>
              </div>
              {thesis?.dna_score && (
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase text-muted2">DNA</span>
                  <span
                    className="text-sm font-bold"
                    style={{
                      color:
                        thesis.dna_score >= 70 ? '#15803d' : thesis.dna_score >= 45 ? '#b45309' : '#dc2626',
                    }}
                  >
                    {thesis.dna_score}
                    <span className="text-xs font-normal text-muted2">/100</span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: 'thin' }}>
              {!thesis && !isRunning && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm font-medium uppercase tracking-wide text-muted2">IC briefing awaiting swarm execution</p>
                  <p className="text-sm text-slate2">Run IC analysis to generate the Investment Committee report.</p>
                </div>
              )}
              {isRunning && !thesis && (
                <div className="flex h-full items-center justify-center">
                  <div className="animate-pulse text-sm font-medium uppercase tracking-wide text-primary-dark">
                    MD is reviewing analyst outputs…
                  </div>
                </div>
              )}
              {thesis?.briefing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                  <ICBriefing markdown={thesis.briefing} />
                </motion.div>
              )}
            </div>
            {thesis && (
              <div className="flex shrink-0 flex-wrap gap-3 border-t border-border-light bg-surface-2 px-4 py-2">
                <MetaItem label="REGIME" value={thesis.regime ?? 'N/A'} color="blue" />
                <MetaItem label="β" value={thesis.weighted_beta?.toFixed(2) ?? '—'} color="amber" />
                <MetaItem
                  label="SHARPE"
                  value={thesis.sharpe_ratio?.toFixed(2) ?? '—'}
                  color={(thesis.sharpe_ratio ?? 0) > 1 ? 'green' : (thesis.sharpe_ratio ?? 0) > 0 ? 'amber' : 'red'}
                />
                <MetaItem label="ρ avg" value={thesis.avg_correlation?.toFixed(3) ?? '—'} color="amber" />
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-3 xl:col-span-2">
          <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
            <div className="border-b border-border-light bg-surface-2 px-3 py-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">Holdings</span>
            </div>
            <div className="space-y-2 px-3 py-2">
              {positions.length === 0 ? (
                <div className="py-2 text-center text-sm text-muted2">Upload portfolio on neufin.app to populate</div>
              ) : (
                positions.map((p) => (
                  <div key={p.symbol} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-navy">{p.symbol}</span>
                      <span className="text-muted2">{Math.round(p.weight * 100)}%</span>
                    </div>
                    <div className="h-[2px] overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.round(p.weight * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
              {positions.length > 0 && (
                <div className="flex justify-between border-t border-border-light pt-1.5 text-xs">
                  <span className="text-muted2">AUM</span>
                  <span className="font-bold text-navy">${totalValue.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {thesis && Object.keys(sb).length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              <div className="border-b border-border-light bg-surface-2 px-3 py-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">Score</span>
              </div>
              <div className="space-y-2.5 px-3 py-3">
                <ScorePill label="HHI" value={sb.hhi_concentration ?? 0} max={25} color="#F5A623" />
                <ScorePill label="Beta" value={sb.beta_risk ?? 0} max={25} color="#64748b" />
                <ScorePill label="Tax α" value={sb.tax_alpha ?? 0} max={20} color="#16a34a" />
                <ScorePill label="Corr" value={sb.correlation ?? 0} max={30} color="#1EB8CC" />
                <div className="flex justify-between border-t border-border-light pt-2 text-xs">
                  <span className="uppercase tracking-wide text-muted2">DNA</span>
                  <span className="font-bold text-navy">{thesis.dna_score}/100</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1 py-2 text-center">
            <div className="text-xs text-muted2">
              Press{' '}
              <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-mono text-muted2">⌘K</kbd>{' '}
              to query agents
            </div>
            <div className="text-sm uppercase tracking-wide text-muted2">Powered by LangGraph</div>
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
            <div className="mt-1 xl:col-span-12">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">Risk matrix</span>
                <span className="text-xs text-border">|</span>
                <span className="text-xs font-medium uppercase tracking-wide text-muted2">
                  Cluster map · historical regime stress
                </span>
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
        <div className="mx-auto max-w-[1600px] px-4 pb-6">
          <div className="mb-4 grid gap-3 rounded-lg border border-border bg-white p-4 shadow-sm md:grid-cols-4">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 120 120" className="h-16 w-16">
                <circle cx="60" cy="60" r="52" stroke="#e2e8f0" strokeWidth="10" fill="none" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="#1EB8CC"
                  strokeWidth="10"
                  fill="none"
                  strokeDasharray={`${Math.max(0, Math.min(100, Number(thesis?.dna_score ?? 0))) * 3.27} 999`}
                  transform="rotate(-90 60 60)"
                />
                <text x="60" y="65" textAnchor="middle" className="fill-navy text-xl font-bold">
                  {Number(thesis?.dna_score ?? 0)}
                </text>
              </svg>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted2">DNA score</p>
                <p className="text-sm text-slate2">Institutional fit signal</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted2">Investor archetype</p>
              <p className="mt-1 text-sm font-medium text-navy">{thesis?.investor_type ?? 'Advisor'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted2">Market regime</p>
              <p className="mt-1 text-sm font-medium text-primary-dark">{thesis?.regime ?? 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted2">Elapsed</p>
              <p className="mt-1 text-sm font-medium text-navy">
                {startedAtMs ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)) : 0}s
              </p>
            </div>
          </div>
        </div>
      )}

      {jobStatus === 'complete' && result ? (
        <SwarmSourcesPanel
          sources={(result as Record<string, unknown>).sources as SwarmSourcesPayload | undefined}
          observability={
            (result as Record<string, unknown>).observability as SwarmObservabilityPayload | undefined
          }
        />
      ) : null}

      {thesis && (
        <div className="mx-auto max-w-[1600px] px-4 pb-section">
          <div className="mb-4 flex items-center gap-3 border-t border-border-light pt-5">
            <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">Research intelligence</span>
            <span className="text-xs text-border">|</span>
            <span className="text-xs font-medium uppercase tracking-wide text-muted2">
              7-agent deep analysis · {thesis.regime ?? 'N/A'} regime
            </span>
            {thesis.dna_score && (
              <>
                <span className="text-xs text-border">|</span>
                <span className="text-xs uppercase text-muted2">
                  DNA{' '}
                  <span
                    className="font-bold"
                    style={{
                      color:
                        thesis.dna_score >= 70 ? '#15803d' : thesis.dna_score >= 45 ? '#b45309' : '#ef4444',
                    }}
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
  const cls =
    color === 'green'
      ? 'text-emerald-800'
      : color === 'amber'
        ? 'text-amber-800'
        : color === 'blue'
          ? 'text-sky-700'
          : color === 'red'
            ? 'text-red-600'
            : 'text-slate2'
  const tip = metaTip(label)
  const inner = (
    <div className="flex cursor-help items-center gap-1 text-xs">
      <span className="border-b border-dotted border-border uppercase text-muted2">{label}:</span>
      <span className={`font-bold ${cls}`}>{value}</span>
    </div>
  )
  return tip ? <Tip content={tip}>{inner}</Tip> : inner
}
