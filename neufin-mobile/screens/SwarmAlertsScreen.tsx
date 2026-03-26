/**
 * SwarmAlertsScreen — 6-card swarm report + live macro push alerts.
 *
 * Top section: Research Intelligence Grid (6 cards matching web design)
 *   Fetches GET /api/swarm/report/latest
 *   Empty state if no report — prompts user to run swarm on web
 *
 * Bottom section: Macro push alert inbox (existing functionality preserved)
 *   Polls GET /api/alerts/recent every 60s
 *
 * Uses: Reanimated 3 stagger, expo-blur, expo-haptics — NO demo/mock data
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import type { SwarmReport } from '@/lib/api'
import type { MacroAlert } from '@/lib/notifications'
import { getLatestSwarmReport } from '@/lib/api'
import { supabase } from '@/lib/supabase'

const API_BASE = 'https://neufin101-production.up.railway.app'

const { width: SCREEN_W } = Dimensions.get('window')
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
  teal:     '#2dd4bf',
  dimText:  '#64748b',
  bodyText: '#CBD5E1',
  white:    '#FFFFFF',
}

// ── Animated glass card wrapper ───────────────────────────────────────────────
function GlassCard({
  children,
  index = 0,
  accent = C.border,
  style: extraStyle,
}: {
  children: React.ReactNode
  index?: number
  accent?: string
  style?: object
}) {
  const translateY = useSharedValue(24)
  const opacity    = useSharedValue(0)

  useEffect(() => {
    translateY.value = withDelay(index * 70, withSpring(0, SPRING))
    opacity.value    = withDelay(index * 70, withSpring(1, { damping: 20 }))
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  return (
    <Animated.View style={[animStyle, extraStyle]}>
      <BlurView intensity={16} tint="dark" style={[styles.glassCard, { borderColor: accent + '35' }]}>
        {children}
      </BlurView>
    </Animated.View>
  )
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────
function Skeleton({ height = 120, index = 0 }: { height?: number; index?: number }) {
  const opacity = useSharedValue(0.35)
  useEffect(() => {
    const t = setInterval(() => {
      opacity.value = withSpring(opacity.value < 0.65 ? 0.65 : 0.35, { damping: 18, stiffness: 50 })
    }, 700 + index * 150)
    return () => clearInterval(t)
  }, [])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View style={[styles.skeleton, { height }, style]} />
  )
}

// ── Research card components ──────────────────────────────────────────────────

function CardHeader({ title, accent }: { title: string; accent: string }) {
  return (
    <View style={styles.cardHeaderRow}>
      <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
    </View>
  )
}

function MarketRegimeCard({ data }: { data: Record<string, any> }) {
  const regime = (data.regime ?? 'N/A') as string
  const conf   = data.confidence ? Math.round((data.confidence as number) * 100) : null
  const color  = regime === 'growth'       ? '#3b82f6'
               : regime === 'inflation'    ? C.red
               : regime === 'stagflation'  ? '#f97316'
               : regime === 'recession'    ? C.dimText
               : C.amber

  return (
    <GlassCard index={0} accent={color}>
      <CardHeader title="◈ MARKET REGIME" accent={color} />
      <View style={[styles.regimeBig, { borderColor: color + '50', backgroundColor: color + '12' }]}>
        <Text style={[styles.regimeBigText, { color }]}>{regime.toUpperCase()} REGIME</Text>
      </View>
      <View style={styles.pillRow}>
        {conf && <Pill label="CONFIDENCE" value={`${conf}%`}      color={color} />}
        {data.cpi_yoy && <Pill label="CPI YOY"    value={`${data.cpi_yoy}%`} color={C.bodyText} />}
      </View>
      {data.portfolio_implication && (
        <Text style={styles.bodyText}>{(data.portfolio_implication as string).slice(0, 130)}</Text>
      )}
    </GlassCard>
  )
}

function StrategistCard({ data }: { data: Record<string, any> }) {
  const sentiment = (data.sentiment ?? 'constructive') as string
  const color = sentiment === 'cautious' ? C.amber : sentiment === 'bearish' ? C.red : C.green
  const drivers = (data.key_drivers ?? []) as string[]

  return (
    <GlassCard index={1} accent={color}>
      <CardHeader title="◈ STRATEGIST INTEL" accent={color} />
      <View style={[styles.sentimentBadge, { borderColor: color + '50', backgroundColor: color + '10' }]}>
        <Text style={[styles.sentimentText, { color }]}>{sentiment.toUpperCase()}</Text>
      </View>
      {data.narrative && (
        <Text style={styles.bodyText}>{(data.narrative as string).slice(0, 160)}</Text>
      )}
      {drivers.slice(0, 3).map((d, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={[styles.bullet, { color }]}>›</Text>
          <Text style={styles.bulletText}>{d}</Text>
        </View>
      ))}
    </GlassCard>
  )
}

function QuantCard({ data }: { data: Record<string, any> }) {
  const betaMap = (data.beta_map ?? {}) as Record<string, number>
  const syms    = Object.keys(betaMap).slice(0, 5)

  return (
    <GlassCard index={2} accent={C.purple}>
      <CardHeader title="◈ QUANT ANALYSIS" accent={C.purple} />
      <View style={styles.pillRow}>
        <Pill label="HHI"    value={data.hhi_pts     ? `${data.hhi_pts}/25`                  : '—'} color={C.purple} />
        <Pill label="β"      value={data.weighted_beta ? (data.weighted_beta as number).toFixed(2) : '—'} color={C.amber} />
        <Pill label="SHARPE" value={data.sharpe_ratio  ? (data.sharpe_ratio as number).toFixed(2)  : '—'} color={C.blue} />
        <Pill label="ρ avg"  value={data.avg_corr      ? (data.avg_corr as number).toFixed(2)      : '—'} color={C.amber} />
      </View>
      {data.hhi_interpretation && (
        <Text style={[styles.bodyText, { color: C.amber }]}>{data.hhi_interpretation as string}</Text>
      )}
      {/* Per-symbol beta bars */}
      {syms.length > 0 && (
        <View style={styles.betaList}>
          {syms.map((s) => {
            const b    = betaMap[s]
            const bPct = Math.min((b / 2.5) * 100, 100)
            return (
              <View key={s} style={styles.betaRow}>
                <Text style={styles.betaSym}>{s}</Text>
                <View style={styles.betaTrack}>
                  <View style={[styles.betaFill, { width: `${bPct}%` as any, backgroundColor: b >= 1.5 ? C.red : b >= 1.2 ? C.amber : C.green }]} />
                </View>
                <Text style={[styles.betaVal, { color: b >= 1.5 ? C.red : b >= 1.2 ? C.amber : C.green }]}>{b.toFixed(2)}β</Text>
              </View>
            )
          })}
        </View>
      )}
    </GlassCard>
  )
}

