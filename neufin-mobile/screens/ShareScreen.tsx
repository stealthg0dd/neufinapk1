import React, { useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Share, Platform,
} from 'react-native'
import ViewShot, { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { RouteProp } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import ProgressCircle from '@/components/ProgressCircle'
import type { RootStackParamList } from '@/App'

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Share'>
  route: RouteProp<RootStackParamList, 'Share'>
}

const TYPE_COLOR: Record<string, string> = {
  'Diversified Strategist': '#3b82f6',
  'Conviction Growth': '#8b5cf6',
  'Momentum Trader': '#f59e0b',
  'Defensive Allocator': '#22c55e',
  'Speculative Investor': '#ef4444',
}

export default function ShareScreen({ navigation, route }: Props) {
  const { result } = route.params
  const cardRef = useRef<ViewShot>(null)
  const [capturing, setCapturing] = useState(false)

  const typeColor = TYPE_COLOR[result.investor_type] ?? '#3b82f6'

  const captureAndShare = async () => {
    setCapturing(true)
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      })

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your Investor DNA',
        })
      } else {
        Alert.alert('Sharing not available', 'Cannot share on this device.')
      }
    } catch (e) {
      Alert.alert('Error', 'Could not capture share card')
    } finally {
      setCapturing(false)
    }
  }

  const shareLink = async () => {
    await Share.share({
      message: `I scored ${result.dna_score}/100 on my Investor DNA 🧬\nI'm a "${result.investor_type}"\n\nDiscover yours → https://neufin.vercel.app`,
      url: 'https://neufin.vercel.app/upload',
    })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Your Share Card</Text>
      <Text style={styles.subheading}>Screenshot or share the card below</Text>

      {/* The share card — wrapped in ViewShot for screenshot */}
      <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
        <View style={[styles.card, { borderColor: `${typeColor}40` }]}>
          {/* Card header */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardBrand}>Neufin 🧬</Text>
            <Text style={styles.cardTag}>Investor DNA</Text>
          </View>

          {/* Score */}
          <View style={styles.scoreRow}>
            <ProgressCircle score={result.dna_score} size={120} strokeWidth={10} />
            <View style={styles.scoreInfo}>
              <Text style={[styles.investorType, { color: typeColor }]}>
                {result.investor_type}
              </Text>
              <Text style={styles.portfolioInfo}>
                ${result.total_value.toLocaleString('en-US', { maximumFractionDigits: 0 })} portfolio
              </Text>
              <Text style={styles.portfolioInfo}>{result.num_positions} positions</Text>
            </View>
          </View>

          {/* Strengths */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TOP STRENGTHS</Text>
            {result.strengths.slice(0, 2).map((s, i) => (
              <Text key={i} style={styles.bulletGreen}>✓  {s}</Text>
            ))}
          </View>

          {/* Recommendation */}
          <View style={[styles.rec, { backgroundColor: `${typeColor}15`, borderColor: `${typeColor}30` }]}>
            <Text style={[styles.recLabel, { color: typeColor }]}>AI RECOMMENDATION</Text>
            <Text style={styles.recText}>{result.recommendation}</Text>
          </View>

          {/* Footer */}
          <Text style={styles.cardFooter}>neufin.vercel.app · Free analysis</Text>
        </View>
      </ViewShot>

      {/* Actions */}
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: typeColor }, capturing && styles.disabled]}
        onPress={captureAndShare}
        disabled={capturing}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>
          {capturing ? 'Capturing…' : '📸 Save & Share Image'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={shareLink}
        activeOpacity={0.85}
      >
        <Text style={styles.secondaryBtnText}>🔗 Share Link</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.outlineBtn}
        onPress={() => navigation.navigate('Upload')}
        activeOpacity={0.85}
      >
        <Text style={styles.outlineBtnText}>Analyze another portfolio</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  content: { padding: 20, paddingBottom: 48 },
  heading: { fontSize: 24, fontWeight: '800', color: '#f1f5f9', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 24 },

  card: {
    backgroundColor: '#0d1117',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    marginBottom: 24,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  cardBrand: { fontSize: 16, fontWeight: '800', color: '#3b82f6' },
  cardTag: { fontSize: 12, color: '#6b7280', fontWeight: '600' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 20 },
  scoreInfo: { flex: 1 },
  investorType: { fontSize: 18, fontWeight: '800', lineHeight: 24, marginBottom: 6 },
  portfolioInfo: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 10,
    color: '#4b5563',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  bulletGreen: { fontSize: 13, color: '#d1d5db', marginBottom: 4, lineHeight: 20 },

  rec: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  recLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  recText: { fontSize: 13, color: '#e2e8f0', lineHeight: 20 },

  cardFooter: {
    fontSize: 11,
    color: '#374151',
    textAlign: 'center',
    marginTop: 4,
  },

  primaryBtn: { borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  secondaryBtn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: { color: '#93c5fd', fontSize: 15, fontWeight: '600' },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  outlineBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
})
