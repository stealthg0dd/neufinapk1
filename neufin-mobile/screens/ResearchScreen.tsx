/**
 * ResearchScreen — shows NeuFin's live market intelligence layer.
 *
 * Public data (regime + is_public notes) loads without auth.
 * Unauthenticated users see a sign-up prompt to unlock full research.
 * "Read Full Research" opens the full note on the web via expo-web-browser.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import type { StackNavigationProp } from '@react-navigation/stack'
import { supabase } from '@/lib/supabase'
import type { RootStackParamList } from '@/App'

type Props = { navigation: StackNavigationProp<RootStackParamList, 'Research'> }

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://neufin101-production.up.railway.app'
const WEB = 'https://neufin.sg'

interface MarketRegime {
  regime: string
  confidence: number
  started_at: string
  supporting_signals?: Record<string, unknown>
}

interface ResearchNote {
  id: string
  title: string
  executive_summary: string
  regime?: string
  time_horizon?: string
  confidence_score?: number
  generated_at: string
  is_public: boolean
  affected_sectors?: string[]
}

const REGIME_COLORS: Record<string, string> = {
  risk_on:       '#22c55e',
  risk_off:      '#ef4444',
  stagflation:   '#f97316',
  recovery:      '#3b82f6',
  recession_risk: '#dc2626',
}
const REGIME_LABELS: Record<string, string> = {
  risk_on:       '🟢 Risk-On',
  risk_off:      '🔴 Risk-Off',
  stagflation:   '🟠 Stagflation',
  recovery:      '🔵 Recovery',
  recession_risk: '🔴 Recession Risk',
}

export default function ResearchScreen({ navigation }: Props) {
  const [regime, setRegime]       = useState<MarketRegime | null>(null)
  const [notes, setNotes]         = useState<ResearchNote[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [isAuthed, setIsAuthed]   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthed(!!session)
    })
    loadData()
  }, [])

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const [regimeRes, notesRes] = await Promise.all([
        fetch(`${API}/api/research/regime`),
        fetch(`${API}/api/research/notes?per_page=3`),
      ])

      if (regimeRes.ok) {
        const data = await regimeRes.json()
        setRegime(data.current_regime ?? data)
      }

      if (notesRes.ok) {
        const data = await notesRes.json()
        setNotes(data.notes ?? data ?? [])
      }
    } catch (e) {
      setError('Unable to load research data. Check your connection.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  async function openNote(note: ResearchNote) {
    if (!isAuthed) {
      navigation.navigate('Login' as any)
      return
    }
    await WebBrowser.openBrowserAsync(`${WEB}/research/${note.id}?source=mobile`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      toolbarColor: '#0F172A',
    })
  }

  async function openAllResearch() {
    await WebBrowser.openBrowserAsync(`${WEB}/research?source=mobile`, {
      toolbarColor: '#0F172A',
    })
  }

  if (loading) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={s.dim}>Loading market intelligence…</Text>
      </View>
    )
  }

  const regimeColor = regime ? (REGIME_COLORS[regime.regime] ?? '#64748B') : '#64748B'
  const regimeLabel = regime ? (REGIME_LABELS[regime.regime] ?? regime.regime) : 'Unknown'

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData() }}
            tintColor="#8b5cf6"
          />
        }
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.title}>Market Intelligence</Text>
          <Text style={s.subtitle}>
            Macro signals, regime detection, and institutional-grade research.
          </Text>
        </View>

        {error && (
          <View style={s.errorCard}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadData}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Current regime */}
        {regime && (
          <View style={[s.regimeCard, { borderColor: regimeColor + '60' }]}>
            <Text style={s.regimeLabel}>Current Market Regime</Text>
            <View style={s.regimeRow}>
              <Text style={[s.regimeName, { color: regimeColor }]}>{regimeLabel}</Text>
              <View style={[s.confidencePill, { backgroundColor: regimeColor + '20' }]}>
                <Text style={[s.confidenceText, { color: regimeColor }]}>
                  {Math.round((regime.confidence ?? 0) * 100)}% confidence
                </Text>
              </View>
            </View>
            {regime.started_at && (
              <Text style={s.dim}>
                Since {new Date(regime.started_at).toLocaleDateString('en-SG', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>
        )}

        {/* Auth gate notice for non-logged-in users */}
        {!isAuthed && (
          <View style={s.gateCard}>
            <Text style={s.gateTitle}>🔒 Sign in to unlock full research</Text>
            <Text style={s.gateSubtitle}>
              Free accounts get 3 DNA analyses and access to all public research notes.
            </Text>
            <TouchableOpacity
              style={s.gateBtn}
              onPress={() => navigation.navigate('Login' as any)}
            >
              <Text style={s.gateBtnText}>Sign Up Free</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Research notes */}
        <Text style={s.sectionTitle}>Latest Research Notes</Text>

        {notes.length === 0 && !error && (
          <View style={s.emptyState}>
            <Text style={s.dim}>No research notes available yet.</Text>
          </View>
        )}

        {notes.map((note) => (
          <TouchableOpacity
            key={note.id}
            style={s.noteCard}
            onPress={() => openNote(note)}
            activeOpacity={0.8}
          >
            <View style={s.noteHeader}>
              {note.regime && (
                <View style={[s.noteBadge, { backgroundColor: (REGIME_COLORS[note.regime] ?? '#64748B') + '20' }]}>
                  <Text style={[s.noteBadgeText, { color: REGIME_COLORS[note.regime] ?? '#64748B' }]}>
                    {note.regime.replace('_', ' ')}
                  </Text>
                </View>
              )}
              {note.time_horizon && (
                <View style={s.horizonBadge}>
                  <Text style={s.horizonText}>{note.time_horizon.replace('_', ' ')}</Text>
                </View>
              )}
            </View>

            <Text style={s.noteTitle}>{note.title}</Text>
            <Text style={s.noteSummary} numberOfLines={3}>{note.executive_summary}</Text>

            {note.affected_sectors && note.affected_sectors.length > 0 && (
              <View style={s.sectorRow}>
                {note.affected_sectors.slice(0, 3).map((sec) => (
                  <View key={sec} style={s.sectorPill}>
                    <Text style={s.sectorText}>{sec}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.noteFooter}>
              <Text style={s.noteDate}>
                {new Date(note.generated_at).toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })}
              </Text>
              <Text style={s.readMore}>
                {isAuthed ? 'Read full note →' : '🔒 Sign in to read →'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* CTA */}
        <TouchableOpacity style={s.allResearchBtn} onPress={openAllResearch}>
          <Text style={s.allResearchText}>View All Research on NeuFin →</Text>
        </TouchableOpacity>

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            NeuFin provides financial data and analysis tools. This is not financial advice.
            Past performance does not indicate future results.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const C = {
  bg:      '#0F172A',
  surface: '#1E293B',
  border:  '#334155',
  text:    '#F1F5F9',
  dim:     '#64748B',
  purple:  '#8b5cf6',
  white:   '#FFFFFF',
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { alignItems: 'center', justifyContent: 'center', gap: 12 },
  scroll:      { padding: 20, paddingBottom: 48 },
  header:      { marginBottom: 20 },
  backBtn:     { marginBottom: 16 },
  backText:    { color: C.dim, fontSize: 14 },
  title:       { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 8 },
  subtitle:    { fontSize: 14, color: C.dim, lineHeight: 20 },
  errorCard:   {
    backgroundColor: '#450a0a40',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ef444440',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText:   { color: '#fca5a5', fontSize: 13, flex: 1 },
  retryText:   { color: C.purple, fontSize: 13, fontWeight: '600' },
  regimeCard:  {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  regimeLabel: { fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  regimeRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  regimeName:  { fontSize: 22, fontWeight: '800' },
  confidencePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  confidenceText: { fontSize: 12, fontWeight: '600' },
  dim:         { color: C.dim, fontSize: 12 },
  gateCard:    {
    backgroundColor: '#1e1b4b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#4338ca40',
    padding: 18,
    marginBottom: 20,
    gap: 8,
  },
  gateTitle:   { fontSize: 15, fontWeight: '700', color: C.text },
  gateSubtitle: { fontSize: 13, color: '#a5b4fc', lineHeight: 18 },
  gateBtn:     {
    backgroundColor: C.purple,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  gateBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 14 },
  emptyState:  { alignItems: 'center', paddingVertical: 32 },
  noteCard:    {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginBottom: 14,
  },
  noteHeader:  { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  noteBadge:   { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  noteBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  horizonBadge: { backgroundColor: '#334155', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  horizonText: { fontSize: 11, color: C.dim, textTransform: 'capitalize' },
  noteTitle:   { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 8, lineHeight: 22 },
  noteSummary: { fontSize: 13, color: '#94a3b8', lineHeight: 19, marginBottom: 12 },
  sectorRow:   { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  sectorPill:  { backgroundColor: '#334155', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sectorText:  { fontSize: 11, color: C.dim },
  noteFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteDate:    { fontSize: 12, color: C.dim },
  readMore:    { fontSize: 12, color: C.purple, fontWeight: '600' },
  allResearchBtn: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  allResearchText: { color: C.purple, fontWeight: '600', fontSize: 14 },
  disclaimer:  {
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  disclaimerText: { fontSize: 11, color: C.dim, lineHeight: 16, textAlign: 'center' },
})
