/**
 * SwarmReportScreen — IC Briefing + agent breakdown cards.
 *
 * Fetches the latest swarm report from the backend.
 * Shows empty state if unauthenticated or no report exists.
 * Displays: IC Briefing, Market Regime, Quant Metrics, Tax Opportunities, Risk Flags.
 * Uses react-native-chart-kit for the beta bar chart.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { BarChart } from 'react-native-chart-kit'
import type { StackNavigationProp } from '@react-navigation/stack'
import { supabase } from '@/lib/supabase'
import { getLatestSwarmReport, type SwarmReport } from '@/lib/api'
import type { RootStackParamList } from '@/App'

const { width: SCREEN_W } = Dimensions.get('window')
const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace'

const C = {
  bg:       '#080808',
  surface:  '#0D0D0D',
  border:   '#1E1E1E',
  amber:    '#FFB900',
  green:    '#00FF00',
  red:      '#FF4444',
  blue:     '#60A5FA',
  purple:   '#a78bfa',
  dimText:  '#555555',
  midText:  '#888888',
  bodyText: '#C8C8C8',
  white:    '#FFFFFF',
}

type EmptyReason = 'unauthenticated' | 'no_data' | 'error'
type Props = { navigation: StackNavigationProp<RootStackParamList, 'SwarmReport'> }

// ── Agent section card ────────────────────────────────────────────────────────
function AgentCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <View style={[styles.agentCard, { borderLeftColor: accent }]}>
      <Text style={[styles.agentTitle, { color: accent }]}>{title}</Text>
      {children}
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SwarmReportScreen({ navigation }: Props) {
  const [report,     setReport]     = useState<SwarmReport | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [emptyReason, setEmptyReason] = useState<EmptyReason | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setEmptyReason(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setReport(null); setEmptyReason('unauthenticated'); return
      }
      const r = await getLatestSwarmReport(session.access_token)
      if (!r) { setReport(null); setEmptyReason('no_data') }
      else     { setReport(r) }
    } catch {
      setReport(null); setEmptyReason('error')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load(true) }

  if (loading) {
    return (
      <View style={styles.root}>
        <NavBar navigation={navigation} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.amber} />
          <Text style={styles.loadText}>Fetching swarm report...</Text>
        </View>
      </View>
    )
  }

  if (emptyReason) {
    const messages: Record<EmptyReason, { heading: string; sub: string }> = {
      unauthenticated: { heading: 'Sign in required', sub: 'Log in to view your swarm report.' },
      no_data:         { heading: 'No swarm report yet', sub: 'Run a swarm analysis on neufin.app to generate your IC briefing.' },
      error:           { heading: 'Failed to load', sub: 'Could not fetch the swarm report. Pull down to retry.' },
    }
    const { heading, sub } = messages[emptyReason]
    return (
      <View style={styles.root}>
        <NavBar navigation={navigation} />
        <ScrollView
          contentContainerStyle={[styles.centered, { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
        >
          <Text style={styles.emptyHeading}>{heading}</Text>
          <Text style={styles.emptySub}>{sub}</Text>
          {emptyReason === 'error' && (
            <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>↺ RETRY</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    )
  }

  if (!report) return null

  const quant   = report.quant_analysis   ?? {}
  const regime  = report.market_regime    ?? {}
  const tax     = report.tax_report       ?? {}
  const risk    = report.risk_sentinel    ?? {}
  const alpha   = report.alpha_scout      ?? {}
  const opps    = (alpha.opportunities ?? []) as any[]

  // Beta bar chart data
  const betaMap   = quant.beta_map ?? {}
  const betaSyms  = Object.keys(betaMap).slice(0, 5)
  const betaVals  = betaSyms.map((s: string) => parseFloat((betaMap[s] as number).toFixed(2)))

  const regimeColor = regime.regime === 'growth' ? '#3b82f6'
                    : regime.regime === 'inflation' ? C.red
                    : regime.regime === 'stagflation' ? '#f97316'
                    : C.amber

  const riskColor = (risk.risk_level ?? 'medium') === 'high'   ? C.red
                  : (risk.risk_level ?? 'medium') === 'medium'  ? C.amber
                  : C.green

  return (
    <View style={styles.root}>
      <NavBar navigation={navigation} />

      {/* Status strip */}
      <View style={styles.statusStrip}>
        <Chip label="REGIME" value={(report.regime ?? '—').toUpperCase()} color={regimeColor} />
        {report.dna_score && <Chip label="DNA" value={`${report.dna_score}/100`} color={report.dna_score >= 70 ? C.green : report.dna_score >= 45 ? C.amber : C.red} />}
        <Chip label="RISK"   value={(risk.risk_level ?? '—').toUpperCase()} color={riskColor} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
      >

        {/* IC Briefing */}
        <AgentCard title="◈ IC BRIEFING — MANAGING DIRECTOR" accent={C.green}>
          <Text style={styles.briefingText}>{report.briefing}</Text>
        </AgentCard>

        {/* Market Regime */}
        <AgentCard title="◈ MARKET REGIME" accent={regimeColor}>
          <View style={[styles.regimeBig, { borderColor: regimeColor + '40', backgroundColor: regimeColor + '0f' }]}>
            <Text style={[styles.regimeBigLabel, { color: regimeColor }]}>
              {(regime.regime ?? 'N/A').toUpperCase()} REGIME
            </Text>
          </View>
          <View style={styles.metricsRow}>
            <MetricPill label="CPI YoY"     value={regime.cpi_yoy ? `${regime.cpi_yoy}%` : '—'}          color={regimeColor} />
            <MetricPill label="Confidence"  value={regime.confidence ? `${Math.round(regime.confidence * 100)}%` : '—'} color={regimeColor} />
          </View>
          {regime.portfolio_implication && (
            <Text style={styles.subText}>{(regime.portfolio_implication as string).slice(0, 160)}</Text>
          )}
        </AgentCard>

        {/* Quant Metrics + beta bar chart */}
        <AgentCard title="◈ QUANT ANALYSIS" accent={C.purple}>
          <View style={styles.metricsRow}>
            <MetricPill label="HHI"    value={quant.hhi_pts     ? `${quant.hhi_pts}/25`    : '—'} color={C.purple} />
            <MetricPill label="β"      value={quant.weighted_beta ? quant.weighted_beta.toFixed(2) : '—'} color={C.amber} />
            <MetricPill label="Sharpe" value={quant.sharpe_ratio  ? quant.sharpe_ratio.toFixed(2)  : '—'} color={C.blue} />
            <MetricPill label="ρ avg"  value={quant.avg_corr     ? quant.avg_corr.toFixed(2)       : '—'} color={C.amber} />
          </View>
          {quant.hhi_interpretation && (
            <Text style={[styles.subText, { color: C.amber }]}>{quant.hhi_interpretation}</Text>
          )}
          {betaSyms.length > 0 && (
            <BarChart
              data={{
                labels: betaSyms,
                datasets: [{ data: betaVals }],
              }}
              width={SCREEN_W - 60}
              height={140}
              yAxisLabel=""
              yAxisSuffix="β"
              chartConfig={{
                backgroundColor: '#0D0D0D',
                backgroundGradientFrom: '#0D0D0D',
                backgroundGradientTo: '#0D0D0D',
                decimalPlaces: 2,
                color: () => C.purple,
                labelColor: () => C.dimText,
                style: { borderRadius: 4 },
                barPercentage: 0.6,
              }}
              style={{ borderRadius: 4, marginTop: 8 }}
              withInnerLines={false}
              showValuesOnTopOfBars
              fromZero
            />
          )}
        </AgentCard>

        {/* Tax Opportunities */}
        <AgentCard title="◈ TAX OPTIMIZATION" accent={C.green}>
          {tax.available === false ? (
            <Text style={styles.subText}>{tax.narrative as string ?? 'Cost basis required for tax analysis.'}</Text>
          ) : (
            <>
              {tax.total_liability != null && (
                <View style={styles.metricsRow}>
                  <MetricPill label="Liability" value={`$${((tax.total_liability as number) / 1000).toFixed(1)}K`} color={C.red} />
                  {tax.tax_drag_pct != null && <MetricPill label="Tax Drag" value={`${tax.tax_drag_pct}%`} color={C.amber} />}
                </View>
              )}
              {(tax.harvest_opportunities as any[] ?? []).map((h: any, i: number) => (
                <Text key={i} style={styles.harvestRow}>
                  ✓ {h.symbol ?? h.ticker}: harvest ${((h.harvest_amount ?? h.gain ?? 0) / 1000).toFixed(1)}K
                </Text>
              ))}
            </>
          )}
        </AgentCard>

        {/* Risk Flags */}
        <AgentCard title="◈ RISK WATCHDOG" accent={riskColor}>
          <View style={[styles.riskLevel, { borderColor: riskColor + '50', backgroundColor: riskColor + '10' }]}>
            <Text style={[styles.riskLevelText, { color: riskColor }]}>
              {(risk.risk_level ?? 'N/A').toUpperCase()} RISK
              {risk.risk_score != null ? ` · ${(risk.risk_score as number).toFixed(1)}/10` : ''}
            </Text>
          </View>
          {(risk.primary_risks as string[] ?? []).map((r: string, i: number) => (
            <View key={i} style={styles.riskRow}>
              <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
              <Text style={styles.riskText}>{r}</Text>
            </View>
          ))}
        </AgentCard>

        {/* Alpha Scout */}
        {opps.length > 0 && (
          <AgentCard title="◈ ALPHA SCOUT" accent={C.amber}>
            {opps.map((o: any, i: number) => (
              <View key={i} style={styles.oppRow}>
                <View style={styles.oppHeader}>
                  <Text style={styles.oppSymbol}>{o.symbol}</Text>
                  <View style={styles.confBar}>
                    <View style={[styles.confFill, { width: `${Math.round((o.confidence ?? 0) * 100)}%` as any }]} />
                  </View>
                  <Text style={styles.confPct}>{Math.round((o.confidence ?? 0) * 100)}%</Text>
                </View>
                <Text style={styles.oppReason}>{(o.reason as string).slice(0, 100)}</Text>
              </View>
            ))}
          </AgentCard>
        )}

      </ScrollView>
    </View>
  )
}

