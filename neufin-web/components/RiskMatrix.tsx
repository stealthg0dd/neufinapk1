"use client";

/**
 * RiskMatrix.tsx — Dual-panel risk visualisation (light institutional theme).
 * Primary #1EB8CC, neutrals slate, risk red-500, positive green-500.
 */

import React, { useMemo } from "react";
import { chartPalette } from "@/lib/chart-palette";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Cluster Map entry — produced by compute_factor_metrics */
export interface ClusterEntry {
  ticker: string; // symbol
  beta: number;
  correlation: number; // 60-day Pearson ρ to SPY
  weight: number; // fractional (0–1)
}

/** Stress scenario entry — produced by StressTester.to_list() */
export interface StressEntry {
  scenario: string; // human label e.g. "'22 Rate Shock"
  impact: number; // portfolio return % (negative = loss)
  spyImpact: number; // S&P 500 return % for comparison
  qqqImpact?: number; // Nasdaq-100 return % — optional benchmark overlay
  weakLink: string; // worst single-stock ticker
  alpha_gap_narrative?: string; // MD narrative on alpha vs benchmark
}

interface Props {
  clusters: ClusterEntry[];
  stressResults: StressEntry[];
}

const PRIMARY = chartPalette.primary;
const G = chartPalette.positive;
const R = chartPalette.risk;
const B = chartPalette.neutralMuted;
const P = chartPalette.neutral;
const GRID = chartPalette.grid;
const DIM = chartPalette.axis;
const BODY = chartPalette.body;
const MONO_F = "ui-monospace, 'JetBrains Mono', monospace";
const MONO = `12px ${MONO_F}`;

