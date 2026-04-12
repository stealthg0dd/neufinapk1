import React, { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getRecentAlerts, type RecentAlert } from '@/lib/api'
import { colors } from '@/lib/theme'

type Filter = 'All' | 'Regime' | 'Portfolio' | 'Research'

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<RecentAlert[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('All')

  useEffect(() => {
    void getRecentAlerts(30).then(setAlerts)
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'All') return alerts
    return alerts.filter((a) => (a.type ?? '').toLowerCase().includes(filter.toLowerCase()))
  }, [alerts, filter])

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.head}>
          <Text style={s.h1}>ALERTS</Text>
          <View style={s.badge}><Text style={s.badgeT}>{filtered.length}</Text></View>
        </View>
        <View style={s.tabs}>
          {(['All', 'Regime', 'Portfolio', 'Research'] as Filter[]).map((t) => (
            <TouchableOpacity key={t} style={[s.tab, filter === t && s.tabActive]} onPress={() => setFilter(t)}>
              <Text style={[s.tabT, filter === t && s.tabTA]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyT}>Your AI agents are monitoring 40+ signals. Alerts will appear here when something needs your attention.</Text>
          </View>
        ) : (
          filtered.map((a) => {
            const isOpen = expanded === a.id
            const type = (a.type ?? 'general').toLowerCase()
            const leftColor = type.includes('regime') ? colors.warning : type.includes('research') ? colors.accent : colors.primary
            return (
              <TouchableOpacity key={a.id} style={[s.card, { borderLeftColor: leftColor }]} onPress={() => setExpanded(isOpen ? null : a.id)}>
                <View style={s.row}>
                  <Text style={s.type}>{(a.type ?? 'alert').toUpperCase()}</Text>
                  <Text style={s.time}>{timeAgo(a.timestamp)}</Text>
                </View>
                <Text style={s.title}>{a.title}</Text>
                <Text numberOfLines={isOpen ? undefined : 2} style={s.body}>{a.body}</Text>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function timeAgo(ts: string) {
  const d = Date.now() - new Date(ts).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wrap: { padding: 16, gap: 10, paddingBottom: 30 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { color: colors.foreground, fontFamily: 'monospace', fontSize: 18, letterSpacing: 1.5 },
  badge: { minWidth: 24, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: `${colors.primary}20`, alignItems: 'center', justifyContent: 'center' },
  badgeT: { color: colors.primary, fontFamily: 'monospace', fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface2 },
  tabActive: { backgroundColor: `${colors.primary}20` },
  tabT: { color: colors.mutedForeground, fontSize: 12 },
  tabTA: { color: colors.primary, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderLeftWidth: 3, borderRadius: 12, padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { color: colors.primary, fontFamily: 'monospace', fontSize: 10 },
  time: { color: colors.mutedForeground, fontSize: 11 },
  title: { color: colors.foreground, fontSize: 14, fontWeight: '600' },
  body: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17 },
  empty: { padding: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  emptyT: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
