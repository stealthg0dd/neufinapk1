/**
 * SwarmReportScreen — IC Briefing + agent breakdown cards.
 *
 * Fetches the latest swarm report from the backend.
 * Shows empty state if unauthenticated or no report exists.
 * Displays: IC Briefing, Market Regime, Quant Metrics, Tax Opportunities, Risk Flags.
 * Uses react-native-chart-kit for the beta bar chart.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Markdown from 'react-native-markdown-display'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react-native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { SwarmReport } from '@/lib/api'
import type { RootStackParamList } from '@/App'
import { getLatestSwarmReport } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { trackMobileEvent } from '@/lib/analytics'
import * as Sharing from 'expo-sharing'
import { colors } from '@/lib/theme'

const MONO = 'monospace'

type EmptyReason = 'unauthenticated' | 'no_data' | 'error'
type Props = { navigation: StackNavigationProp<RootStackParamList, 'SwarmReport'> }

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SwarmReportScreen({ navigation }: Props) {
  const [report,     setReport]     = useState<SwarmReport | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [emptyReason, setEmptyReason] = useState<EmptyReason | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setEmptyReason(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setReport(null)
        setEmptyReason('unauthenticated')
        return
      }
      const r = await getLatestSwarmReport(session.access_token)
      if (!r) {
        setReport(null)
        setEmptyReason('no_data')
      } else {
        setReport(r)
        trackMobileEvent('swarm_report_viewed', { report_id: r.swarm_report_id ?? undefined })
      }
    } catch (err) {
      console.error('[SwarmReport] load error:', err)
      setReport(null)
      setEmptyReason('error')
    } finally {
      setLoading(false)
      setRefreshing(false)
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

  const quant = report.quant_analysis ?? {}
  const regime = report.market_regime ?? {}
  const risk = report.risk_sentinel ?? {}
  const topRisks = ((report.top_risks ?? risk.primary_risks ?? []) as string[]).slice(0, 4)

  const traces = useMemo(() => {
    const trace = (report.agent_trace ?? {}) as Record<string, unknown>
    if (Object.keys(trace).length === 0) {
      return [
        ['MARKET REGIME', JSON.stringify(report.market_regime ?? {}, null, 2)],
        ['STRATEGIST', JSON.stringify(report.strategist_intel ?? {}, null, 2)],
        ['QUANT', JSON.stringify(report.quant_analysis ?? {}, null, 2)],
        ['TAX ARCHITECT', JSON.stringify(report.tax_report ?? {}, null, 2)],
        ['RISK SENTINEL', JSON.stringify(report.risk_sentinel ?? {}, null, 2)],
        ['ALPHA SCOUT', JSON.stringify(report.alpha_scout ?? {}, null, 2)],
      ] as Array<[string, string]>
    }
    return Object.entries(trace).map(([k, v]) => [displayName(k), typeof v === 'string' ? v : JSON.stringify(v, null, 2)] as [string, string])
  }, [report])

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.navBack}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>SWARM ANALYSIS</Text>
        <Text style={styles.navChip}>IC GRADE</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
      >
        <Text style={styles.date}>{new Date(report.created_at).toLocaleString()}</Text>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>7 AGENTS COMPLETED</Text>
          {traces.map(([name, body], idx) => {
            const key = `${name}-${idx}`
            const isOpen = !!expanded[key]
            return (
              <TouchableOpacity key={key} onPress={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))} style={styles.traceRow}>
                <View style={styles.traceHead}>
                  <CheckCircle2 color={colors.positive} size={14} />
                  <Text style={styles.traceTitle}>{name}</Text>
                  {isOpen ? <ChevronUp color={colors.mutedForeground} size={14} /> : <ChevronDown color={colors.mutedForeground} size={14} />}
                </View>
                <Text style={styles.tracePreview} numberOfLines={isOpen ? undefined : 1}>{body.replace(/\n/g, ' ')}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>IC BRIEFING</Text>
          <Markdown style={mdStyle}>{report.briefing || '*No briefing generated*'}</Markdown>
        </View>

        <View style={styles.metricRow}>
          <Metric label="Regime" value={(regime.regime ?? report.regime ?? 'N/A').toUpperCase()} />
          <Metric label="Beta" value={quant.weighted_beta != null ? Number(quant.weighted_beta).toFixed(2) : '—'} />
          <Metric label="Sharpe" value={quant.sharpe_ratio != null ? Number(quant.sharpe_ratio).toFixed(2) : '—'} />
          <Metric label="Risk Level" value={(risk.risk_level ?? 'N/A').toUpperCase()} />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>TOP RISKS</Text>
          {topRisks.length ? topRisks.map((r, i) => (
            <View key={`${r}-${i}`} style={styles.riskCard}><Text style={styles.riskText}>{r}</Text></View>
          )) : (
            <Text style={styles.sub}>No top risks in latest report.</Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Upgrade', { trigger: 'report_pdf' })}>
            <Text style={styles.actionText}>Download PDF Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => Sharing.shareAsync('', { dialogTitle: 'Share analysis' }).catch(() => {})}>
            <Text style={styles.actionText}>Share Analysis</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('PortfolioSync')}>
            <Text style={styles.actionText}>Update Portfolio</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

function displayName(key: string): string {
  const m: Record<string, string> = {
    market_regime: 'MARKET REGIME',
    strategist_intel: 'STRATEGIST',
    quant_analysis: 'QUANT',
    tax_report: 'TAX ARCHITECT',
    risk_sentinel: 'RISK SENTINEL',
    alpha_scout: 'ALPHA SCOUT',
    synthesizer: 'SYNTHESIZER',
  }
  return m[key] ?? key.replace(/_/g, ' ').toUpperCase()
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

const C = colors

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  content: { padding: 14, gap: 10, paddingBottom: 30 },
  nav: { height: 48, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  navBack: { color: C.primary, fontFamily: MONO, fontSize: 10 },
  navTitle: { color: C.foreground, fontFamily: MONO, fontSize: 12, letterSpacing: 1, flex: 1 },
  navChip: { color: C.primary, borderWidth: 1, borderColor: `${C.primary}66`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 9, fontFamily: MONO },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadText: { color: C.mutedForeground, fontSize: 12 },
  emptyHeading: { color: C.foreground, fontWeight: '700', fontSize: 15 },
  emptySub: { color: C.mutedForeground, fontSize: 12, textAlign: 'center' },
  retryBtn: { borderWidth: 1, borderColor: `${C.primary}66`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: C.primary, fontFamily: MONO, fontSize: 11 },
  date: { color: C.mutedForeground, fontSize: 11, marginBottom: 2 },
  sectionCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 8 },
  sectionLabel: { color: C.primary, fontFamily: MONO, fontSize: 10, letterSpacing: 1.3 },
  traceRow: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, gap: 4 },
  traceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  traceTitle: { color: C.foreground, fontSize: 12, fontWeight: '600', flex: 1 },
  tracePreview: { color: C.mutedForeground, fontSize: 12, lineHeight: 18 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '48%', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10 },
  metricLabel: { color: C.mutedForeground, fontSize: 10, fontFamily: MONO },
  metricValue: { color: C.foreground, fontSize: 14, fontWeight: '700', marginTop: 4 },
  riskCard: { borderWidth: 1, borderColor: `${C.risk}55`, backgroundColor: `${C.risk}10`, borderRadius: 8, padding: 10 },
  riskText: { color: C.foreground, fontSize: 12 },
  sub: { color: C.mutedForeground, fontSize: 12 },
  actions: { gap: 8, marginTop: 2 },
  actionBtn: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  actionText: { color: C.primary, fontWeight: '700', fontSize: 13 },
})

const mdStyle = {
  body: { color: colors.foreground, fontSize: 13, lineHeight: 20 },
  paragraph: { color: colors.foreground, marginTop: 0, marginBottom: 8 },
  heading1: { color: colors.foreground },
  heading2: { color: colors.foreground },
  strong: { color: colors.foreground, fontWeight: '700' as const },
}
