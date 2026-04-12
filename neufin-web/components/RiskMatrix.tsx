'use client'

/**
 * RiskMatrix.tsx — Dual-panel risk visualisation.
 *
 * Panel 1 — Systemic Risk Cluster Map
 *   ScatterChart: X = Beta, Y = Correlation to SPY, Z = portfolio weight (bubble size).
 *   Red cells for SPY ρ > 0.80 (high systemic correlation).
 *   Reference lines at Beta=1 and ρ=0.80.
 *
 * Panel 2 — Historical Regime Stress / Drawdown Histogram
 *   Horizontal grouped BarChart: portfolio impact vs SPY benchmark per scenario.
 *   Dark red fill when portfolio loss > 20% (Structural Fragility threshold).
 *   Weakest-link ticker footer per scenario.
 *
 * Terminal strict style:
 *   Background  #0D0D0D   Surface  #111     Border/Grid  #222 / #333
 *   Amber label #FFB900   Green    #00FF00  Red          #FF4444
 *   Blue ref    #60A5FA   Dim      #444     Font 10px monospaced
 *   NO rounded corners on any container, bar, or badge.
 */

import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  ScatterChart, Scatter,
  XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  BarChart, Bar, Cell, LabelList,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Cluster Map entry — produced by compute_factor_metrics */
export interface ClusterEntry {
  ticker:      string   // symbol
  beta:        number
  correlation: number   // 60-day Pearson ρ to SPY
  weight:      number   // fractional (0–1)
}

/** Stress scenario entry — produced by StressTester.to_list() */
export interface StressEntry {
  scenario:          string    // human label e.g. "'22 Rate Shock"
  impact:            number    // portfolio return % (negative = loss)
  spyImpact:         number    // S&P 500 return % for comparison
  qqqImpact?:        number    // Nasdaq-100 return % — optional benchmark overlay
  weakLink:          string    // worst single-stock ticker
  alpha_gap_narrative?: string // MD narrative on alpha vs benchmark
}

interface Props {
  clusters:      ClusterEntry[]
  stressResults: StressEntry[]
}

// ── Palette ───────────────────────────────────────────────────────────────────
const A    = '#FFB900'
const G    = '#00FF00'
const R    = '#FF4444'
const R_DK = '#7f1d1d'   // dark red — Structural Fragility
const B    = '#60A5FA'   // SPY benchmark — blue
const P    = '#a855f7'   // QQQ benchmark — purple
const BG   = '#0D0D0D'
const SURF = '#111111'
const GRID = '#222222'
const DIM  = '#444444'
const BODY = '#C8C8C8'
const MONO_F = "'Fira Code','Courier New',monospace"
const MONO   = `10px ${MONO_F}`

