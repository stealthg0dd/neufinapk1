import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Animated,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import type { StackNavigationProp } from '@react-navigation/stack'
import { analyzeDNA } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { RootStackParamList } from '@/App'

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Upload'>
}

const SAMPLE_CSV = `symbol,shares,cost_basis
AAPL,10,145.50
MSFT,5,280.00
GOOGL,3,130.00
NVDA,8,420.00`

// ── Skeleton shimmer ─────────────────────────────────────────────────────────

function useShimmer() {
  const opacity = useRef(new Animated.Value(0.35)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    ).start()
    return () => opacity.stopAnimation()
  }, [opacity])
  return opacity
}

function ShimmerBar({
  width, height = 12, opacity,
}: {
  width: number | `${number}%`
  height?: number
  opacity: Animated.Value
}) {
  return (
    <Animated.View
      style={{ width, height, borderRadius: 6, backgroundColor: '#1f2937', opacity }}
    />
  )
}

function AnalysisSkeleton() {
  const opacity = useShimmer()
  return (
    <View style={{ paddingTop: 12 }}>
      {/* Hero card skeleton */}
      <View style={styles.skeletonCard}>
        <ShimmerBar width="40%" opacity={opacity} />
        <View style={{ height: 10 }} />
        <ShimmerBar width="65%" height={32} opacity={opacity} />
      </View>

      {/* Stats row skeleton */}
      <View style={[styles.skeletonCard, { flexDirection: 'row', gap: 12 }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, gap: 8 }}>
            <ShimmerBar width="80%" height={10} opacity={opacity} />
            <ShimmerBar width="100%" height={22} opacity={opacity} />
          </View>
        ))}
      </View>

      {/* List card skeleton */}
      <View style={styles.skeletonCard}>
        <ShimmerBar width="30%" opacity={opacity} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <ShimmerBar width={14} height={14} opacity={opacity} />
            <ShimmerBar width="85%" height={10} opacity={opacity} />
          </View>
        ))}
      </View>

      {/* Recommendation card skeleton */}
      <View style={styles.skeletonCard}>
        <ShimmerBar width="35%" opacity={opacity} />
        <View style={{ height: 8 }} />
        <ShimmerBar width="100%" height={10} opacity={opacity} />
        <View style={{ height: 6 }} />
        <ShimmerBar width="80%" height={10} opacity={opacity} />
        <View style={{ height: 6 }} />
        <ShimmerBar width="60%" height={10} opacity={opacity} />
      </View>
    </View>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function UploadScreen({ navigation }: Props) {
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const pickFile = async () => {
    setError('')
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        // Use '*/*' for broadest device/OS compat; validate extension ourselves
        type: '*/*',
        copyToCacheDirectory: true,
      })
      if (!picked.canceled && picked.assets[0]) {
        const asset = picked.assets[0]
        if (!asset.name.toLowerCase().endsWith('.csv')) {
          Alert.alert('Invalid file', 'Please select a .csv file')
          return
        }
        setFile({ uri: asset.uri, name: asset.name })
      }
    } catch {
      Alert.alert('Error', 'Could not open file picker')
    }
  }

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await analyzeDNA(file.uri, file.name, session?.access_token)
      navigation.navigate('Results', { result })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logo}>Neufin 🧬</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color="#3b82f6" size="small" />
            <Text style={styles.loadingTitle}>AI is analyzing your portfolio…</Text>
          </View>
          <Text style={styles.loadingHint}>This usually takes 5–10 seconds</Text>
        </View>
        <AnalysisSkeleton />
      </ScrollView>
    )
  }

  // ── Default state ──────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Neufin 🧬</Text>
        <Text style={styles.title}>Discover Your{'\n'}Investor DNA</Text>
        <Text style={styles.subtitle}>
          Upload your portfolio CSV for an AI-powered behavioral analysis
        </Text>
      </View>

      {/* File picker zone */}
      <TouchableOpacity
        style={[styles.dropZone, !!file && styles.dropZoneActive]}
        onPress={pickFile}
        activeOpacity={0.7}
      >
        <Text style={styles.dropIcon}>{file ? '✅' : '📂'}</Text>
        {file ? (
          <>
            <Text style={styles.fileName}>{file.name}</Text>
            <Text style={styles.fileReady}>Ready to analyze · tap to change</Text>
          </>
        ) : (
          <>
            <Text style={styles.dropText}>Tap to select CSV</Text>
            <Text style={styles.dropHint}>from Files, iCloud, or Google Drive</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Error message */}
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Analyze button */}
      <TouchableOpacity
        style={[styles.analyzeBtn, (!file || loading) && styles.analyzeBtnDisabled]}
        onPress={handleAnalyze}
        disabled={!file || loading}
        activeOpacity={0.8}
      >
        <Text style={styles.analyzeBtnText}>Analyze My Portfolio →</Text>
      </TouchableOpacity>

      {/* How it works */}
      <View style={styles.stepsRow}>
        {[
          { icon: '📂', step: 'Upload CSV' },
          { icon: '🤖', step: 'AI Scans' },
          { icon: '🧬', step: 'Get Score' },
        ].map(({ icon, step }) => (
          <View key={step} style={styles.stepItem}>
            <Text style={styles.stepIcon}>{icon}</Text>
            <Text style={styles.stepLabel}>{step}</Text>
          </View>
        ))}
      </View>

      {/* Format reference */}
      <View style={styles.sampleBox}>
        <Text style={styles.sampleTitle}>Expected CSV format:</Text>
        <Text style={styles.sampleCode}>{SAMPLE_CSV}</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#030712' },
  content:            { padding: 24, paddingBottom: 48 },
  header:             { marginBottom: 32, marginTop: 16 },
  logo:               { fontSize: 16, fontWeight: '700', color: '#3b82f6', marginBottom: 16 },
  title:              { fontSize: 32, fontWeight: '800', color: '#f1f5f9', lineHeight: 40, marginBottom: 10 },
  subtitle:           { fontSize: 14, color: '#6b7280', lineHeight: 22 },
  loadingTitle:       { fontSize: 15, fontWeight: '600', color: '#93c5fd' },
  loadingHint:        { fontSize: 12, color: '#4b5563', marginTop: 6 },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#374151',
    borderRadius: 16,
    padding: 44,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#0d1117',
  },
  dropZoneActive:     { borderColor: '#22c55e', backgroundColor: '#052e16' },
  dropIcon:           { fontSize: 40, marginBottom: 12 },
  dropText:           { fontSize: 16, fontWeight: '600', color: '#d1d5db' },
  dropHint:           { fontSize: 12, color: '#6b7280', marginTop: 4 },
  fileName:           { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  fileReady:          { fontSize: 12, color: '#6b7280', marginTop: 4 },
  errorBox: {
    backgroundColor: '#450a0a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText:          { color: '#fca5a5', fontSize: 13, lineHeight: 18 },
  analyzeBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  analyzeBtnDisabled: { opacity: 0.45 },
  analyzeBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    backgroundColor: '#0d1117',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  stepItem:           { alignItems: 'center', gap: 4 },
  stepIcon:           { fontSize: 22 },
  stepLabel:          { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  sampleBox: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sampleTitle:        { fontSize: 12, color: '#9ca3af', fontWeight: '600', marginBottom: 8 },
  sampleCode:         { fontSize: 11, color: '#6b7280', fontFamily: 'monospace', lineHeight: 18 },
  skeletonCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
})
