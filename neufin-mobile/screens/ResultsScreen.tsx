import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Share, ActivityIndicator,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import * as WebBrowser from 'expo-web-browser'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RouteProp } from '@react-navigation/native'
import ProgressCircle from '@/components/ProgressCircle'
import type { RootStackParamList } from '@/App'
import type { Position } from '@/lib/api'

const API = 'https://neufin101-production.up.railway.app'

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Results'>
  route: RouteProp<RootStackParamList, 'Results'>
}

const TYPE_COLOR: Record<string, string> = {
  'Diversified Strategist': '#3b82f6',
  'Conviction Growth':      '#8b5cf6',
  'Momentum Trader':        '#f59e0b',
  'Defensive Allocator':    '#22c55e',
  'Speculative Investor':   '#ef4444',
}

const PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#10b981', '#f43f5e', '#a855f7', '#14b8a6',
  '#fb923c', '#6366f1', '#22d3ee', '#4ade80',
]

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)

// ── SVG Doughnut chart ───────────────────────────────────────────────────────

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function slicePath(
  cx: number, cy: number,
  R: number, r: number,
  startAngle: number, endAngle: number
): string {
  const o1   = polarToXY(cx, cy, R, startAngle)
  const o2   = polarToXY(cx, cy, R, endAngle)
  const i2   = polarToXY(cx, cy, r, endAngle)
  const i1   = polarToXY(cx, cy, r, startAngle)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${R} ${R} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${r} ${r} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ')
}

const GAP = 0.04 // radians between slices