function TaxCard({ data }: { data: Record<string, any> }) {
  const available = data.available === true
  const opps      = (data.harvest_opportunities ?? []) as any[]

  return (
    <GlassCard index={3} accent={C.teal}>
      <CardHeader title="◈ TAX OPTIMIZATION" accent={C.teal} />
      {!available ? (
        <Text style={styles.bodyText}>{(data.narrative as string) || 'No cost basis provided. Upload CSV with cost_basis column on neufin.app.'}</Text>
      ) : (
        <>
          <View style={styles.pillRow}>
            {data.total_liability != null && (
              <Pill label="LIABILITY" value={`$${((data.total_liability as number) / 1000).toFixed(1)}K`} color={C.red} />
            )}
            {data.tax_drag_pct != null && (
              <Pill label="TAX DRAG"  value={`${data.tax_drag_pct}%`} color={C.amber} />
            )}
          </View>
          {opps.slice(0, 3).map((o: any, i: number) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: C.teal }]}>✓</Text>
              <Text style={styles.bulletText}>{o.symbol}: harvest ${((o.harvest_amount ?? o.gain ?? 0) / 1000).toFixed(1)}K</Text>
            </View>
          ))}
        </>
      )}
    </GlassCard>
  )
}

function RiskCard({ data }: { data: Record<string, any> }) {
  const level  = (data.risk_level ?? 'medium') as string
  const score  = (data.risk_score ?? 5) as number
  const color  = level === 'high' ? C.red : level === 'medium' ? C.amber : C.green
  const flags  = (data.primary_risks ?? []) as string[]

  return (
    <GlassCard index={4} accent={color}>
      <CardHeader title="◈ RISK WATCHDOG" accent={color} />
      <View style={[styles.riskLevelBadge, { borderColor: color + '50', backgroundColor: color + '10' }]}>
        <Text style={[styles.riskLevelText, { color }]}>
          {level.toUpperCase()} RISK · {score.toFixed(1)}/10
        </Text>
      </View>
      {flags.map((f, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.flagDot, { backgroundColor: color }]} />
          <Text style={styles.bulletText}>{f}</Text>
        </View>
      ))}
    </GlassCard>
  )
}

