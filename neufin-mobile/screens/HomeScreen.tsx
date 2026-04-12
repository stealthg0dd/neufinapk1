import React, { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { Bell, BookOpen, ChevronRight, CircleAlert, Upload, Zap } from 'lucide-react-native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { getPortfolioList, getRecentAlerts, getResearchNotes, getResearchRegime, type PortfolioSummary, type RecentAlert, type ResearchNoteLite } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'
import type { MainTabParamList, RootStackParamList } from '@/App'
import type { CompositeNavigationProp } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'

type NavProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  StackNavigationProp<RootStackParamList>
>

export default function HomeScreen({ navigation }: { navigation: NavProp }) {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [regime, setRegime] = useState<{ regime: string; confidence: number; updated_at?: string } | null>(null)
  const [alerts, setAlerts] = useState<RecentAlert[]>([])
  const [notes, setNotes] = useState<ResearchNoteLite[]>([])
  const [firstName, setFirstName] = useState('Investor')

  useEffect(() => {
    void (async () => {
      const [{ data: userData }, rg, al, nt] = await Promise.all([
        supabase.auth.getUser(),
        getResearchRegime(),
        getRecentAlerts(3),
        getResearchNotes(3),
      ])
      const email = userData.user?.email ?? ''
      setFirstName(email ? email.split('@')[0].replace(/[._-]/g, ' ') : 'Investor')
      setRegime(rg)
      setAlerts(al.slice(0, 3))
      setNotes(nt.slice(0, 3))
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const list = await getPortfolioList(session.access_token)
        setPortfolio(list[0] ?? null)
      }
    })()
  }, [])

  const today = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    []
  )

  const confidencePct = Math.max(0, Math.min(100, Math.round((regime?.confidence ?? 0) * 100)))
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.h1}>Good morning, {firstName}</Text>
            <Text style={s.sub}>{today}</Text>
          </View>
          <View style={s.headerIcons}>
            <TouchableOpacity onPress={() => navigation.navigate('Alerts')}>
              <Bell color={colors.mutedForeground} size={18} />
            </TouchableOpacity>
            <View style={s.avatar}><Text style={s.avatarT}>{firstName.charAt(0).toUpperCase()}</Text></View>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>MARKET REGIME: {(regime?.regime ?? 'UNKNOWN').toUpperCase()}</Text>
          <View style={s.track}><View style={[s.fill, { width: `${confidencePct}%` }]} /></View>
          <Text style={s.sub}>Updated recently · Confidence {confidencePct}%</Text>
        </View>

        <View style={s.card}>
          {portfolio ? (
            <>
              <Text style={s.label}>PORTFOLIO DNA</Text>
              <Text style={s.score}>{portfolio.dna_score ?? 0}<Text style={s.scoreSlash}>/100</Text></Text>
              <Text style={s.sub}>Last analyzed {new Date(portfolio.created_at).toLocaleDateString()}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Swarm')}><Text style={s.link}>Run Swarm →</Text></TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.label}>NO PORTFOLIO CONNECTED</Text>
              <Text style={s.sub}>Analyze My Portfolio to unlock 7-agent intelligence.</Text>
              <TouchableOpacity style={s.primary} onPress={() => navigation.navigate('Portfolio')}>
                <Text style={s.primaryT}>Analyze My Portfolio</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={s.rowHead}><Text style={s.section}>RECENT ALERTS</Text><TouchableOpacity onPress={() => navigation.navigate('Alerts')}><Text style={s.linkSm}>See all →</Text></TouchableOpacity></View>
        <View style={s.card}>
          {alerts.length ? alerts.map((a) => (
            <View key={a.id} style={s.alertRow}>
              <CircleAlert size={14} color={colors.warning} />
              <Text numberOfLines={1} style={s.alertT}>{a.title}</Text>
            </View>
          )) : <Text style={s.sub}>No alerts. We&apos;re watching 40+ signals for you.</Text>}
        </View>

        <View style={s.rowHead}><Text style={s.section}>RESEARCH INTELLIGENCE</Text><TouchableOpacity onPress={() => navigation.navigate('Research')}><Text style={s.linkSm}>View all research →</Text></TouchableOpacity></View>
        {notes.map((n) => (
          <TouchableOpacity key={n.id} style={s.card} onPress={() => navigation.navigate('Research')}>
            <Text style={s.badge}>{(n.note_type ?? 'RESEARCH').replace(/_/g, ' ')}</Text>
            <Text numberOfLines={2} style={s.note}>{n.title}</Text>
          </TouchableOpacity>
        ))}

        <Text style={s.section}>QUICK ACTIONS</Text>
        <View style={s.grid}>
          <Quick title="Upload Portfolio" icon={<Upload size={14} color={colors.primary} />} onPress={() => navigation.navigate('Portfolio')} />
          <Quick title="Run Swarm" icon={<Zap size={14} color={colors.primary} />} onPress={() => navigation.navigate(portfolio ? 'Swarm' : 'Portfolio')} />
          <Quick title="View Leaderboard" icon={<ChevronRight size={14} color={colors.primary} />} onPress={() => WebBrowser.openBrowserAsync('https://neufin-web.vercel.app/leaderboard')} />
          <Quick title="API Docs" icon={<BookOpen size={14} color={colors.primary} />} onPress={() => WebBrowser.openBrowserAsync('https://neufin-web.vercel.app/developer/docs')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Quick({ title, icon, onPress }: { title: string; icon: React.ReactNode; onPress: () => void }) {
  return <TouchableOpacity style={s.quick} onPress={onPress}><View style={s.qi}>{icon}</View><Text style={s.qt}>{title}</Text></TouchableOpacity>
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { color: colors.foreground, fontSize: 22, fontWeight: '700' },
  sub: { color: colors.mutedForeground, fontSize: 12, marginTop: 3 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarT: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  label: { color: colors.primary, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' },
  track: { height: 6, borderRadius: 999, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 999, backgroundColor: colors.primary },
  score: { color: colors.foreground, fontFamily: 'monospace', fontSize: 30, fontWeight: '700' },
  scoreSlash: { color: colors.mutedForeground, fontSize: 15 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  rowHead: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { color: colors.foreground, fontFamily: 'monospace', fontSize: 12, letterSpacing: 1.2 },
  linkSm: { color: colors.primary, fontSize: 12 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  alertT: { color: colors.foreground, fontSize: 13, flex: 1 },
  badge: { alignSelf: 'flex-start', fontSize: 10, color: colors.primary, backgroundColor: `${colors.primary}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  note: { color: colors.foreground, fontSize: 14, fontWeight: '600' },
  primary: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 2 },
  primaryT: { color: colors.background, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quick: { width: '48.5%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  qi: { width: 24, height: 24, borderRadius: 6, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center' },
  qt: { color: colors.foreground, fontSize: 13, fontWeight: '600' },
})
