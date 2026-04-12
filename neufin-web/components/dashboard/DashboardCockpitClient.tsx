'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Brain,
  Dna,
  TrendingUp,
  UploadCloud,
} from 'lucide-react'
import { KPICard } from '@/components/ui/KPICard'
import ResearchFeedClient from '@/components/dashboard/ResearchFeedClient'
import { usePortfolioDNA } from '@/hooks/usePortfolioDNA'
import { useState } from 'react'

export type CockpitNote = {
  id: string
  title: string
  executive_summary: string
  confidence_score?: number
  generated_at: string
  note_type?: string
}

export type RegimePayload = {
  current?: { regime?: string; confidence?: number }
}

function formatRegimeLabel(raw: string) {
  return raw.replace(/_/g, ' ')
}

function regimeKpiVariant(regime: string): 'risk' | 'positive' | 'warning' {
  const u = regime.toLowerCase()
  if (u.includes('risk_off') || u.includes('risk-off') || u.includes('recession')) return 'risk'
  if (u.includes('risk_on') || u.includes('risk-on') || u.includes('recovery')) return 'positive'
  return 'warning'
}

function dnaVariant(score: number | null): 'positive' | 'warning' | 'risk' {
  if (score == null) return 'risk'
  if (score > 70) return 'positive'
  if (score > 50) return 'warning'
  return 'risk'
}

function countNotesThisWeek(notes: CockpitNote[]) {
  const weekAgo = Date.now() - 7 * 86400000
  return notes.filter((n) => new Date(n.generated_at).getTime() >= weekAgo).length
}

function behavioralSignals(regimeRaw: string, hasPortfolio: boolean) {
  const rl = regimeRaw.toLowerCase()
  const riskOff = rl.includes('risk_off') || rl.includes('risk-off') || rl.includes('recession')
  const signals: Array<{ key: string; bias: string; evidence: string; positive?: boolean }> = []
  if (riskOff) {
    signals.push({
      key: 'recency',
      bias: 'Recency Bias Risk',
      evidence: 'Recent risk-off shift may trigger loss aversion',
      positive: false,
    })
  }
  if (!hasPortfolio) {
    signals.push({
      key: 'anchor',
      bias: 'Anchoring Gap',
      evidence: 'No current portfolio baseline — decisions lack context',
      positive: false,
    })
  }
  signals.push({
    key: 'regime',
    bias: 'Market Regime Active',
    evidence: `Current ${formatRegimeLabel(regimeRaw)} regime affects optimal allocation`,
    positive: true,
  })
  return signals
}

