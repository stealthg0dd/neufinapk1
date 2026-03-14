import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import type { StackNavigationProp } from '@react-navigation/stack'
import { analyzeDNA } from '@/lib/api'
import type { RootStackParamList } from '@/App'

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Upload'>
}

const SAMPLE_CSV = `symbol,shares,cost_basis
AAPL,10,145.50
MSFT,5,280.00
GOOGL,3,130.00
NVDA,8,420.00`

export default function UploadScreen({ navigation }: Props) {
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/comma-separated-values',
        copyToCacheDirectory: true,
      })
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        if (!asset.name.endsWith('.csv')) {
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
    try {
      const result = await analyzeDNA(file.uri, file.name)
      navigation.navigate('Results', { result })
    } catch (e: unknown) {
      Alert.alert('Analysis failed', e instanceof Error ? e.message : 'Please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Neufin 🧬</Text>
        <Text style={styles.title}>Discover Your{'\n'}Investor DNA</Text>
        <Text style={styles.subtitle}>Upload your portfolio CSV for an AI-powered behavioral analysis</Text>
      </View>

      {/* Drop zone */}
      <TouchableOpacity
        style={[styles.dropZone, file && styles.dropZoneActive]}
        onPress={pickFile}
        activeOpacity={0.7}
      >
        <Text style={styles.dropIcon}>{file ? '✅' : '📂'}</Text>
        {file ? (
          <>
            <Text style={styles.fileName}>{file.name}</Text>
            <Text style={styles.fileReady}>Ready to analyze</Text>
          </>
        ) : (
          <>
            <Text style={styles.dropText}>Tap to select CSV</Text>
            <Text style={styles.dropHint}>symbol, shares, cost_basis</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Analyze button */}
      <TouchableOpacity
        style={[styles.analyzeBtn, (!file || loading) && styles.analyzeBtnDisabled]}
        onPress={handleAnalyze}
        disabled={!file || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.analyzeBtnText}>  Analyzing with AI…</Text>
          </View>
        ) : (
          <Text style={styles.analyzeBtnText}>Analyze My Portfolio →</Text>
        )}
      </TouchableOpacity>

      {/* Sample format */}
      <View style={styles.sampleBox}>
        <Text style={styles.sampleTitle}>Expected CSV format:</Text>
        <Text style={styles.sampleCode}>{SAMPLE_CSV}</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  content: { padding: 24, paddingBottom: 48 },
  header: { marginBottom: 32, marginTop: 16 },
  logo: { fontSize: 16, fontWeight: '700', color: '#3b82f6', marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', color: '#f1f5f9', lineHeight: 40, marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#6b7280', lineHeight: 22 },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#374151',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#0d1117',
  },
  dropZoneActive: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  dropIcon: { fontSize: 36, marginBottom: 12 },
  dropText: { fontSize: 16, fontWeight: '600', color: '#d1d5db' },
  dropHint: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  fileName: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  fileReady: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  analyzeBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  analyzeBtnDisabled: { opacity: 0.45 },
  analyzeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  sampleBox: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sampleTitle: { fontSize: 12, color: '#9ca3af', fontWeight: '600', marginBottom: 8 },
  sampleCode: { fontSize: 11, color: '#6b7280', fontFamily: 'monospace', lineHeight: 18 },
})