function NavBar({ navigation }: { navigation: any }) {
  return (
    <View style={styles.nav}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.navBack}>← BACK</Text>
      </TouchableOpacity>
      <Text style={styles.navTitle}>SWARM REPORT</Text>
    </View>
  )
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}: </Text>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
    </View>
  )
}

function MetricPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 12, gap: 10, paddingBottom: 40 },

  nav: {
    height: 48, backgroundColor: '#0D0D0D',
    borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 10,
  },
  navBack:  { color: C.amber, fontSize: 11, fontFamily: MONO, letterSpacing: 1 },
  navTitle: { color: C.dimText, fontSize: 11, fontFamily: MONO, letterSpacing: 2, flex: 1 },

  emptyHeading: { color: C.white, fontSize: 14, fontFamily: MONO, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  emptySub:     { color: C.midText, fontSize: 11, fontFamily: MONO, lineHeight: 17, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn:     { marginTop: 20, borderWidth: 1, borderColor: C.amber + '80', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 4 },
  retryText:    { color: C.amber, fontSize: 11, fontFamily: MONO, fontWeight: '700', letterSpacing: 2 },

  statusStrip: {
    backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 16, flexWrap: 'wrap',
  },
  chip:      { flexDirection: 'row' },
  chipLabel: { color: C.dimText, fontSize: 9, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 },
  chipValue: { fontSize: 9, fontWeight: '700', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText:  { color: C.amber, fontSize: 11, fontFamily: MONO, letterSpacing: 1 },

  agentCard: { backgroundColor: '#0D0D0D', borderRadius: 5, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, padding: 12, gap: 8 },
  agentTitle:{ fontSize: 9, fontWeight: '700', fontFamily: MONO, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 },

  briefingText: { color: C.bodyText, fontSize: 11, fontFamily: MONO, lineHeight: 17 },
  subText:      { color: C.midText, fontSize: 10, fontFamily: MONO, lineHeight: 15 },

  regimeBig:       { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 4, alignItems: 'center' },
  regimeBigLabel:  { fontSize: 12, fontWeight: '700', fontFamily: MONO, letterSpacing: 2 },

  metricsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill:       { backgroundColor: '#111', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', minWidth: 56 },
  pillLabel:  { color: C.dimText, fontSize: 8, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 },
  pillValue:  { fontSize: 12, fontWeight: '700', fontFamily: MONO, marginTop: 2 },

  harvestRow: { color: C.green, fontSize: 10, fontFamily: MONO },

  riskLevel:     { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 4, alignItems: 'center' },
  riskLevelText: { fontSize: 11, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },
  riskRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  riskDot:       { width: 5, height: 5, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  riskText:      { color: C.bodyText, fontSize: 10, fontFamily: MONO, flex: 1, lineHeight: 14 },

  oppRow:    { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, gap: 4 },
  oppHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  oppSymbol: { color: C.amber, fontSize: 12, fontWeight: '700', fontFamily: MONO, width: 48 },
  confBar:   { flex: 1, height: 3, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  confFill:  { height: 3, backgroundColor: C.amber, borderRadius: 2 },
  confPct:   { color: C.dimText, fontSize: 9, fontFamily: MONO, width: 32, textAlign: 'right' },
  oppReason: { color: C.midText, fontSize: 10, fontFamily: MONO, lineHeight: 14 },
})