export default function DashboardCockpitClient({
  regimeData,
  researchNotes,
}: {
  regimeData: RegimePayload
  researchNotes: CockpitNote[]
}) {
  const { loading: dnaLoading, score, hasPortfolio } = usePortfolioDNA()
  const [marketTab, setMarketTab] = useState<'S&P 500' | 'NASDAQ' | 'STI' | 'FTSE'>('S&P 500')

  const notes = researchNotes ?? []

  const regimeRaw = regimeData.current?.regime ?? 'Unknown'
  const regimeLabel = formatRegimeLabel(regimeRaw)
  const confidence = Math.max(0, Math.min(1, regimeData.current?.confidence ?? 0))
  const variant = regimeKpiVariant(regimeRaw)

  const notesThisWeek = countNotesThisWeek(notes)

  const researchSubLabel =
    notesThisWeek > 0
      ? { change: notesThisWeek as number | undefined, changeLabel: 'this week' as string | undefined }
      : notes.length > 0
        ? { change: undefined as number | undefined, changeLabel: 'No new notes this week' as string | undefined }
        : { change: undefined, changeLabel: undefined }

  const signals = behavioralSignals(regimeRaw, hasPortfolio)

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0 }}
      >
        <div className="mb-6 border-b border-[hsl(var(--border)/0.5)] pb-4">
          <p className="mb-2 text-[9px] font-mono uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.5)]">
            Since yesterday
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                variant === 'risk'
                  ? 'bg-risk/10 text-risk'
                  : variant === 'positive'
                    ? 'bg-positive/10 text-positive'
                    : 'bg-warning/10 text-warning'
              }`}
            >
              Regime → {regimeLabel}
            </span>
            {notes.length > 0 ? (
              <span className="shrink-0 rounded-full bg-[hsl(var(--primary)/0.1)] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--primary))]">
                {notes.length} new research notes
              </span>
            ) : null}
            {hasPortfolio ? (
              <span className="shrink-0 rounded-full bg-positive/10 px-2.5 py-1 text-[11px] font-medium text-positive">
                DNA analyzed
              </span>
            ) : null}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <KPICard
          title="Market Regime"
          value={regimeLabel}
          change={confidence}
          changeLabel="confidence"
          variant={variant}
          icon={<Activity className="h-4 w-4" />}
        />
        <KPICard
          title="Portfolio DNA"
          value={dnaLoading ? '—' : typeof score === 'number' ? score : '—'}
          changeLabel={!dnaLoading && !hasPortfolio ? 'Upload to analyze' : undefined}
          variant={dnaVariant(score)}
          loading={dnaLoading}
          icon={<Dna className="h-4 w-4" />}
        />
        <KPICard
          title="Research Notes"
          value={notes.length}
          change={researchSubLabel.change}
          changeLabel={researchSubLabel.changeLabel}
          variant="ai"
          icon={<BookOpen className="h-4 w-4" />}
        />
        <KPICard
          title="Active Alerts"
          value="0"
          changeLabel="No active alerts"
          variant="warning"
          icon={<Bell className="h-4 w-4" />}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.16 }}
        className="mt-6 flex flex-col gap-6 lg:flex-row"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              Research intelligence
            </h2>
            <Link
              href="/research"
              className="text-[11px] text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)]"
            >
              View all →
            </Link>
          </div>
          <ResearchFeedClient notes={notes.slice(0, 5)} />

          <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                Market overview
              </h3>
              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">Index tabs (fallback mode)</span>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {(['S&P 500', 'NASDAQ', 'STI', 'FTSE'] as const).map((tab) => {
                const active = tab === marketTab
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMarketTab(tab)}
                    className={[
                      'rounded px-2 py-1 font-mono text-[11px]',
                      active ? 'bg-primary/15 text-primary' : 'text-[hsl(var(--muted-foreground))] hover:text-foreground',
                    ].join(' ')}
                    title="Index endpoint unavailable, showing regime-confidence fallback"
                  >
                    {tab}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{regimeLabel}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {marketTab} data endpoint unavailable — showing live regime confidence fallback
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                {Math.round(confidence * 100)}%
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${
                  variant === 'risk' ? 'bg-risk' : variant === 'positive' ? 'bg-positive' : 'bg-warning'
                }`}
                style={{ width: `${Math.round(confidence * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 lg:w-80">
          {!hasPortfolio && !dnaLoading ? (
            <div className="rounded-xl border border-dashed border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.05)] p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)]">
                <UploadCloud className="h-6 w-6 text-[hsl(var(--primary))]" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-[hsl(var(--foreground))]">Analyze Your Portfolio</h3>
              <p className="mb-4 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                Upload a CSV of your holdings for institutional-grade DNA scoring and AI-powered risk analysis.
              </p>
              <Link
                href="/dashboard/portfolio"
                className="block w-full rounded-lg bg-[hsl(var(--primary))] py-2.5 text-center text-sm font-medium text-[hsl(var(--primary-foreground))]"
              >
                Upload Portfolio
              </Link>
            </div>
          ) : null}

          {hasPortfolio && !dnaLoading ? (
            <div className="rounded-lg border border-[hsl(var(--border))] bg-surface p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Portfolio DNA
              </p>
              <p className="font-finance mt-2 text-3xl font-semibold tabular-nums text-[hsl(var(--foreground))]">
                {typeof score === 'number' ? score : '—'}
              </p>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Latest score from your holdings</p>
              <Link
                href="/dashboard/portfolio"
                className="mt-3 inline-block text-[11px] text-[hsl(var(--primary))] hover:underline"
              >
                View portfolio →
              </Link>
            </div>
          ) : null}

          {dnaLoading ? (
            <div className="animate-pulse rounded-xl border border-[hsl(var(--border))] bg-surface p-6">
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-[hsl(var(--muted-foreground)/0.15)]" />
              <div className="mx-auto h-4 w-40 rounded bg-[hsl(var(--muted-foreground)/0.15)]" />
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-[14px] w-[14px] text-[hsl(var(--accent))]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                Behavioral lens
              </span>
            </div>
            <div className="space-y-0">
              {(signals ?? []).map((s) => (
                <div
                  key={s.key}
                  className="flex items-start gap-2.5 border-b border-[hsl(var(--border)/0.4)] py-2 last:border-0"
                >
                  {s.positive ? (
                    <TrendingUp className="mt-0.5 h-[13px] w-[13px] shrink-0 text-positive" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-[13px] w-[13px] shrink-0 text-warning" />
                  )}
                  <div>
                    <p className="text-[11px] font-medium text-[hsl(var(--foreground))]">{s.bias}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">{s.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </motion.div>
    </div>
  )
}