// ── Panel wrapper — terminal style, no rounded corners ────────────────────────
function Panel({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BG, border: `1px solid ${GRID}`, overflow: 'hidden' }}>
      <div style={{
        background: SURF, borderBottom: `1px solid ${GRID}`,
        padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: A, fontFamily: MONO_F, fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
          {title}
        </span>
        {badge && (
          <span style={{
            marginLeft: 'auto', color: B, fontFamily: MONO_F, fontSize: 9,
            border: `1px solid ${B}50`, padding: '1px 5px',
            textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

const axisStyle = { fontFamily: MONO_F, fontSize: 9, fill: DIM }

// ── Cluster tooltip ───────────────────────────────────────────────────────────
function ClusterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ClusterEntry
  const isHigh = d.correlation > 0.80
  const color  = isHigh ? R : A
  return (
    <div style={{
      background: '#0a0a0a', border: `1px solid ${color}`, padding: '7px 11px',
      fontFamily: MONO_F, fontSize: 10,
    }}>
      <div style={{ color, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
        {d.ticker}{isHigh ? ' · HIGH RISK' : ''}
      </div>
      <div style={{ color: BODY }}>WEIGHT&nbsp; <span style={{ color, fontWeight: 700 }}>{(d.weight * 100).toFixed(1)}%</span></div>
      <div style={{ color: BODY }}>BETA&nbsp;&nbsp;&nbsp; <span style={{ color, fontWeight: 700 }}>{d.beta.toFixed(2)}</span></div>
      <div style={{ color: BODY }}>SPY ρ&nbsp;&nbsp; <span style={{ color, fontWeight: 700 }}>{d.correlation.toFixed(3)}</span></div>
    </div>
  )
}

// ── Custom scatter dot — label above, red glow for high correlation ────────────
function ClusterDot(props: any) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return null

  const isHigh = (payload as ClusterEntry).correlation > 0.80
  const color  = isHigh ? R : A
  const r      = Math.max(5, Math.min(18, 4 + (payload as ClusterEntry).weight * 80))

  return (
    <g>
      {isHigh && (
        <>
          <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke={R} strokeWidth={1} strokeOpacity={0.20}
            style={{ filter: 'blur(2px)' }} />
          <circle cx={cx} cy={cy} r={r + 3} fill={R} fillOpacity={0.07} stroke="none" />
        </>
      )}
      <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.82} stroke={color} strokeWidth={1} />
      <text
        x={cx} y={cy - r - 4}
        textAnchor="middle"
        fill={color}
        style={{ font: MONO, fontWeight: 700, letterSpacing: 1 }}
      >
        {(payload as ClusterEntry).ticker}
      </text>
    </g>
  )
}

// ── Stress bar tooltip ────────────────────────────────────────────────────────
function StressTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const port = payload.find((p: any) => p.dataKey === 'impact')
  const spy  = payload.find((p: any) => p.dataKey === 'spyImpact')
  const isFragile = port && port.value <= -20
  return (
    <div style={{
      background: '#0a0a0a', border: `1px solid ${isFragile ? R : GRID}`, padding: '7px 11px',
      fontFamily: MONO_F, fontSize: 10,
    }}>
      <div style={{ color: A, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>{label}</div>
      {port && (
        <div style={{ color: BODY }}>
          PORTFOLIO&nbsp;
          <span style={{ color: port.value >= 0 ? G : R, fontWeight: 700 }}>
            {port.value >= 0 ? '+' : ''}{port.value.toFixed(1)}%
          </span>
          {isFragile && <span style={{ color: R, marginLeft: 6 }}>⚠ STRUCTURAL FRAGILITY</span>}
        </div>
      )}
      {spy && (
        <div style={{ color: BODY }}>
          S&P 500&nbsp;&nbsp;&nbsp;
          <span style={{ color: spy.value >= 0 ? G : B }}>
            {spy.value >= 0 ? '+' : ''}{spy.value.toFixed(1)}%
          </span>
        </div>
      )}
      {payload.find((p: any) => p.dataKey === 'qqqImpact') && (() => {
        const qqq = payload.find((p: any) => p.dataKey === 'qqqImpact')
        return qqq && qqq.value !== 0 ? (
          <div style={{ color: BODY }}>
            Nasdaq-100&nbsp;
            <span style={{ color: P }}>
              {qqq.value >= 0 ? '+' : ''}{qqq.value.toFixed(1)}%
            </span>
          </div>
        ) : null
      })()}
      {port && spy && (
        <div style={{ color: BODY, borderTop: `1px solid ${GRID}`, marginTop: 4, paddingTop: 4 }}>
          ALPHA&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <span style={{ color: (port.value - spy.value) >= 0 ? G : R, fontWeight: 700 }}>
            {(port.value - spy.value) >= 0 ? '+' : ''}{(port.value - spy.value).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RiskMatrix({ clusters, stressResults }: Props) {
  const hasClusters = clusters.length > 0
  const hasStress   = stressResults.length > 0

  const betaMax = useMemo(
    () => hasClusters ? Math.max(...clusters.map(c => c.beta)) + 0.4 : 3,
    [clusters, hasClusters],
  )

  if (!hasClusters && !hasStress) return null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: hasClusters && hasStress ? '1fr 1fr' : '1fr',
      gap: 12,
      background: BG,
      fontFamily: MONO_F,
    }}>

      {/* ── Panel 1: Cluster Map ───────────────────────────────────────────── */}
      {hasClusters && (
        <Panel title="Systemic Risk Cluster Map" badge="Beta × SPY Correlation · 60-day">
          {/* Legend */}
          <div style={{
            padding: '5px 14px', borderBottom: `1px solid ${GRID}`,
            display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, background: R }} />
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>HIGH SYSTEMIC (ρ &gt; 0.80)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, background: A }} />
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>NORMAL</span>
            </div>
            <span style={{ marginLeft: 'auto', color: '#2a2a2a', fontSize: 9 }}>Bubble size = weight</span>
          </div>

          <div style={{ padding: '14px 6px 6px 0' }}>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" strokeOpacity={0.7} />

                {/* Danger zone: Beta > 1.5 and ρ > 0.80 */}
                <ReferenceArea
                  x1={1.5} x2={betaMax} y1={0.80} y2={1.05}
                  fill={R} fillOpacity={0.04}
                />
                <ReferenceLine x={1} stroke={B} strokeOpacity={0.35} strokeDasharray="4 3"
                  label={{ value: 'β=1', position: 'insideTopRight', fill: `${B}80`, fontSize: 8, fontFamily: MONO_F }} />
                <ReferenceLine y={0.80} stroke={R} strokeOpacity={0.40} strokeDasharray="4 3"
                  label={{ value: 'ρ=0.80', position: 'insideTopLeft', fill: `${R}80`, fontSize: 8, fontFamily: MONO_F }} />
                <ReferenceLine y={0} stroke={GRID} strokeOpacity={0.8} />

                <XAxis
                  dataKey="beta"
                  type="number"
                  domain={[0, betaMax]}
                  name="Beta"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  label={{ value: 'BETA (Volatility vs Market)', position: 'insideBottom', offset: -14, fill: DIM, fontSize: 9, fontFamily: MONO_F }}
                />
                <YAxis
                  dataKey="correlation"
                  type="number"
                  domain={[-0.1, 1.05]}
                  name="Correlation"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={v => v.toFixed(1)}
                  label={{ value: 'CORR TO SPY', angle: -90, position: 'insideLeft', offset: 16, fill: DIM, fontSize: 9, fontFamily: MONO_F }}
                />
                <ZAxis dataKey="weight" range={[40, 400]} />
                <Tooltip content={<ClusterTooltip />} cursor={false} />
                <Scatter data={clusters} shape={<ClusterDot />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* High-correlation callout strip */}
          {clusters.filter(c => c.correlation > 0.80).length > 0 && (
            <div style={{
              borderTop: `1px solid ${GRID}`, padding: '5px 14px',
              display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span style={{ color: R, fontSize: 8, letterSpacing: 1 }}>⚠ HIGH SYSTEMIC CORRELATION:</span>
              {clusters.filter(c => c.correlation > 0.80).map(c => (
                <span key={c.ticker} style={{
                  color: R, fontSize: 9, fontWeight: 700,
                  border: `1px solid ${R}40`, padding: '0 4px',
                }}>
                  {c.ticker}
                </span>
              ))}
              <span style={{ color: DIM, fontSize: 8, marginLeft: 2 }}>— move in lockstep with market</span>
            </div>
          )}
        </Panel>
      )}

      {/* ── Panel 2: Drawdown Histogram ────────────────────────────────────── */}
      {hasStress && (
        <Panel title="Historical Regime Stress" badge="Portfolio vs S&P 500">
          {/* Legend */}
          <div style={{
            padding: '5px 14px', borderBottom: `1px solid ${GRID}`,
            display: 'flex', gap: 14, alignItems: 'center',
          }}>
            {([['Portfolio', A], ['S&P 500', B], ['Nasdaq-100', P], ['Loss > 20%', R_DK]] as const).map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, background: color }} />
                <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '14px 14px 8px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={stressResults}
                layout="vertical"
                margin={{ top: 8, right: 56, bottom: 8, left: 0 }}
                barCategoryGap="28%"
                barGap={2}
              >
                <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="2 4" strokeOpacity={0.6} />
                <XAxis
                  type="number"
                  domain={['dataMin - 5', 'dataMax + 5']}
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`}
                />
                <YAxis
                  dataKey="scenario"
                  type="category"
                  tick={{ ...axisStyle, fill: A, fontSize: 8 }}
                  tickLine={false}
                  axisLine={false}
                  width={88}
                />
                <Tooltip content={<StressTooltip />} cursor={{ fill: '#ffffff06' }} />
                <ReferenceLine x={0} stroke={DIM} strokeWidth={1} />

                {/* Portfolio bars */}
                <Bar dataKey="impact" name="Portfolio" maxBarSize={14}>
                  {stressResults.map((d, i) => (
                    <Cell
                      key={`p${i}`}
                      fill={d.impact <= -20 ? R_DK : d.impact >= 0 ? G : R}
                      fillOpacity={0.9}
                    />
                  ))}
                  <LabelList
                    dataKey="impact"
                    position="right"
                    formatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                    style={{ fontFamily: MONO_F, fontSize: 9, fill: BODY }}
                  />
                </Bar>

                {/* SPY benchmark bars */}
                <Bar dataKey="spyImpact" name="S&P 500" maxBarSize={7}>
                  {stressResults.map((_d, i) => (
                    <Cell key={`s${i}`} fill={B} fillOpacity={0.30} />
                  ))}
                </Bar>

                {/* QQQ benchmark bars — only rendered when data is non-zero */}
                {stressResults.some(d => (d.qqqImpact ?? 0) !== 0) && (
                  <Bar dataKey="qqqImpact" name="Nasdaq-100" maxBarSize={6}>
                    {stressResults.map((_d, i) => (
                      <Cell key={`q${i}`} fill={P} fillOpacity={0.30} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weakest link + fragility badge footer */}
          <div style={{
            borderTop: `1px solid ${GRID}`, padding: '7px 14px',
            display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ color: DIM, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Weakest Link:
            </span>
            {stressResults.map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: DIM, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {s.scenario.split(' ')[0]}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    color: R, fontSize: 10, fontWeight: 700,
                    borderBottom: s.weakLink !== '—' ? `1px solid ${R}60` : 'none',
                  }}>
                    {s.weakLink !== '—' ? s.weakLink : '—'}
                  </span>
                  {s.impact <= -20 && (
                    <span style={{
                      color: R, fontSize: 7, border: `1px solid ${R}50`, padding: '0 3px',
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>
                      FRAGILE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Alpha Gap narratives — one per scenario that has a narrative */}
          {stressResults.some(s => s.alpha_gap_narrative) && (
            <div style={{
              borderTop: `1px solid ${GRID}`, padding: '8px 14px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <span style={{ color: DIM, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                Alpha Gap · MD Commentary
              </span>
              {stressResults.filter(s => s.alpha_gap_narrative).map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{
                    color: A, fontSize: 8, fontWeight: 700, flexShrink: 0,
                    border: `1px solid ${A}40`, padding: '1px 4px', marginTop: 1,
                  }}>
                    {s.scenario.split(' ')[0].toUpperCase()}
                  </span>
                  <span style={{ color: '#888', fontSize: 9, lineHeight: 1.5 }}>
                    {s.alpha_gap_narrative}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
