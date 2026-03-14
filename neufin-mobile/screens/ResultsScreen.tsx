import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { BarChart } from 'react-native-chart-kit'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RouteProp } from '@react-navigation/native'
import ProgressCircle from '@/components/ProgressCircle'
import type { RootStackParamList } from '@/App'

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Results'>
  route: RouteProp<RootStackParamList, 'Results'>
}

const TYPE_COLOR: Record<string, string> = {
  'Diversified Strategist': '#3b82f6',
  'Conviction Growth': '#8b5cf6',
  'Momentum Trader': '#f59e0b',
  'Defensive Allocator': '#22c55e',
  'Speculative Investor': '#ef4444',
}

const { width } = Dimensions.get('window')
const API = 'https://neufin-api.railway.app'

export default function ResultsScreen({ navigation, route }: Props) {
  const { result } = route.params
  const typeColor = TYPE_COLOR[result.investor_type] ?? '#3b82f6'
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const [reportUrl, setReportUrl] = useState<string | null>(null)

  const topPositions = [...result.positions]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)

  const chartData = {
    labels: topPositions.map((p) => p.symbol),
    datasets: [{ data: topPositions.map((p) => parseFloat(p.weight.toFixed(1))) }],
  }

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
          cancel_url: 'neufin://payment-cancel',
        }),
      })
      const data = await res.json()
      if (!data.checkout_url) throw new Error('No checkout URL')

      // Open Stripe Checkout in in-app browser, redirect back via deep link
      const browserResult = await WebBrowser.openAuthSessionAsync(
        data.checkout_url,
        'neufin://payment-success'
      )

      if (
        browserResult.type === 'success' &&
        browserResult.url?.startsWith('neufin://payment-success')
      ) {
        if (data.report_id) {
          const fulfillRes = await fetch(
            `${API}/api/reports/fulfill?report_id=${data.report_id}`
          )
          if (fulfillRes.ok) {
            const fulfillData = await fulfillRes.json()
            setReportUrl(fulfillData.pdf_url)
            setIsPremium(true)
          }
        }
      }
    } catch (e) {
      console.error('Checkout failed', e)
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleOpenReport = async () => {
    if (!reportUrl) return
    await WebBrowser.openBrowserAsync(reportUrl)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Score hero */}
      <View style={styles.heroCard}>
        <ProgressCircle score={result.dna_score} size={160} />

        {isPremium && (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumText}>⭐ PREMIUM</Text>
          </View>
        )}

        <View style={[styles.typeBadge, { borderColor: typeColor }]}>
          <Text style={[styles.typeText, { color: typeColor }]}>{result.investor_type}</Text>
        </View>
        <Text style={styles.portfolioMeta}>
          ${result.total_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          {'  ·  '}{result.num_positions} positions
        </Text>
      </View>

      {/* Position allocation bar chart */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Top Holdings (% weight)</Text>
        <BarChart
          data={chartData}
          width={width - 64}
          height={200}
          yAxisLabel=""
          yAxisSuffix="%"
          chartConfig={{
            backgroundColor: 'transparent',
            backgroundGradientFrom: '#111827',
            backgroundGradientTo: '#111827',
            decimalPlaces: 1,
            color: () => typeColor,
            labelColor: () => '#6b7280',
            barPercentage: 0.7,
            propsForLabels: { fontSize: 11 },
          }}
          style={{ borderRadius: 8, marginTop: 8 }}
          showValuesOnTopOfBars
        />
      </View>

      {/* Strengths */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { color: '#22c55e' }]}>💪 Strengths</Text>
        {result.strengths.map((s, i) => (
          <View key={i} style={styles.listRow}>
            <Text style={styles.listCheck}>✓</Text>
            <Text style={styles.listText}>{s}</Text>
          </View>
        ))}
      </View>

      {/* Weaknesses */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { color: '#f59e0b' }]}>⚠️ Watch out</Text>
        {result.weaknesses.map((w, i) => (
          <View key={i} style={styles.listRow}>
            <Text style={[styles.listCheck, { color: '#f59e0b' }]}>!</Text>
            <Text style={styles.listText}>{w}</Text>
          </View>
        ))}
      </View>

      {/* Recommendation */}
      <View style={[styles.card, { borderColor: `${typeColor}40` }]}>
        <Text style={[styles.sectionTitle, { color: typeColor }]}>🎯 Recommendation</Text>
        <Text style={styles.recommendation}>{result.recommendation}</Text>
      </View>

      {/* Professional Report CTA — locked behind payment */}
      {reportUrl ? (
        <TouchableOpacity
          style={[styles.reportBtn, { backgroundColor: '#16a34a' }]}
          onPress={handleOpenReport}
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

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: typeColor }]}
        onPress={() => navigation.navigate('Share', { result })}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Share My DNA Score →</Text>
      </TouchableOpacity>

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
  content: { padding: 20, paddingBottom: 48 },
  heroCard: {
    backgroundColor: '#0d1117',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
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
  premiumText: { color: '#f59e0b', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  typeBadge: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  typeText: { fontSize: 14, fontWeight: '700' },
  portfolioMeta: { color: '#6b7280', fontSize: 13, marginTop: 10 },
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
  listRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  listCheck: { color: '#22c55e', fontSize: 14, fontWeight: '700', marginTop: 1 },
  listText: { color: '#d1d5db', fontSize: 14, lineHeight: 20, flex: 1 },
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
  reportBtnSub: { color: '#93c5fd', fontSize: 12, marginTop: 3 },
  primaryBtn: {
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
})
