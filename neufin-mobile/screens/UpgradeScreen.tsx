/**
 * UpgradeScreen — shown when a user hits a free-tier limit (HTTP 402).
 *
 * Displays the 3 paid plans with prices and feature highlights.
 * "Upgrade" opens the web pricing page in an in-app browser via expo-web-browser
 * (fastest revenue path — avoids App Store in-app-purchase review delays).
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Haptics from 'expo-haptics'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '@/App'

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Upgrade'>
}

const WEB_BASE = 'https://neufin.sg'

interface Plan {
  key: string
  name: string
  price: string
  period: string
  tagline: string
  features: string[]
  cta: string
  accent: string
  popular: boolean
  priceUrl: string
}

const PLANS: Plan[] = [
  {
    key: 'retail',
    name: 'Retail Investor',
    price: '$29',
    period: '/month',
    tagline: 'For individual investors who want institutional-grade analysis',
    features: [
      'Unlimited DNA analyses',
      'Swarm intelligence reports',
      'Portfolio alerts',
      'Mobile app access',
    ],
    cta: 'Start Free Trial',
    accent: '#3b82f6',
    popular: false,
    priceUrl: `${WEB_BASE}/pricing?plan=retail&source=mobile`,
  },
  {
    key: 'advisor',
    name: 'Financial Advisor',
    price: '$299',
    period: '/month',
    tagline: 'For advisors managing multiple client portfolios',
    features: [
      'Everything in Retail',
      'Multi-client dashboard',
      'White-label PDF reports (10/mo)',
      'Advisor branding',
      'MAS-compliant audit trail',
    ],
    cta: 'Start 14-Day Trial',
    accent: '#8b5cf6',
    popular: true,
    priceUrl: `${WEB_BASE}/pricing?plan=advisor&source=mobile`,
  },
  {
    key: 'enterprise',
    name: 'Enterprise API',
    price: '$999',
    period: '/month',
    tagline: 'For fintechs and institutions embedding NeuFin intelligence',
    features: [
      'Everything in Advisor',
      'Unlimited reports',
      'REST API access',
      '10,000 API calls/day',
      'Dedicated support',
    ],
    cta: 'Contact Sales',
    accent: '#f59e0b',
    popular: false,
    priceUrl: `${WEB_BASE}/contact-sales?source=mobile`,
  },
]

export default function UpgradeScreen({ navigation }: Props) {
  const [opening, setOpening] = useState<string | null>(null)

  async function handleUpgrade(plan: Plan) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setOpening(plan.key)
    try {
      await WebBrowser.openBrowserAsync(plan.priceUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        toolbarColor: '#0F172A',
      })
    } finally {
      setOpening(null)
    }
  }

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.title}>Upgrade NeuFin</Text>
          <Text style={s.subtitle}>
            You've reached the free limit. Upgrade to continue with unlimited analysis.
          </Text>
        </View>

        {/* Free tier reminder */}
        <View style={s.freeBadge}>
          <Text style={s.freeBadgeText}>
            ✓ Free plan: 3 DNA analyses/month — no credit card required
          </Text>
        </View>

        {/* Plan cards */}
        {PLANS.map((plan) => (
          <View
            key={plan.key}
            style={[s.card, plan.popular && { borderColor: plan.accent, borderWidth: 2 }]}
          >
            {plan.popular && (
              <View style={[s.popularBadge, { backgroundColor: plan.accent }]}>
                <Text style={s.popularText}>MOST POPULAR</Text>
              </View>
            )}

            <View style={s.cardHeader}>
              <View>
                <Text style={s.planName}>{plan.name}</Text>
                <Text style={s.planTagline}>{plan.tagline}</Text>
              </View>
              <View style={s.priceBlock}>
                <Text style={[s.price, { color: plan.accent }]}>{plan.price}</Text>
                <Text style={s.period}>{plan.period}</Text>
              </View>
            </View>

            <View style={s.features}>
              {plan.features.map((f) => (
                <View key={f} style={s.featureRow}>
                  <Text style={[s.featureCheck, { color: plan.accent }]}>✓</Text>
                  <Text style={s.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: plan.accent }]}
              onPress={() => handleUpgrade(plan)}
              disabled={opening === plan.key}
              activeOpacity={0.8}
            >
              {opening === plan.key ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.ctaText}>{plan.cta}</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {/* MAS disclaimer */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            NeuFin provides financial data and analysis tools. This is not financial advice.
            Past performance does not indicate future results.
            Please consult a licensed financial advisor.
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
  white:   '#FFFFFF',
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  scroll:       { padding: 20, paddingBottom: 48 },
  header:       { marginBottom: 20 },
  backBtn:      { marginBottom: 16 },
  backText:     { color: C.dim, fontSize: 14 },
  title:        { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 8 },
  subtitle:     { fontSize: 14, color: C.dim, lineHeight: 20 },
  freeBadge:    {
    backgroundColor: '#14532d20',
    borderColor: '#22c55e40',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  freeBadgeText: { color: '#22c55e', fontSize: 13 },
  card:         {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomLeftRadius: 10,
  },
  popularText:  { color: C.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  planName:     { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
  planTagline:  { fontSize: 12, color: C.dim, maxWidth: 180, lineHeight: 16 },
  priceBlock:   { alignItems: 'flex-end' },
  price:        { fontSize: 28, fontWeight: '800' },
  period:       { fontSize: 12, color: C.dim },
  features:     { marginBottom: 18, gap: 8 },
  featureRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureCheck: { fontSize: 14, fontWeight: '700', width: 16 },
  featureText:  { fontSize: 14, color: C.text, flex: 1 },
  ctaBtn:       {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    ...(Platform.OS === 'ios' ? { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } } : { elevation: 4 }),
  },
  ctaText:      { color: C.white, fontWeight: '700', fontSize: 15 },
  disclaimer:   {
    marginTop: 8,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  disclaimerText: { fontSize: 11, color: C.dim, lineHeight: 16, textAlign: 'center' },
})
