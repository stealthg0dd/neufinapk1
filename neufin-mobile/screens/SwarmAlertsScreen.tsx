/**
 * SwarmAlertsScreen — Bloomberg-style push alert inbox for macro regime shifts.
 *
 * Features:
 *  • Registers for Expo push notifications on first visit
 *  • Subscribes to macro-shift alerts for a hardcoded demo portfolio
 *    (replace DEMO_SYMBOLS with the user's actual holdings once auth is wired)
 *  • Polls the backend for recent alerts and renders them in a terminal-style list
 *  • Colour-codes by regime severity: Inflationary (amber), Disinflationary (green), Unknown (grey)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { subscribeToSwarmAlerts, fetchRecentAlerts } from '@/lib/notifications'
import type { MacroAlert } from '@/lib/notifications'

// ── Demo portfolio (swap for user session data) ───────────────────────────────
const DEMO_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'XOM', 'BRK-B']

// ── Colour palette (Bloomberg terminal) ──────────────────────────────────────
const C = {
  bg:       '#080808',
  surface:  '#0D0D0D',
  border:   '#1E1E1E',
  header:   '#141414',
  amber:    '#FFB900',
  green:    '#00FF00',
  red:      '#FF4444',
  blue:     '#60A5FA',
  dimText:  '#555555',
  midText:  '#888888',
  bodyText: '#C8C8C8',
  white:    '#FFFFFF',
}

// ── Regime → colour mapping ───────────────────────────────────────────────────
function regimeColor(regime: string): string {
  const r = regime.toLowerCase()
  if (r.includes('inflation'))    return C.amber
  if (r.includes('disinflation')) return C.green
  if (r.includes('target'))       return C.green
  if (r.includes('elevated'))     return C.amber
  if (r.includes('high'))         return C.red
  return C.midText
}

// ── Individual alert card ─────────────────────────────────────────────────────
function AlertCard({ alert }: { alert: MacroAlert }) {
  const color   = regimeColor(alert.regime)
  const dateStr = new Date(alert.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const affected = alert.affected_symbols?.join(', ') || '—'

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      {/* Top row: regime badge + timestamp */}
      <View style={styles.cardHeader}>
        <View style={[styles.regimePill, { borderColor: color + '60' }]}>
          <View style={[styles.regimeDot, { backgroundColor: color }]} />
          <Text style={[styles.regimeText, { color }]}>{alert.regime.toUpperCase()}</Text>
        </View>
        <Text style={styles.timestamp}>{dateStr}</Text>
      </View>

      {/* Title */}
      <Text style={styles.alertTitle}>{alert.title}</Text>

      {/* Body */}
      <Text style={styles.alertBody}>{alert.body}</Text>

      {/* Metrics row */}
      <View style={styles.metaRow}>
        <MetaBadge label="CPI YoY" value={alert.cpi_yoy} color={color} />
        <MetaBadge label="Portfolio impact" value={affected} color={C.blue} />
      </View>
    </View>
  )
}

function MetaBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metaBadge}>
      <Text style={styles.metaLabel}>{label.toUpperCase()}: </Text>
      <Text style={[styles.metaValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ subscribed }: { subscribed: boolean }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>◈</Text>
      <Text style={styles.emptyTitle}>
        {subscribed ? 'No Alerts Yet' : 'Not Subscribed'}
      </Text>
      <Text style={styles.emptyBody}>
        {subscribed
          ? 'You will be notified when the Strategist Agent detects a macro regime shift affecting your holdings.'
          : 'Subscribe to receive push alerts when the FRED CPI data triggers a regime change.'}
      </Text>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SwarmAlertsScreen() {
  const [alerts,     setAlerts]     = useState<MacroAlert[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [subLoading, setSubLoading] = useState(false)
  const [subStatus,  setSubStatus]  = useState<'idle' | 'ok' | 'error'>('idle')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadAlerts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const data = await fetchRecentAlerts(30)
    setAlerts(data)
    if (!silent) setLoading(false)
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadAlerts(true)
    setRefreshing(false)
  }, [loadAlerts])

  const handleSubscribe = async () => {
    setSubLoading(true)
    const ok = await subscribeToSwarmAlerts(DEMO_SYMBOLS, 'Neufin Mobile User')
    setSubscribed(ok)
    setSubStatus(ok ? 'ok' : 'error')
    setSubLoading(false)
    if (ok) loadAlerts()
  }

  useEffect(() => {
    loadAlerts()
    // Poll every 60 s for new alerts while the screen is active
    pollRef.current = setInterval(() => loadAlerts(true), 60_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadAlerts])

  return (
    <View style={styles.root}>
      {/* ── Nav bar ── */}
      <View style={styles.nav}>
        <Text style={styles.navBrand}>NEUFIN</Text>
        <Text style={styles.navSep}>/</Text>
        <Text style={styles.navTitle}>SWARM ALERTS</Text>

        <TouchableOpacity
          style={[
            styles.subButton,
            subscribed && styles.subButtonActive,
          ]}
          onPress={handleSubscribe}
          disabled={subLoading || subscribed}
          activeOpacity={0.7}
        >
          {subLoading
            ? <ActivityIndicator size="small" color={C.amber} />
            : <Text style={[styles.subButtonText, subscribed && { color: C.green }]}>
                {subscribed ? '● LIVE' : '▶ SUBSCRIBE'}
              </Text>
          }
        </TouchableOpacity>
      </View>

      {/* ── Status strip ── */}
      <View style={styles.statusStrip}>
        <StatusChip label="ORCHESTRATOR" value="LANGGRAPH" color={C.green} />
        <StatusChip label="FRED" value="CPIAUCSL" color={C.green} />
        <StatusChip label="ALERTS" value={`${alerts.length}`} color={C.amber} />
        <StatusChip
          label="PUSH"
          value={subscribed ? 'ACTIVE' : 'OFF'}
          color={subscribed ? C.green : C.dimText}
        />
      </View>

      {/* ── Subscription error ── */}
      {subStatus === 'error' && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            ⚠ Subscription failed — check notification permissions in Settings.
          </Text>
        </View>
      )}

      {/* ── Alert list ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.amber} />
          <Text style={styles.loadingText}>Fetching macro alerts...</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <AlertCard alert={item} />}
          contentContainerStyle={alerts.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={<EmptyState subscribed={subscribed} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.amber}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Alerts trigger when FRED CPI YoY crosses regime thresholds (3%, 5%)
        </Text>
        <Text style={styles.footerPowered}>Powered by LangGraph · Neufin Swarm v1</Text>
      </View>
    </View>
  )
}

function StatusChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}: </Text>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  nav: {
    height: 48,
    backgroundColor: '#0D0D0D',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  navBrand:  { color: C.amber, fontWeight: '700', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 2 },
  navSep:    { color: C.dimText, fontSize: 11 },
  navTitle:  { color: C.dimText, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 2, flex: 1 },

  subButton: {
    borderWidth: 1,
    borderColor: C.amber,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 90,
    alignItems: 'center',
  },
  subButtonActive: { borderColor: C.green },
  subButtonText:   { color: C.amber, fontSize: 10, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1 },

  statusStrip: {
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 16,
    flexWrap: 'wrap',
  },
  chip:       { flexDirection: 'row' },
  chipLabel:  { color: C.dimText, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', textTransform: 'uppercase', letterSpacing: 1 },
  chipValue:  { fontSize: 9, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', textTransform: 'uppercase', letterSpacing: 1 },

  errorBanner: { backgroundColor: '#1a0000', borderBottomWidth: 1, borderBottomColor: '#550000', padding: 10 },
  errorText:   { color: C.red, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },

  listContent: { padding: 12, gap: 8 },
  listEmpty:   { flex: 1 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    padding: 12,
    gap: 6,
  },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  regimePill:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  regimeDot:    { width: 5, height: 5, borderRadius: 3 },
  regimeText:   { fontSize: 9, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1 },
  timestamp:    { color: C.dimText, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  alertTitle:   { color: C.white, fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  alertBody:    { color: C.bodyText, fontSize: 11, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  metaRow:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 2 },
  metaBadge:    { flexDirection: 'row' },
  metaLabel:    { color: C.dimText, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  metaValue:    { fontSize: 9, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },

  separator: { height: 8 },

  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: C.amber, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon:      { fontSize: 48, color: '#222' },
  emptyTitle:     { color: C.midText, fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 2, textTransform: 'uppercase' },
  emptyBody:      { color: '#333', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', textAlign: 'center', lineHeight: 18 },

  footer: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 2,
  },
  footerText:    { color: '#333', fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  footerPowered: { color: '#222', fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', textTransform: 'uppercase', letterSpacing: 1 },
})