function DoughnutChart({ positions }: { positions: Position[] }) {
  const SIZE = 220
  const cx = SIZE / 2
  const cy = SIZE / 2
  const R  = 92
  const r  = 56

  const sorted = [...positions].sort((a, b) => b.value - a.value)
  const total  = sorted.reduce((s, p) => s + p.value, 0)
  let cursor   = -Math.PI / 2 // start at 12 o'clock

  const slices = sorted.map((p, i) => {
    const span  = (p.value / total) * (2 * Math.PI) - GAP
    const start = cursor + GAP / 2
    const end   = cursor + span + GAP / 2
    cursor     += span + GAP
    return { p, start, end, color: PALETTE[i % PALETTE.length] }
  })

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={SIZE} height={SIZE}>
        {slices.map(({ p, start, end, color }) => (
          <Path
            key={p.symbol}
            d={slicePath(cx, cy, R, r, start, end)}
            fill={color}
          />
        ))}
      </Svg>

      {/* Legend */}
      <View style={styles.legendGrid}>
        {slices.map(({ p, color }) => (
          <View key={p.symbol} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendSymbol}>{p.symbol}</Text>
            <Text style={styles.legendPct}>{p.weight.toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ResultsScreen({ navigation, route }: Props) {
  const { result } = route.params
  const typeColor  = TYPE_COLOR[result.investor_type] ?? '#3b82f6'

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [isPremium,       setIsPremium]       = useState(false)
  const [reportUrl,       setReportUrl]       = useState<string | null>(null)

  // ── Native OS share sheet ──────────────────────────────────────────────────
  const handleShare = async () => {
    const url  = result.share_url || `https://neufin.vercel.app/share/${result.share_token}`
    const text = `I got ${result.dna_score}/100 on my Investor DNA Score 🧬\nI'm a "${result.investor_type}"\n\nSee yours → ${url}`
    try {
      await Share.share({ message: text, url }) // url is iOS-only additional field
    } catch {
      // user cancelled — no-op
    }
  }

  // ── Open share page in in-app browser ─────────────────────────────────────
  const handleViewSharePage = async () => {
    const url = result.share_url || `https://neufin.vercel.app/share/${result.share_token}`
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: '#0d1117',
      controlsColor: '#3b82f6',
    })
  }

  // ── Stripe checkout + report fulfillment ──────────────────────────────────
  const handleGetReport = async () => {
    setCheckoutLoading(true)
    try {
      const res = await fetch(`${API}/api/reports/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'single',
          positions: result.positions,
          success_url: 'neufin://payment-success',
          cancel_url:  'neufin://payment-cancel',
        }),
      })
      const data = await res.json()
      if (!data.checkout_url) throw new Error('No checkout URL')

      const browserResult = await WebBrowser.openAuthSessionAsync(
        data.checkout_url,
        'neufin://payment-success'
      )

      if (
        browserResult.type === 'success' &&
        browserResult.url?.startsWith('neufin://payment-success') &&
        data.report_id
      ) {
        const fd = await fetch(`${API}/api/reports/fulfill?report_id=${data.report_id}`)
        if (fd.ok) {
          const json = await fd.json()
          setReportUrl(json.pdf_url)
          setIsPremium(true)
        }
      }
    } catch (e) {
      console.error('Checkout failed', e)
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Score hero ─────────────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        <ProgressCircle score={result.dna_score} size={160} />

        {isPremium && (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumText}>⭐ PREMIUM</Text>
          </View>
        )}

        <View style={[styles.typeBadge, { borderColor: typeColor }]}>
          <Text style={[styles.typeText, { color: typeColor }]}>
            {result.investor_type}
          </Text>
        </View>
        <Text style={styles.portfolioMeta}>
          {usd(result.total_value)}{'  ·  '}{result.num_positions} positions
        </Text>

        {result.max_position_pct > 40 && (
          <View style={styles.concentrationBadge}>
            <Text style={styles.concentrationText}>⚠ High concentration risk</Text>
          </View>
        )}
      </View>

      {/* ── Allocation doughnut ────────────────────────────────────────── */}
      {result.positions?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Allocation Overview</Text>
          <DoughnutChart positions={result.positions} />
        </View>
      )}

      {/* ── Strengths ──────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { color: '#22c55e' }]}>💪 Strengths</Text>
        {result.strengths.map((s, i) => (
          <View key={i} style={styles.listRow}>
            <Text style={styles.listCheck}>✓</Text>
            <Text style={styles.listText}>{s}</Text>
          </View>
        ))}
      </View>

      {/* ── Weaknesses ─────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { color: '#f59e0b' }]}>⚠️ Watch out</Text>
        {result.weaknesses.map((w, i) => (
          <View key={i} style={styles.listRow}>
            <Text style={[styles.listCheck, { color: '#f59e0b' }]}>!</Text>
            <Text style={styles.listText}>{w}</Text>
          </View>
        ))}
      </View>

      {/* ── Recommendation ─────────────────────────────────────────────── */}
      <View style={[styles.card, { borderColor: `${typeColor}40` }]}>
        <Text style={[styles.sectionTitle, { color: typeColor }]}>🎯 Recommendation</Text>
        <Text style={styles.recommendation}>{result.recommendation}</Text>
      </View>

      {/* ── Report CTA ─────────────────────────────────────────────────── */}
      {reportUrl ? (
        <TouchableOpacity
          style={[styles.reportBtn, { backgroundColor: '#16a34a' }]}
          onPress={() => WebBrowser.openBrowserAsync(reportUrl!)}
          activeOpacity={0.85}
        >
          <Text style={styles.reportBtnText}>⬇ Open Advisor Report (PDF)</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={handleGetReport}
          disabled={checkoutLoading}
          activeOpacity={0.85}
        >
          {checkoutLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.reportBtnText}>📄 Get Professional Report · $29</Text>
              <Text style={styles.reportBtnSub}>10-page AI advisor PDF · one-time</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* ── Share actions ──────────────────────────────────────────────── */}
      <View style={styles.actionRow}>
        {/* Triggers native OS share sheet */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: typeColor, flex: 2 }]}
          onPress={handleShare}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>🧬 Share My DNA</Text>
        </TouchableOpacity>

        {/* Opens public share page in in-app browser */}
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline, { flex: 1 }]}
          onPress={handleViewSharePage}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnOutlineText}>🔗 View</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate('Upload')}
        activeOpacity={0.85}
      >
        <Text style={styles.secondaryBtnText}>Analyze another portfolio</Text>
      </TouchableOpacity>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  content:   { padding: 20, paddingBottom: 48 },

  heroCard: {
    backgroundColor: '#0d1117',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  premiumBadge: {
    marginTop: 12,
    backgroundColor: '#f59e0b20',
    borderWidth: 1,
    borderColor: '#f59e0b60',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  premiumText:  { color: '#f59e0b', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  typeBadge: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  typeText:     { fontSize: 14, fontWeight: '700' },
  portfolioMeta:{ color: '#6b7280', fontSize: 13, marginTop: 10 },
  concentrationBadge: {
    marginTop: 10,
    backgroundColor: '#78350f20',
    borderWidth: 1,
    borderColor: '#f59e0b50',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  concentrationText: { color: '#f59e0b', fontSize: 11, fontWeight: '600' },

  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  listRow:        { flexDirection: 'row', gap: 8, marginBottom: 8 },
  listCheck:      { color: '#22c55e', fontSize: 14, fontWeight: '700', marginTop: 1 },
  listText:       { color: '#d1d5db', fontSize: 14, lineHeight: 20, flex: 1 },
  recommendation: { color: '#e2e8f0', fontSize: 14, lineHeight: 22 },

  reportBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 64,
    justifyContent: 'center',
  },
  reportBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  reportBtnSub:  { color: '#93c5fd', fontSize: 12, marginTop: 3 },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  actionBtn: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#374151',
  },
  actionBtnOutlineText: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },

  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },

  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 8,
    justifyContent: 'center',
  },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 80 },
  legendDot:    { width: 8, height: 8, borderRadius: 4 },
  legendSymbol: { color: '#f1f5f9', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  legendPct:    { color: '#6b7280', fontSize: 11, marginLeft: 2 },
})
