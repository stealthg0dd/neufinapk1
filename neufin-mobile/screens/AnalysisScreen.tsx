/**
 * AnalysisScreen — Animated DNA score + live bias/regime/risk data.
 *
 * Data sources (no hardcoded values):
 *   - DNA score, positions_count, total_value → from portfolio param
 *   - Regime, risk flags, bias data → from GET /api/swarm/report/latest
 *   - If no swarm report yet: shows "Run swarm on web" prompt
 *
 * Uses: Reanimated 3, expo-blur, expo-haptics
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withSpring,
  withDelay,
  runOnJS,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RouteProp } from '@react-navigation/native'
import { supabase } from '@/lib/supabase'
import { getLatestSwarmReport, type SwarmReport } from '@/lib/api'
import type { RootStackParamList } from '@/App'

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace'
const SPRING = { damping: 15, stiffness: 150 }

const C = {
  bg:       '#0F172A',
  surface:  '#1E293B',
  border:   '#334155',
  amber:    '#FFB900',
  green:    '#22c55e',
  red:      '#ef4444',
  blue:     '#60A5FA',
  purple:   '#a78bfa',
  dimText:  '#64748b',
  bodyText: '#CBD5E1',
  white:    '#FFFFFF',
}

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Analysis'>
  route: RouteProp<RootStackParamList, 'Analysis'>
}

// ── Animated Circle (Reanimated 3 animatedProps) ──────────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

function DNACircle({ score }: { score: number }) {
  const R    = 64
  const circ = 2 * Math.PI * R
  const color = score >= 70 ? C.green : score >= 45 ? C.amber : C.red

  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(300, withSpring(score, { damping: 20, stiffness: 60 }))
    // Haptic on reveal
    setTimeout(() => {
      Haptics.notificationAsync(
        score >= 70 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
      )
    }, 600)
  }, [score])

  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: circ - (progress.value / 100) * circ,
  }))

  return (
    <View style={styles.circleWrap}>
      <Svg width={160} height={160} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={80} cy={80} r={R} fill="none" stroke={C.border} strokeWidth={10} />
        <AnimatedCircle
          cx={80} cy={80} r={R}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          animatedProps={animProps}
        />
      </Svg>
      <View style={styles.circleCenter}>
        <Text style={[styles.scoreNum, { color }]}>{score}</Text>
        <Text style={styles.scoreDivider}>/100</Text>
        <Text style={[styles.scoreLabel, { color }]}>
          {score >= 70 ? 'STRONG' : score >= 45 ? 'MODERATE' : 'HIGH RISK'}
        </Text>
      </View>
    </View>
  )
}

// ── Animated glass card ───────────────────────────────────────────────────────
function GlassCard({
  children,
  index = 0,
  accent,
}: {
  children: React.ReactNode
  index?: number
  accent?: string
}) {
  const translateY = useSharedValue(30)
  const opacity    = useSharedValue(0)

  useEffect(() => {
    translateY.value = withDelay(200 + index * 80, withSpring(0, SPRING))
    opacity.value    = withDelay(200 + index * 80, withSpring(1, { damping: 20 }))
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  return (
    <Animated.View style={animStyle}>
      <BlurView intensity={16} tint="dark" style={[styles.glassCard, accent && { borderColor: accent + '30' }]}>
        {children}
      </BlurView>
    </Animated.View>
  )
}

// ── Risk flag row ─────────────────────────────────────────────────────────────
function RiskRow({ text, level }: { text: string; level: string }) {
  const color = level === 'HIGH' ? C.red : level === 'MEDIUM' ? C.amber : C.blue
  return (
    <View style={styles.riskRow}>
      <View style={[styles.riskDot, { backgroundColor: color }]} />
      <Text style={styles.riskText}>{text}</Text>
      <Text style={[styles.riskLevel, { color }]}>{level}</Text>
    </View>
  )
}

// ── Skeleton section ──────────────────────────────────────────────────────────
function SkelSection() {
  const opacity = useSharedValue(0.4)
  useEffect(() => {
    const t = setInterval(() => {
      opacity.value = withSpring(opacity.value < 0.7 ? 0.7 : 0.4, { damping: 20, stiffness: 60 })
    }, 800)
    return () => clearInterval(t)
  }, [])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View style={[styles.skelSection, style]}>
      <View style={[styles.skelLine, { width: '40%', height: 10 }]} />
      <View style={[styles.skelLine, { width: '100%', height: 14 }]} />
      <View style={[styles.skelLine, { width: '85%', height: 14 }]} />
    </Animated.View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AnalysisScreen({ navigation, route }: Props) {
  const { portfolio } = route.params
  const score = portfolio.dna_score ?? 0

  const [report,    setReport]    = useState<SwarmReport | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setReport(null); setLoading(false); return }
      const r = await getLatestSwarmReport(session.access_token)
      setReport(r)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const risk    = report?.risk_sentinel    ?? null
  const regime  = report?.market_regime    ?? null
  const quant   = report?.quant_analysis   ?? null

  // Build risk flags from real swarm data
  const riskFlags: { text: string; level: string }[] = risk?.primary_risks
    ? (risk.primary_risks as string[]).map((r) => ({ text: r, level: 'HIGH' }))
    : []

  const regimeLabel = regime?.regime
    ? (regime.regime as string).toUpperCase() + ' REGIME'
    : null

  const regimeColor = regime?.regime === 'growth'      ? '#3b82f6'
                    : regime?.regime === 'inflation'    ? C.red
                    : regime?.regime === 'stagflation'  ? '#f97316'
                    : regime?.regime === 'recession'    ? C.dimText
                    : C.amber

  return (
    <View style={styles.root}>
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack() }}>
          <Text style={styles.navBack}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>ANALYSIS</Text>
        {!portfolio.dna_score && <Text style={styles.noScoreTag}>NO SCORE</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Score + portfolio meta ─────────────────────────────────── */}
        <GlassCard index={0}>
          <View style={styles.scoreRow}>
            {score > 0 ? (
              <DNACircle score={score} />
            ) : (
              <View style={styles.noScoreCircle}>
                <Text style={styles.noScoreText}>—</Text>
                <Text style={styles.noScoreLabel}>No DNA Score{'\n'}Upload CSV on web</Text>
              </View>
            )}
            <View style={styles.scoreMeta}>
              <Text style={styles.portfolioName} numberOfLines={2}>{portfolio.portfolio_name}</Text>
              <Text style={styles.totalValue}>${(portfolio.total_value / 1000).toFixed(1)}K</Text>
              <Text style={styles.posCount}>{portfolio.positions_count} positions</Text>
              {quant?.hhi_pts && (
                <Text style={styles.metaBit}>HHI {quant.hhi_pts}/25 · {quant.hhi_interpretation ?? ''}</Text>
              )}
            </View>
          </View>
        </GlassCard>

        {/* ── Market Regime ──────────────────────────────────────────── */}
        {loading ? (
          <SkelSection />
        ) : regimeLabel ? (
          <GlassCard index={1} accent={regimeColor}>
            <Text style={styles.sectionLabel}>MARKET REGIME</Text>
            <View style={[styles.regimeBadge, { borderColor: regimeColor + '50', backgroundColor: regimeColor + '10' }]}>
              <View style={[styles.regimeDot, { backgroundColor: regimeColor }]} />
              <Text style={[styles.regimeLabel, { color: regimeColor }]}>{regimeLabel}</Text>
              {regime?.confidence && (
                <Text style={[styles.regimeConf, { color: regimeColor }]}>
                  {Math.round((regime.confidence as number) * 100)}% CONF
                </Text>
              )}
            </View>
            {regime?.portfolio_implication && (
              <Text style={styles.regimeImpl}>
                {(regime.portfolio_implication as string).slice(0, 140)}
              </Text>
            )}
          </GlassCard>
        ) : !loadError && !loading ? (
          <GlassCard index={1}>
            <Text style={styles.sectionLabel}>MARKET REGIME</Text>
            <Text style={styles.noDataText}>Run swarm analysis on neufin.app to see regime data</Text>
          </GlassCard>
        ) : null}

        {/* ── Risk Flags ─────────────────────────────────────────────── */}
        {loading ? (
          <SkelSection />
        ) : riskFlags.length > 0 ? (
          <GlassCard index={2} accent={C.red}>
            <Text style={styles.sectionLabel}>
              RISK FLAGS · {(risk?.risk_level as string ?? '').toUpperCase()}
              {risk?.risk_score ? ` · ${(risk.risk_score as number).toFixed(1)}/10` : ''}
            </Text>
            <View style={styles.riskList}>
              {riskFlags.map((f, i) => (
                <React.Fragment key={i}>
                  <RiskRow text={f.text} level={f.level} />
                  {i < riskFlags.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))}
            </View>
          </GlassCard>
        ) : !loadError ? (
          <GlassCard index={2}>
            <Text style={styles.sectionLabel}>RISK FLAGS</Text>
            <Text style={styles.noDataText}>No risk flags — run swarm analysis on neufin.app</Text>
          </GlassCard>
        ) : null}

        {/* ── Error / retry ──────────────────────────────────────────── */}
        {loadError && (
          <GlassCard index={2} accent={C.red}>
            <Text style={styles.errorText}>Failed to load swarm data</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); load() }}
            >
              <Text style={styles.retryBtnText}>↺ RETRY</Text>
            </TouchableOpacity>
          </GlassCard>
        )}

        {/* ── Quant metrics strip ─────────────────────────────────────── */}
        {quant && !loading && (
          <GlassCard index={3} accent={C.purple}>
            <Text style={styles.sectionLabel}>QUANT METRICS</Text>
            <View style={styles.quantRow}>
              {quant.weighted_beta != null && (
                <QuantPill label="β"      value={(quant.weighted_beta as number).toFixed(2)}   color={C.amber} />
              )}
              {quant.sharpe_ratio != null && (
                <QuantPill label="SHARPE" value={(quant.sharpe_ratio as number).toFixed(2)}    color={C.blue} />
              )}
              {quant.avg_corr != null && (
                <QuantPill label="ρ avg"  value={(quant.avg_corr as number).toFixed(2)}        color={C.amber} />
              )}
            </View>
          </GlassCard>
        )}

        {/* ── Swarm CTA ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.swarmCTA}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
            navigation.navigate('SwarmAlerts')
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.swarmCTAText}>▶ FULL SWARM REPORT</Text>
          <Text style={styles.swarmCTASub}>IC Briefing · Tax · Alpha Scout · 7-agent deep analysis</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  )
}

function QuantPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.quantPill}>
      <Text style={styles.quantLabel}>{label}</Text>
      <Text style={[styles.quantValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 14, gap: 12, paddingBottom: 40 },

  nav: {
    height: 52, backgroundColor: '#0D1117',
    borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 10,
  },
  navBack:     { color: C.amber, fontSize: 11, fontFamily: MONO, letterSpacing: 1 },
  navTitle:    { color: C.dimText, fontSize: 11, fontFamily: MONO, letterSpacing: 2, flex: 1 },
  noScoreTag:  { color: C.red, fontSize: 8, fontFamily: MONO, letterSpacing: 1, borderWidth: 1, borderColor: C.red + '60', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 2 },

  // Glass card
  glassCard: {
    borderRadius: 12, overflow: 'hidden',
    padding: 14, gap: 10,
    backgroundColor: 'rgba(30,41,59,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },

  // DNA circle
  circleWrap:   { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  circleCenter: { position: 'absolute', alignItems: 'center' },
  scoreNum:     { fontSize: 30, fontWeight: '700', fontFamily: MONO },
  scoreDivider: { color: C.dimText, fontSize: 10, fontFamily: MONO },
  scoreLabel:   { fontSize: 7, fontWeight: '700', fontFamily: MONO, letterSpacing: 1, marginTop: 2 },

  noScoreCircle: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', borderRadius: 80, borderWidth: 2, borderColor: C.border, gap: 6 },
  noScoreText:   { color: C.dimText, fontSize: 32, fontFamily: MONO },
  noScoreLabel:  { color: C.dimText, fontSize: 9, fontFamily: MONO, textAlign: 'center', lineHeight: 14 },

  scoreRow:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scoreMeta:     { flex: 1, gap: 4 },
  portfolioName: { color: C.white, fontSize: 13, fontWeight: '700', fontFamily: MONO },
  totalValue:    { color: C.blue, fontSize: 20, fontWeight: '700', fontFamily: MONO },
  posCount:      { color: C.dimText, fontSize: 10, fontFamily: MONO },
  metaBit:       { color: C.amber, fontSize: 9, fontFamily: MONO },

  sectionLabel: { color: C.amber, fontSize: 9, fontFamily: MONO, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },

  // Regime
  regimeBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, gap: 8 },
  regimeDot:   { width: 7, height: 7, borderRadius: 4 },
  regimeLabel: { fontSize: 11, fontWeight: '700', fontFamily: MONO, letterSpacing: 1, flex: 1 },
  regimeConf:  { fontSize: 9, fontWeight: '700', fontFamily: MONO },
  regimeImpl:  { color: C.bodyText, fontSize: 10, fontFamily: MONO, lineHeight: 15 },

  noDataText: { color: C.dimText, fontSize: 10, fontFamily: MONO, lineHeight: 16 },
  errorText:  { color: C.red, fontSize: 11, fontFamily: MONO },
  retryBtn:   { borderWidth: 1, borderColor: C.red + '60', borderRadius: 4, paddingVertical: 6, alignItems: 'center', marginTop: 4 },
  retryBtnText:{ color: C.red, fontSize: 10, fontFamily: MONO, letterSpacing: 1 },

  // Risk flags
  riskList:  { gap: 6 },
  riskRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  riskDot:   { width: 5, height: 5, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  riskText:  { color: C.bodyText, fontSize: 10, fontFamily: MONO, flex: 1, lineHeight: 14 },
  riskLevel: { fontSize: 8, fontWeight: '700', fontFamily: MONO, letterSpacing: 1, marginTop: 1 },
  divider:   { height: 1, backgroundColor: C.border },

  // Quant
  quantRow:   { flexDirection: 'row', gap: 8 },
  quantPill:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 8, alignItems: 'center' },
  quantLabel: { color: C.dimText, fontSize: 8, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 },
  quantValue: { fontSize: 14, fontWeight: '700', fontFamily: MONO, marginTop: 3 },

  // Skeleton
  skelSection: { backgroundColor: C.surface, borderRadius: 12, padding: 14, gap: 8 },
  skelLine:    { backgroundColor: C.border, borderRadius: 4 },

  // CTA
  swarmCTA:    { backgroundColor: 'rgba(255,185,0,0.07)', borderWidth: 1, borderColor: C.amber + '50', borderRadius: 10, paddingVertical: 14, alignItems: 'center', gap: 4 },
  swarmCTAText:{ color: C.amber, fontSize: 12, fontWeight: '700', fontFamily: MONO, letterSpacing: 2 },
  swarmCTASub: { color: C.dimText, fontSize: 9, fontFamily: MONO },
})
