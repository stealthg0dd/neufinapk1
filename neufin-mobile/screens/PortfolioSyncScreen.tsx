/**
 * PortfolioSyncScreen — Portfolio dashboard.
 * Fetches real portfolios from GET /api/portfolio/list using the Supabase session.
 * Shows skeleton loaders while fetching, empty state with Upload CTA if no
 * portfolios exist, and an error/retry state on network failure.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  RefreshControl,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { PortfolioSummary } from '@/lib/api'
import type { RootStackParamList } from '@/App'
import { getPortfolioList } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { trackMobileEvent } from '@/lib/analytics'

const { width: SCREEN_W } = Dimensions.get('window')
const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace'
const SPRING = { damping: 15, stiffness: 150, mass: 1 }

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

type Props = { navigation: StackNavigationProp<RootStackParamList, 'PortfolioSync'> }

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard({ index }: { index: number }) {
  const opacity = useSharedValue(0.3)
  useEffect(() => {
    const t = setInterval(() => {
      opacity.value = withSpring(opacity.value < 0.6 ? 0.6 : 0.3, { damping: 18, stiffness: 50 })
    }, 700 + index * 120)
    return () => clearInterval(t)
  }, [])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View style={[styles.skelCard, animStyle]}>
      <View style={[styles.skelLine, { width: '60%', height: 14, marginBottom: 12 }]} />
      <View style={styles.skelMetrics}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skelLine, { flex: 1, height: 36, borderRadius: 6 }]} />
        ))}
      </View>
      <View style={[styles.skelLine, { width: '100%', height: 3, marginTop: 8 }]} />
    </Animated.View>
  )
}

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

  const sc    = portfolio.dna_score ?? 0
  const color = sc >= 70 ? C.green : sc >= 45 ? C.amber : C.red
  const label = sc >= 70 ? 'STRONG' : sc >= 45 ? 'MODERATE' : 'HIGH RISK'

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          onPress()
        }}
        activeOpacity={0.85}
      >
        <BlurView intensity={18} tint="dark" style={styles.card}>
          <View style={[styles.cardGlowBorder, { borderColor: color + '30' }]} />

          <View style={styles.cardHeader}>
            <Text style={styles.portfolioName} numberOfLines={1}>{portfolio.portfolio_name}</Text>
            <View style={[styles.scorePill, { borderColor: color + '70' }]}>
              <Text style={[styles.scorePillText, { color }]}>
                {sc}<Text style={styles.scorePillSlash}>/100</Text>
              </Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <MetricCell label="VALUE"     value={`$${(portfolio.total_value / 1000).toFixed(1)}K`} color={C.blue} />
            <MetricCell label="POSITIONS" value={String(portfolio.positions_count)}                color={C.bodyText} />
            <MetricCell label="RATING"    value={label}                                            color={color} />
          </View>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${sc}%` as any, backgroundColor: color }]} />
          </View>

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

export default function PortfolioSyncScreen({ navigation }: Props) {
  const [portfolios,  setPortfolios]  = useState<PortfolioSummary[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [authed,      setAuthed]      = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setAuthed(false)
        setPortfolios([])
        return
      }
      setAuthed(true)
      const list = await getPortfolioList(session.access_token)
      setPortfolios(list)
      trackMobileEvent('portfolio_synced', { portfolio_count: list.length })
    } catch (err: any) {
      console.error('[PortfolioSync] load error:', err?.message)
      setError('Could not load portfolios. Pull down to retry.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load(true) }

  const openPortfolio = (p: PortfolioSummary) => {
    navigation.navigate('Analysis', { portfolio: p })
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.root}>
        <NavBar />
        <ScrollView contentContainerStyle={styles.list}>
          <View style={[styles.skelLine, { width: '50%', height: 10, marginBottom: 12 }]} />
          {[0, 1, 2].map((i) => <SkeletonCard key={i} index={i} />)}
        </ScrollView>
      </View>
    )
  }

  // ── Unauthenticated empty state ────────────────────────────────────────────
  if (!authed) {
    return (
      <View style={styles.root}>
        <NavBar />
        <View style={styles.emptyState}>
          <Text style={styles.emptyHeading}>Sign in to view portfolios</Text>
          <Text style={styles.emptySub}>
            Sign in on neufin.app to sync your portfolios here.
          </Text>
        </View>
      </View>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.root}>
        <NavBar />
        <ScrollView
          contentContainerStyle={styles.emptyState}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
        >
          <Text style={styles.emptyHeading}>Failed to load</Text>
          <Text style={styles.emptySub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.8}>
            <Text style={styles.retryText}>↺ RETRY</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // ── No portfolios yet ──────────────────────────────────────────────────────
  if (portfolios.length === 0) {
    return (
      <View style={styles.root}>
        <NavBar />
        <ScrollView
          contentContainerStyle={styles.emptyState}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
        >
          <Text style={styles.emptyHeading}>No portfolios yet</Text>
          <Text style={styles.emptySub}>
            Upload a portfolio CSV on neufin.app to generate your Investor DNA score.
          </Text>
          <View style={styles.uploadHint}>
            <Text style={styles.uploadHintText}>↗ UPLOAD AT NEUFIN.APP</Text>
          </View>
        </ScrollView>
      </View>
    )
  }

  // ── Portfolio list ─────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <NavBar />
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
      >
        <Text style={styles.sectionLabel}>
          {portfolios.length} PORTFOLIO{portfolios.length !== 1 ? 'S' : ''}
        </Text>

        {portfolios.map((p, i) => (
          <PortfolioCard
            key={p.portfolio_id}
            portfolio={p}
            index={i}
            onPress={() => openPortfolio(p)}
          />
        ))}

        <TouchableOpacity
          style={styles.swarmBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            navigation.navigate('SwarmAlerts')
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.swarmBtnText}>▶ SWARM ALERTS & MACRO REPORTS</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function NavBar() {
  return (
    <View style={styles.nav}>
      <Text style={styles.navBrand}>NEUFIN</Text>
      <Text style={styles.navSep}>/</Text>
      <Text style={styles.navTitle}>PORTFOLIO DASHBOARD</Text>
      <View style={[styles.statusDot, { backgroundColor: C.green }]} />
    </View>
  )
}

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

  list: { padding: 16, gap: 12 },

  sectionLabel: {
    color: C.dimText, fontSize: 9, fontFamily: MONO,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
  },

  card: {
    borderRadius: 12, overflow: 'hidden',
    padding: 14, gap: 10,
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
  metricCell: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 8 },
  metricLabel:{ color: C.dimText, fontSize: 8, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  metricValue:{ fontSize: 11, fontWeight: '700', fontFamily: MONO },

  barTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  barFill:  { height: 3, borderRadius: 2 },

  cardFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastUpdated: { color: C.dimText, fontSize: 9, fontFamily: MONO },
  viewLink:    { fontSize: 9, fontWeight: '700', fontFamily: MONO, letterSpacing: 1 },

  swarmBtn:     { marginTop: 8, borderWidth: 1, borderColor: C.amber + '40', borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,185,0,0.05)' },
  swarmBtnText: { color: C.amber, fontSize: 10, fontWeight: '700', fontFamily: MONO, letterSpacing: 2 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyHeading: { color: C.white, fontSize: 15, fontWeight: '700', fontFamily: MONO, letterSpacing: 1, textAlign: 'center' },
  emptySub:     { color: C.dimText, fontSize: 11, fontFamily: MONO, lineHeight: 17, textAlign: 'center' },
  retryBtn:     { marginTop: 8, borderWidth: 1, borderColor: C.amber + '80', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 4 },
  retryText:    { color: C.amber, fontSize: 11, fontFamily: MONO, fontWeight: '700', letterSpacing: 2 },
  uploadHint:   { marginTop: 8, borderWidth: 1, borderColor: C.blue + '60', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 4, backgroundColor: 'rgba(96,165,250,0.07)' },
  uploadHintText: { color: C.blue, fontSize: 10, fontFamily: MONO, fontWeight: '700', letterSpacing: 2 },

  skelCard:    { backgroundColor: 'rgba(30,41,59,0.4)', borderRadius: 12, padding: 14, gap: 8 },
  skelMetrics: { flexDirection: 'row', gap: 6 },
  skelLine:    { backgroundColor: 'rgba(100,116,139,0.25)', borderRadius: 4 },
})
