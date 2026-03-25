/**
 * PortfolioSyncScreen — Default landing screen.
 *
 * Fetches the user's live portfolio list from the backend.
 * - Unauthenticated  → shows "Sign in on web" empty state
 * - Authenticated, no data → shows "Upload CSV on web" empty state
 * - Has data → glassmorphic portfolio cards with Reanimated spring entrance
 *
 * Uses: NativeWind, Reanimated, expo-blur, expo-haptics
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { useFocusEffect } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import { supabase } from '@/lib/supabase'
import { getPortfolioList, type PortfolioSummary } from '@/lib/api'
import type { RootStackParamList } from '@/App'

const { width: SCREEN_W } = Dimensions.get('window')
const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace'

const C = {
  bg:       '#0F172A',
  surface:  '#1E293B',
  border:   '#334155',
  amber:    '#FFB900',
  green:    '#22c55e',
  red:      '#ef4444',
  blue:     '#60A5FA',
  dimText:  '#64748b',
  bodyText: '#CBD5E1',
  white:    '#FFFFFF',
}

const SPRING = { damping: 15, stiffness: 150, mass: 1 }

type Props = { navigation: StackNavigationProp<RootStackParamList, 'PortfolioSync'> }

// ── Skeleton shimmer card ─────────────────────────────────────────────────────
function SkeletonCard({ index }: { index: number }) {
  const opacity = useSharedValue(0.4)
  useEffect(() => {
    const interval = setInterval(() => {
      opacity.value = withSpring(opacity.value < 0.7 ? 0.7 : 0.4, { damping: 20, stiffness: 60 })
    }, 700 + index * 120)
    return () => clearInterval(interval)
  }, [])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View style={[styles.skeletonCard, style]}>
      <View style={[styles.skeletonLine, { width: '55%', height: 14 }]} />
      <View style={styles.skeletonRow}>
        {[60, 50, 70].map((w, i) => (
          <View key={i} style={[styles.skeletonPill, { width: w }]} />
        ))}
      </View>
      <View style={[styles.skeletonLine, { width: '100%', height: 3, marginTop: 4 }]} />
    </Animated.View>
  )
}

// ── Animated portfolio card ───────────────────────────────────────────────────
function PortfolioCard({
  portfolio,
  index,
  onPress,
}: {
  portfolio: PortfolioSummary
  index: number
  onPress: () => void
}) {
  const translateY = useSharedValue(40)
  const opacity    = useSharedValue(0)

  useEffect(() => {
    translateY.value = withDelay(index * 80, withSpring(0, SPRING))
    opacity.value    = withDelay(index * 80, withSpring(1, { damping: 20, stiffness: 120 }))
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  const sc    = portfolio.dna_score
  const color = !sc ? C.dimText : sc >= 70 ? C.green : sc >= 45 ? C.amber : C.red
  const label = !sc ? 'NO SCORE' : sc >= 70 ? 'STRONG' : sc >= 45 ? 'MODERATE' : 'HIGH RISK'

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onPress()
  }

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
        <BlurView intensity={18} tint="dark" style={styles.card}>
          {/* Glow border overlay */}
          <View style={[styles.cardGlowBorder, { borderColor: color + '30' }]} />

          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.portfolioName} numberOfLines={1}>{portfolio.portfolio_name}</Text>
            {sc !== null && (
              <View style={[styles.scorePill, { borderColor: color + '70' }]}>
                <Text style={[styles.scorePillText, { color }]}>{sc}<Text style={styles.scorePillSlash}>/100</Text></Text>
              </View>
            )}
          </View>

          {/* Metrics */}
          <View style={styles.metricsRow}>
            <MetricCell label="VALUE"     value={`$${(portfolio.total_value / 1000).toFixed(1)}K`} color={C.blue} />
            <MetricCell label="POSITIONS" value={String(portfolio.positions_count)}                color={C.bodyText} />
            <MetricCell label="RATING"    value={label}                                            color={color} />
          </View>

          {/* DNA bar */}
          {sc !== null && (
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${sc}%` as any, backgroundColor: color }]} />
            </View>
          )}

          {/* CTA row */}
          <View style={styles.cardFooter}>
            <Text style={styles.lastUpdated}>
              {new Date(portfolio.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
            <Text style={[styles.viewLink, { color }]}>VIEW ANALYSIS →</Text>
          </View>
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  )
}

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ reason }: { reason: 'unauthenticated' | 'no_data' | 'error'; onRetry: () => void }) {
  const translateY = useSharedValue(20)
  const opacity    = useSharedValue(0)
  useEffect(() => {
    translateY.value = withSpring(0, SPRING)
    opacity.value    = withSpring(1, { damping: 20 })
  }, [])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }], opacity: opacity.value }))

  const { icon, title, body } = {
    unauthenticated: { icon: '◈', title: 'Sign in to sync', body: 'Open neufin.app in your browser, sign in, and upload a portfolio CSV to see it here.' },
    no_data:         { icon: '◉', title: 'No portfolios yet', body: 'Upload a portfolio CSV at neufin.app to sync your holdings and DNA score.' },
    error:           { icon: '⚠', title: 'Sync failed',       body: 'Could not reach the backend. Check your connection and try again.' },
  }[reason]

  return (
    <Animated.View style={[styles.emptyWrap, animStyle]}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Animated.View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PortfolioSyncScreen({ navigation }: Props) {
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [emptyReason, setEmptyReason] = useState<'unauthenticated' | 'no_data' | 'error' | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setEmptyReason(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setPortfolios([])
        setEmptyReason('unauthenticated')
        return
      }
      const list = await getPortfolioList(session.access_token)
      if (list.length === 0) {
        setPortfolios([])
        setEmptyReason('no_data')
      } else {
        setPortfolios(list)
        setEmptyReason(null)
      }
    } catch {
      setPortfolios([])
      setEmptyReason('error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setRefreshing(true)
    load(true)
  }

  const openPortfolio = (p: PortfolioSummary) => {
    navigation.navigate('Analysis', { portfolio: p })
  }

  return (
    <View style={styles.root}>
      {/* Nav */}
      <View style={styles.nav}>
        <Text style={styles.navBrand}>NEUFIN</Text>
        <Text style={styles.navSep}>/</Text>
        <Text style={styles.navTitle}>PORTFOLIO SYNC</Text>
        <View style={[styles.statusDot, { backgroundColor: emptyReason ? C.red : C.green }]} />
      </View>

      {loading ? (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.sectionLabel}>FETCHING PORTFOLIOS...</Text>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} index={i} />)}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={emptyReason ? styles.listEmpty : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />
          }
        >
          {emptyReason ? (
            <EmptyState reason={emptyReason} onRetry={() => load()} />
          ) : (
            <>
              <Text style={styles.sectionLabel}>
                {portfolios.length} PORTFOLIO{portfolios.length !== 1 ? 'S' : ''} SYNCED
              </Text>
              {portfolios.map((p, i) => (
                <PortfolioCard key={p.portfolio_id} portfolio={p} index={i} onPress={() => openPortfolio(p)} />
              ))}
            </>
          )}

          {/* Swarm shortcut (always visible) */}
          {!emptyReason && (
            <TouchableOpacity
              style={styles.swarmBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                navigation.navigate('SwarmAlerts')
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.swarmBtnText}>▶ SWARM ALERTS & REPORTS</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  nav: {
    height: 52, backgroundColor: '#0D1117',
    borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 8,
  },
  navBrand:  { color: C.amber, fontWeight: '700', fontSize: 13, fontFamily: MONO, letterSpacing: 2 },
  navSep:    { color: C.dimText, fontSize: 11 },
  navTitle:  { color: C.dimText, fontSize: 11, fontFamily: MONO, letterSpacing: 2, flex: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },

  list:      { padding: 16, gap: 12 },
  listEmpty: { flex: 1 },

  sectionLabel: {
    color: C.dimText, fontSize: 9, fontFamily: MONO,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
  },

  // Glassmorphic card
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    padding: 14,
    gap: 10,
    backgroundColor: 'rgba(30,41,59,0.55)',
  },
  cardGlowBorder: {
    position: 'absolute', inset: 0, borderRadius: 12,
    borderWidth: 1, pointerEvents: 'none',
  } as any,
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  portfolioName: { color: C.white, fontSize: 14, fontWeight: '700', fontFamily: MONO, flex: 1 },
  scorePill:     { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  scorePillText: { fontSize: 16, fontWeight: '700', fontFamily: MONO },
  scorePillSlash:{ color: C.dimText, fontSize: 10 },

  metricsRow: { flexDirection: 'row', gap: 6 },
  metricCell: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6, padding: 8,
  },
  metricLabel: { color: C.dimText, fontSize: 8, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  metricValue: { fontSize: 11, fontWeight: '700', fontFamily: MONO },

  barTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  barFill:  { height: 3, borderRadius: 2 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastUpdated:{ color: C.dimText, fontSize: 9, fontFamily: MONO },
  viewLink:   { fontSize: 9, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },

  // Skeleton
  skeletonCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    gap: 10, borderWidth: 1, borderColor: C.border,
  },
  skeletonLine: { backgroundColor: C.border, borderRadius: 4 },
  skeletonRow:  { flexDirection: 'row', gap: 8 },
  skeletonPill: { backgroundColor: C.border, borderRadius: 6, height: 32 },

  // Empty state
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon:  { color: C.dimText, fontSize: 48 },
  emptyTitle: { color: C.white, fontSize: 14, fontWeight: '700', fontFamily: MONO, textAlign: 'center' },
  emptyBody:  { color: C.dimText, fontSize: 11, fontFamily: MONO, textAlign: 'center', lineHeight: 18 },

  swarmBtn:     { marginTop: 8, borderWidth: 1, borderColor: C.amber + '40', borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,185,0,0.05)' },
  swarmBtnText: { color: C.amber, fontSize: 10, fontWeight: '700', fontFamily: MONO, letterSpacing: 2 },
})