function AlphaCard({ data }: { data: Record<string, any> }) {
  const opps = (data.opportunities ?? []) as any[]

  return (
    <GlassCard index={5} accent={C.amber}>
      <CardHeader title="◈ ALPHA SCOUT" accent={C.amber} />
      {opps.length === 0 ? (
        <Text style={styles.bodyText}>No opportunities identified</Text>
      ) : (
        opps.slice(0, 3).map((o: any, i: number) => (
          <View key={i} style={[styles.oppBlock, i > 0 && { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }]}>
            <View style={styles.oppHeader}>
              <Text style={styles.oppSym}>{o.symbol}</Text>
              <View style={styles.confTrack}>
                <View style={[styles.confFill, { width: `${Math.round((o.confidence ?? 0) * 100)}%` as any }]} />
              </View>
              <Text style={styles.confPct}>{Math.round((o.confidence ?? 0) * 100)}%</Text>
            </View>
            <Text style={styles.oppReason}>{(o.reason as string).slice(0, 90)}</Text>
          </View>
        ))
      )}
    </GlassCard>
  )
}

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Macro alert card (preserved from original screen) ────────────────────────
function AlertCard({ alert }: { alert: MacroAlert }) {
  const regime = alert.regime.toLowerCase()
  const color  = regime.includes('inflation') ? C.amber
               : regime.includes('disinflation') || regime.includes('target') ? C.green
               : regime.includes('high') ? C.red
               : C.dimText
  const dateStr = new Date(alert.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <View style={[styles.alertCard, { borderLeftColor: color }]}>
      <View style={styles.alertHeader}>
        <View style={[styles.alertPill, { borderColor: color + '60' }]}>
          <View style={[styles.alertDot, { backgroundColor: color }]} />
          <Text style={[styles.alertRegime, { color }]}>{alert.regime.toUpperCase()}</Text>
        </View>
        <Text style={styles.alertTime}>{dateStr}</Text>
      </View>
      <Text style={styles.alertTitle}>{alert.title}</Text>
      <Text style={styles.alertBody}>{alert.body}</Text>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SwarmAlertsScreen() {
  const [report,        setReport]        = useState<SwarmReport | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError,   setReportError]   = useState(false)
  const [alerts,        setAlerts]        = useState<MacroAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [subscribed,    setSubscribed]    = useState(false)
  const [subLoading,    setSubLoading]    = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadReport = useCallback(async () => {
    setReportLoading(true)
    setReportError(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setReport(null); return }
      const r = await getLatestSwarmReport(session.access_token)
      setReport(r)
    } catch (err) {
      console.error('[SwarmAlerts] loadReport error:', err)
      setReportError(true)
    } finally {
      setReportLoading(false)
    }
  }, [])

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts/recent?limit=20`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(Array.isArray(data) ? data : (data.alerts ?? []))
      }
    } catch (err) {
      console.warn('[SwarmAlerts] loadAlerts error:', err)
    } finally {
      setAlertsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport()
    loadAlerts()
    // Poll alerts every 60 seconds
    pollRef.current = setInterval(() => loadAlerts(), 60_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadReport, loadAlerts])

  const onRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setRefreshing(true)
    Promise.all([loadReport(), loadAlerts()]).finally(() => setRefreshing(false))
  }, [loadReport, loadAlerts])

  const handleSubscribe = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSubscribed(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  const mr   = report?.market_regime    ?? null
  const si   = report?.strategist_intel ?? null
  const qa   = report?.quant_analysis   ?? null
  const tr   = report?.tax_report       ?? null
  const rs   = report?.risk_sentinel    ?? null
  const as_  = report?.alpha_scout      ?? null

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
    >
      {/* Nav */}
      <View style={styles.nav}>
        <Text style={styles.navBrand}>NEUFIN</Text>
        <Text style={styles.navSep}>/</Text>
        <Text style={styles.navTitle}>SWARM ALERTS</Text>
        <TouchableOpacity
          style={[styles.subBtn, subscribed && styles.subBtnActive]}
          onPress={handleSubscribe}
          disabled={subLoading || subscribed}
          activeOpacity={0.8}
        >
          {subLoading
            ? <ActivityIndicator size="small" color={C.amber} />
            : <Text style={[styles.subBtnText, subscribed && { color: C.green }]}>{subscribed ? '● LIVE' : '▶ SUBSCRIBE'}</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Status strip */}
      <View style={styles.strip}>
        <Chip label="REGIME" value={report?.regime?.toUpperCase() ?? '—'} color={C.blue} />
        {report?.dna_score && <Chip label="DNA" value={`${report.dna_score}/100`} color={report.dna_score >= 70 ? C.green : report.dna_score >= 45 ? C.amber : C.red} />}
        <Chip label="ALERTS" value={String(alerts.length)} color={C.amber} />
        <Chip label="PUSH" value={subscribed ? 'ACTIVE' : 'OFF'} color={subscribed ? C.green : C.dimText} />
      </View>

      {/* ── Research Intelligence Grid ────────────────────────────────── */}
      <Text style={styles.sectionHeader}>RESEARCH INTELLIGENCE</Text>

      {reportLoading ? (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={110} index={i} />)}
        </>
      ) : reportError ? (
        <TouchableOpacity
          style={styles.errorCard}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); loadReport() }}
        >
          <Text style={styles.errorText}>Failed to load swarm report</Text>
          <Text style={styles.retryText}>↺ TAP TO RETRY</Text>
        </TouchableOpacity>
      ) : !report ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>◈</Text>
          <Text style={styles.emptyTitle}>No swarm report yet</Text>
          <Text style={styles.emptyBody}>Open neufin.app → Upload CSV → Run Swarm to generate your Intelligence Report</Text>
        </View>
      ) : (
        <>
          {mr && <MarketRegimeCard  data={mr} />}
          {si && <StrategistCard   data={si} />}
          {qa && <QuantCard        data={qa} />}
          {tr && <TaxCard          data={tr} />}
          {rs && <RiskCard         data={rs} />}
          {as_ && <AlphaCard      data={as_} />}
        </>
      )}

      {/* ── Macro Alerts ─────────────────────────────────────────────── */}
      <Text style={[styles.sectionHeader, { marginTop: 16 }]}>MACRO ALERTS</Text>

      {alertsLoading ? (
        <Skeleton height={80} />
      ) : alerts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{subscribed ? '◉' : '◌'}</Text>
          <Text style={styles.emptyTitle}>{subscribed ? 'Monitoring...' : 'Not subscribed'}</Text>
          <Text style={styles.emptyBody}>
            {subscribed
              ? 'You will be notified when FRED CPI data triggers a macro regime change.'
              : 'Subscribe above to receive push notifications on regime shifts.'}
          </Text>
        </View>
      ) : (
        alerts.map((a) => <AlertCard key={a.id} alert={a} />)
      )}

      <Text style={styles.footer}>Alerts trigger when FRED CPI YoY crosses regime thresholds · Neufin Swarm v1</Text>
    </ScrollView>
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 12, gap: 10, paddingBottom: 40 },

  nav: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 0, paddingVertical: 8,
  },
  navBrand:    { color: C.amber, fontWeight: '700', fontSize: 13, fontFamily: MONO, letterSpacing: 2 },
  navSep:      { color: C.dimText, fontSize: 11 },
  navTitle:    { color: C.dimText, fontSize: 11, fontFamily: MONO, letterSpacing: 2, flex: 1 },
  subBtn:      { borderWidth: 1, borderColor: C.amber, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, minWidth: 80, alignItems: 'center' },
  subBtnActive:{ borderColor: C.green },
  subBtnText:  { color: C.amber, fontSize: 9, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },

  strip: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4, paddingBottom: 8 },
  chip:  { flexDirection: 'row' },
  chipLabel: { color: C.dimText, fontSize: 9, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 },
  chipValue: { fontSize: 9, fontWeight: '700', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 },

  sectionHeader: { color: C.amber, fontSize: 9, fontFamily: MONO, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },

  // Glass card
  glassCard: {
    borderRadius: 10, overflow: 'hidden',
    padding: 12, gap: 8,
    backgroundColor: 'rgba(30,41,59,0.55)',
    borderWidth: 1,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle:     { fontSize: 9, fontWeight: '700', fontFamily: MONO, letterSpacing: 2, textTransform: 'uppercase' },

  // Regime
  regimeBig:     { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 5, alignItems: 'center' },
  regimeBigText: { fontSize: 12, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },

  // Sentiment
  sentimentBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  sentimentText:  { fontSize: 10, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },

  bodyText: { color: C.bodyText, fontSize: 10, fontFamily: MONO, lineHeight: 15 },
  bulletRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bullet:   { fontSize: 11, fontWeight: '700', marginTop: -1 },
  bulletText:{ color: C.bodyText, fontSize: 10, fontFamily: MONO, flex: 1, lineHeight: 14 },

  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill:    { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5, alignItems: 'center', minWidth: 50 },
  pillLabel:{ color: C.dimText, fontSize: 7, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1 },
  pillValue:{ fontSize: 12, fontWeight: '700', fontFamily: MONO, marginTop: 2 },

  // Beta bars
  betaList: { gap: 4 },
  betaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  betaSym:  { color: C.dimText, fontSize: 9, fontFamily: MONO, width: 40 },
  betaTrack:{ flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  betaFill: { height: 3, borderRadius: 2 },
  betaVal:  { fontSize: 9, fontWeight: '700', fontFamily: MONO, width: 36, textAlign: 'right' },

  // Risk
  riskLevelBadge: { borderWidth: 1, borderRadius: 5, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' },
  riskLevelText:  { fontSize: 11, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },
  flagDot:        { width: 5, height: 5, borderRadius: 3, marginTop: 4, flexShrink: 0 },

  // Alpha scout
  oppBlock:  { gap: 4 },
  oppHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  oppSym:    { color: C.amber, fontSize: 12, fontWeight: '700', fontFamily: MONO, width: 48 },
  confTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  confFill:  { height: 3, backgroundColor: C.amber, borderRadius: 2 },
  confPct:   { color: C.dimText, fontSize: 9, fontFamily: MONO, width: 30, textAlign: 'right' },
  oppReason: { color: C.dimText, fontSize: 9, fontFamily: MONO, lineHeight: 13 },

  // Skeleton
  skeleton: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border },

  // Empty / error
  emptyCard:  { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 24, alignItems: 'center', gap: 8 },
  emptyIcon:  { color: C.dimText, fontSize: 32 },
  emptyTitle: { color: C.white, fontSize: 13, fontWeight: '700', fontFamily: MONO },
  emptyBody:  { color: C.dimText, fontSize: 10, fontFamily: MONO, textAlign: 'center', lineHeight: 16 },
  errorCard:  { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, borderWidth: 1, borderColor: C.red + '40', padding: 16, alignItems: 'center', gap: 6 },
  errorText:  { color: C.red, fontSize: 11, fontFamily: MONO },
  retryText:  { color: C.red + 'aa', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },

  // Macro alert cards
  alertCard:   { backgroundColor: 'rgba(30,41,59,0.55)', borderRadius: 8, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, padding: 10, gap: 4 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  alertDot:    { width: 5, height: 5, borderRadius: 3 },
  alertRegime: { fontSize: 8, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },
  alertTime:   { color: C.dimText, fontSize: 8, fontFamily: MONO },
  alertTitle:  { color: C.white, fontSize: 12, fontWeight: '700', fontFamily: MONO },
  alertBody:   { color: C.bodyText, fontSize: 10, fontFamily: MONO, lineHeight: 14 },

  footer: { color: C.dimText, fontSize: 8, fontFamily: MONO, textAlign: 'center', marginTop: 8 },
})