function Panel({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-200 bg-gray-50 px-3.5 py-2.5">
        <span
          style={{
            color: PRIMARY,
            fontFamily: MONO_F,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            className="ml-auto rounded border px-1.5 py-0.5"
            style={{
              color: B,
              fontFamily: MONO_F,
              fontSize: 11,
              borderColor: `${B}55`,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const axisStyle = { fontFamily: MONO_F, fontSize: 12, fill: DIM };

// ── Cluster tooltip ───────────────────────────────────────────────────────────
function ClusterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ClusterEntry;
  const isHigh = d.correlation > 0.8;
  const color = isHigh ? R : PRIMARY;
  return (
    <div
      style={{
        background: chartPalette.background,
        border: `1px solid ${GRID}`,
        padding: "8px 12px",
        fontFamily: MONO_F,
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div
        style={{
          color,
          fontWeight: 700,
          letterSpacing: "0.04em",
          marginBottom: 4,
        }}
      >
        {d.ticker}
        {isHigh ? " · High risk" : ""}
      </div>
      <div style={{ color: BODY }}>
        WEIGHT&nbsp;{" "}
        <span style={{ color, fontWeight: 700 }}>
          {(d.weight * 100).toFixed(1)}%
        </span>
      </div>
      <div style={{ color: BODY }}>
        BETA&nbsp;&nbsp;&nbsp;{" "}
        <span style={{ color, fontWeight: 700 }}>{d.beta.toFixed(2)}</span>
      </div>
      <div style={{ color: BODY }}>
        SPY ρ&nbsp;&nbsp;{" "}
        <span style={{ color, fontWeight: 700 }}>
          {d.correlation.toFixed(3)}
        </span>
      </div>
    </div>
  );
}

// ── Custom scatter dot — label above, red glow for high correlation ────────────
function ClusterDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;

  const isHigh = (payload as ClusterEntry).correlation > 0.8;
  const color = isHigh ? R : PRIMARY;
  const r = Math.max(
    5,
    Math.min(18, 4 + (payload as ClusterEntry).weight * 80),
  );

  return (
    <g>
      {isHigh ? (
        <circle
          cx={cx}
          cy={cy}
          r={r + 2}
          fill="none"
          stroke={R}
          strokeWidth={1}
          strokeOpacity={0.35}
        />
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        fillOpacity={0.88}
        stroke={GRID}
        strokeWidth={0.75}
      />
      <text
        x={cx}
        y={cy - r - 4}
        textAnchor="middle"
        fill={color}
        style={{ font: MONO, fontWeight: 700, letterSpacing: "0.04em" }}
      >
        {(payload as ClusterEntry).ticker}
      </text>
    </g>
  );
}

// ── Stress bar tooltip ────────────────────────────────────────────────────────
function StressTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const port = payload.find((p: any) => p.dataKey === "impact");
  const spy = payload.find((p: any) => p.dataKey === "spyImpact");
  const isFragile = port && port.value <= -20;
  return (
    <div
      style={{
        background: chartPalette.background,
        border: `1px solid ${isFragile ? R : GRID}`,
        padding: "8px 12px",
        fontFamily: MONO_F,
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div
        style={{
          color: PRIMARY,
          fontWeight: 700,
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {port && (
        <div style={{ color: BODY }}>
          PORTFOLIO&nbsp;
          <span style={{ color: port.value >= 0 ? G : R, fontWeight: 700 }}>
            {port.value >= 0 ? "+" : ""}
            {port.value.toFixed(1)}%
          </span>
          {isFragile && (
            <span style={{ color: R, marginLeft: 6, fontWeight: 600 }}>
              Structural fragility
            </span>
          )}
        </div>
      )}
      {spy && (
        <div style={{ color: BODY }}>
          S&P 500&nbsp;&nbsp;&nbsp;
          <span style={{ color: spy.value >= 0 ? G : B }}>
            {spy.value >= 0 ? "+" : ""}
            {spy.value.toFixed(1)}%
          </span>
        </div>
      )}
      {payload.find((p: any) => p.dataKey === "qqqImpact") &&
        (() => {
          const qqq = payload.find((p: any) => p.dataKey === "qqqImpact");
          return qqq && qqq.value !== 0 ? (
            <div style={{ color: BODY }}>
              Nasdaq-100&nbsp;
              <span style={{ color: P }}>
                {qqq.value >= 0 ? "+" : ""}
                {qqq.value.toFixed(1)}%
              </span>
            </div>
          ) : null;
        })()}
      {port && spy && (
        <div
          style={{
            color: BODY,
            borderTop: `1px solid ${GRID}`,
            marginTop: 4,
            paddingTop: 4,
          }}
        >
          ALPHA&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <span
            style={{
              color: port.value - spy.value >= 0 ? G : R,
              fontWeight: 700,
            }}
          >
            {port.value - spy.value >= 0 ? "+" : ""}
            {(port.value - spy.value).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RiskMatrix({ clusters, stressResults }: Props) {
  const hasClusters = clusters.length > 0;
  const hasStress = stressResults.length > 0;

  const betaMax = useMemo(
    () => (hasClusters ? Math.max(...clusters.map((c) => c.beta)) + 0.4 : 3),
    [clusters, hasClusters],
  );

  if (!hasClusters && !hasStress) return null;

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: hasClusters && hasStress ? "1fr 1fr" : "1fr",
        fontFamily: MONO_F,
      }}
    >
      {/* ── Panel 1: Cluster Map ───────────────────────────────────────────── */}
      {hasClusters && (
        <Panel
          title="Systemic Risk Cluster Map"
          badge="Beta × SPY Correlation · 60-day"
        >
          {/* Legend */}
          <div
            style={{
              padding: "5px 14px",
              borderBottom: `1px solid ${GRID}`,
              display: "flex",
              gap: 14,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, background: R }} />
              <span style={{ color: DIM, fontSize: 11, letterSpacing: 0.04 }}>
                High systemic (ρ &gt; 0.80)
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, background: PRIMARY }} />
              <span style={{ color: DIM, fontSize: 11, letterSpacing: 0.04 }}>
                Normal
              </span>
            </div>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 11 }}>
              Bubble size = weight
            </span>
          </div>

          <div style={{ padding: "14px 6px 6px 0" }}>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart
                margin={{ top: 10, right: 24, bottom: 24, left: 8 }}
              >
                <CartesianGrid
                  stroke={GRID}
                  strokeDasharray="2 4"
                  strokeOpacity={0.7}
                />

                {/* Danger zone: Beta > 1.5 and ρ > 0.80 */}
                <ReferenceArea
                  x1={1.5}
                  x2={betaMax}
                  y1={0.8}
                  y2={1.05}
                  fill={R}
                  fillOpacity={0.04}
                />
                <ReferenceLine
                  x={1}
                  stroke={B}
                  strokeOpacity={0.35}
                  strokeDasharray="4 3"
                  label={{
                    value: "β=1",
                    position: "insideTopRight",
                    fill: B,
                    fontSize: 10,
                    fontFamily: MONO_F,
                  }}
                />
                <ReferenceLine
                  y={0.8}
                  stroke={R}
                  strokeOpacity={0.4}
                  strokeDasharray="4 3"
                  label={{
                    value: "ρ=0.80",
                    position: "insideTopLeft",
                    fill: R,
                    fontSize: 10,
                    fontFamily: MONO_F,
                  }}
                />
                <ReferenceLine y={0} stroke={GRID} strokeOpacity={0.8} />

                <XAxis
                  dataKey="beta"
                  type="number"
                  domain={[0, betaMax]}
                  name="Beta"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  label={{
                    value: "BETA (Volatility vs Market)",
                    position: "insideBottom",
                    offset: -14,
                    fill: DIM,
                    fontSize: 11,
                    fontFamily: MONO_F,
                  }}
                />
                <YAxis
                  dataKey="correlation"
                  type="number"
                  domain={[-0.1, 1.05]}
                  name="Correlation"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={(v) => v.toFixed(1)}
                  label={{
                    value: "CORR TO SPY",
                    angle: -90,
                    position: "insideLeft",
                    offset: 16,
                    fill: DIM,
                    fontSize: 11,
                    fontFamily: MONO_F,
                  }}
                />
                <ZAxis dataKey="weight" range={[40, 400]} />
                <Tooltip content={<ClusterTooltip />} cursor={false} />
                <Scatter data={clusters} shape={<ClusterDot />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* High-correlation callout strip */}
          {clusters.filter((c) => c.correlation > 0.8).length > 0 && (
            <div
              style={{
                borderTop: `1px solid ${GRID}`,
                padding: "5px 14px",
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  color: R,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.04,
                }}
              >
                High systemic correlation:
              </span>
              {clusters
                .filter((c) => c.correlation > 0.8)
                .map((c) => (
                  <span
                    key={c.ticker}
                    style={{
                      color: R,
                      fontSize: 11,
                      fontWeight: 700,
                      border: `1px solid ${R}40`,
                      padding: "0 4px",
                    }}
                  >
                    {c.ticker}
                  </span>
                ))}
              <span style={{ color: DIM, fontSize: 11, marginLeft: 2 }}>
                Move in lockstep with market
              </span>
            </div>
          )}
        </Panel>
      )}

      {/* ── Panel 2: Drawdown Histogram ────────────────────────────────────── */}
      {hasStress && (
        <Panel title="Historical Regime Stress" badge="Portfolio vs S&P 500">
          {/* Legend */}
          <div
            style={{
              padding: "5px 14px",
              borderBottom: `1px solid ${GRID}`,
              display: "flex",
              gap: 14,
              alignItems: "center",
            }}
          >
            {(
              [
                ["Portfolio", PRIMARY],
                ["S&P 500", B],
                ["Nasdaq-100", P],
                ["Loss > 20%", R],
              ] as const
            ).map(([label, color]) => (
              <div
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 5 }}
              >
                <div style={{ width: 7, height: 7, background: color }} />
                <span style={{ color: DIM, fontSize: 11, letterSpacing: 0.04 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: "14px 14px 8px" }}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={stressResults}
                layout="vertical"
                margin={{ top: 8, right: 56, bottom: 8, left: 0 }}
                barCategoryGap="28%"
                barGap={2}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke={GRID}
                  strokeDasharray="2 4"
                  strokeOpacity={0.6}
                />
                <XAxis
                  type="number"
                  domain={["dataMin - 5", "dataMax + 5"]}
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
                />
                <YAxis
                  dataKey="scenario"
                  type="category"
                  tick={{ ...axisStyle, fill: PRIMARY, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={88}
                />
                <Tooltip
                  content={<StressTooltip />}
                  cursor={{ fill: "rgba(15,23,42,0.04)" }}
                />
                <ReferenceLine x={0} stroke={DIM} strokeWidth={1} />

                {/* Portfolio bars */}
                <Bar dataKey="impact" name="Portfolio" maxBarSize={14}>
                  {stressResults.map((d, i) => (
                    <Cell
                      key={`p${i}`}
                      fill={d.impact <= -20 ? R : d.impact >= 0 ? G : R}
                      fillOpacity={0.9}
                    />
                  ))}
                  <LabelList
                    dataKey="impact"
                    position="right"
                    formatter={(v: number) =>
                      `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
                    }
                    style={{ fontFamily: MONO_F, fontSize: 11, fill: BODY }}
                  />
                </Bar>

                {/* SPY benchmark bars */}
                <Bar dataKey="spyImpact" name="S&P 500" maxBarSize={7}>
                  {stressResults.map((_d, i) => (
                    <Cell key={`s${i}`} fill={B} fillOpacity={0.3} />
                  ))}
                </Bar>

                {/* QQQ benchmark bars — only rendered when data is non-zero */}
                {stressResults.some((d) => (d.qqqImpact ?? 0) !== 0) && (
                  <Bar dataKey="qqqImpact" name="Nasdaq-100" maxBarSize={6}>
                    {stressResults.map((_d, i) => (
                      <Cell key={`q${i}`} fill={P} fillOpacity={0.3} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weakest link + fragility badge footer */}
          <div
            style={{
              borderTop: `1px solid ${GRID}`,
              padding: "7px 14px",
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: DIM,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.06,
              }}
            >
              Weakest link
            </span>
            {stressResults.map((s, i) => (
              <div
                key={i}
                style={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <span
                  style={{
                    color: DIM,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.06,
                  }}
                >
                  {s.scenario.split(" ")[0]}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      color: R,
                      fontSize: 12,
                      fontWeight: 700,
                      borderBottom:
                        s.weakLink !== "—" ? `1px solid ${R}60` : "none",
                    }}
                  >
                    {s.weakLink !== "—" ? s.weakLink : "—"}
                  </span>
                  {s.impact <= -20 && (
                    <span
                      style={{
                        color: R,
                        fontSize: 10,
                        border: `1px solid ${R}50`,
                        padding: "0 4px",
                        textTransform: "uppercase",
                        letterSpacing: 0.06,
                      }}
                    >
                      Fragile
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Alpha Gap narratives — one per scenario that has a narrative */}
          {stressResults.some((s) => s.alpha_gap_narrative) && (
            <div
              style={{
                borderTop: `1px solid ${GRID}`,
                padding: "8px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  color: DIM,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.06,
                  marginBottom: 2,
                }}
              >
                Alpha gap · commentary
              </span>
              {stressResults
                .filter((s) => s.alpha_gap_narrative)
                .map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        color: PRIMARY,
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                        border: `1px solid ${PRIMARY}40`,
                        padding: "1px 4px",
                        marginTop: 1,
                      }}
                    >
                      {s.scenario.split(" ")[0].toUpperCase()}
                    </span>
                    <span
                      style={{ color: BODY, fontSize: 12, lineHeight: 1.55 }}
                    >
                      {s.alpha_gap_narrative}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
