'use client'

import Link from 'next/link'
import { Loader2, PieChart } from 'lucide-react'
import { usePortfolioData } from '@/hooks/usePortfolioData'
import { DnaScoreCard } from '@/components/dashboard/DnaScoreCard'
import { RegimeCard } from '@/components/dashboard/RegimeCard'
import { PortfolioValueCard } from '@/components/dashboard/PortfolioValueCard'
import { SwarmBriefingPreview } from '@/components/dashboard/SwarmBriefingPreview'
import ResearchFeedClient from '@/components/dashboard/ResearchFeedClient'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const {
    portfolios,
    latestPortfolio,
    hasPortfolio,
    latestDna,
    swarmReport,
    regime,
    loading,
  } = usePortfolioData()

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 320, gap: 10, color: '#64748B', fontSize: 13,
      }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your portfolio intelligence…
      </div>
    )
  }

  const lastAnalyzed =
    latestPortfolio?.analyzed_at ??
    latestPortfolio?.updated_at ??
    latestPortfolio?.created_at ??
    null

  return (
    <div>
      {/* ── Greeting banner ───────────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-border/50 bg-surface px-5 py-4">
        {hasPortfolio ? (
          <div>
            <p className="text-sm font-medium text-foreground">
              Portfolio Intelligence Dashboard
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {latestDna?.investor_type
                ? `Archetype: ${latestDna.investor_type}`
                : 'DNA analysis active'}
              {lastAnalyzed && (
                <>
                  {' · '}Last analysed:{' '}
                  {new Date(lastAnalyzed).toLocaleDateString('en-SG', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Welcome to NeuFin. Start with your portfolio →{' '}
            <Link href="/dashboard/portfolio" className="text-primary hover:underline">
              Upload now
            </Link>
          </p>
        )}
      </div>

      {/* ── 3-card KPI grid ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <DnaScoreCard
          score={latestDna?.dna_score ?? latestPortfolio?.dna_score ?? null}
          investorType={latestDna?.investor_type ?? null}
          hasPortfolio={hasPortfolio}
        />
        <RegimeCard regime={regime} />
        <PortfolioValueCard
          totalValue={
            latestDna?.total_value ??
            latestPortfolio?.total_value ??
            null
          }
          numPositions={portfolios.length}
          hasPortfolio={hasPortfolio}
        />
      </div>

      {/* ── DNA insights: strengths + recommendation ─────────────────────── */}
      {hasPortfolio && latestDna && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Strengths */}
          {(latestDna.strengths ?? []).length > 0 && (
            <div className="rounded-xl border border-border/50 bg-surface px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
                Top Strengths
              </p>
              {latestDna.strengths.slice(0, 2).map((s, i) => (
                <div
                  key={i}
                  style={{ borderLeft: '2px solid #16A34A', paddingLeft: 10, marginBottom: 8 }}
                >
                  <p className="text-xs text-foreground">
                    {s.split('.')[0]}.
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Recommendation */}
          {latestDna.recommendation && (
            <div className="rounded-xl border border-border/50 bg-surface px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
                Recommended Action
              </p>
              <div style={{ borderLeft: '2px solid #F5A623', paddingLeft: 10 }}>
                <p className="text-xs text-foreground">{latestDna.recommendation}</p>
              </div>
            </div>
          )}

          {/* Weaknesses / risks */}
          {(latestDna.weaknesses ?? []).length > 0 && (
            <div className="rounded-xl border border-border/50 bg-surface px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
                Key Risks
              </p>
              {latestDna.weaknesses.slice(0, 2).map((w, i) => (
                <div
                  key={i}
                  style={{ borderLeft: '2px solid #DC2626', paddingLeft: 10, marginBottom: 8 }}
                >
                  <p className="text-xs text-foreground">
                    {w.split('.')[0]}.
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Tax snapshot if data available */}
          {latestDna.tax_analysis && (
            (latestDna.tax_analysis.total_liability ?? 0) > 0 ||
            (latestDna.tax_analysis.total_harvest_opp ?? 0) > 0
          ) && (
            <div className="rounded-xl border border-border/50 bg-surface px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
                Tax Snapshot
              </p>
              {(latestDna.tax_analysis?.total_liability ?? 0) > 0 && (
                <div style={{ borderLeft: '2px solid #F5A623', paddingLeft: 10, marginBottom: 8 }}>
                  <p className="text-xs text-muted-foreground">CGT Exposure</p>
                  <p className="text-sm font-semibold text-foreground">
                    ${(latestDna.tax_analysis!.total_liability!).toLocaleString()}
                  </p>
                </div>
              )}
              {(latestDna.tax_analysis?.total_harvest_opp ?? 0) > 0 && (
                <div style={{ borderLeft: '2px solid #22C55E', paddingLeft: 10 }}>
                  <p className="text-xs text-muted-foreground">Harvest Opportunity</p>
                  <p className="text-sm font-semibold text-foreground">
                    ${(latestDna.tax_analysis!.total_harvest_opp!).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Swarm IC briefing preview ────────────────────────────────────── */}
      {swarmReport && (
        <SwarmBriefingPreview swarmReport={swarmReport} />
      )}

      {/* ── If no swarm yet but has portfolio: show prompt ───────────────── */}
      {hasPortfolio && !swarmReport && (
        <div className="mb-6 rounded-xl border border-border/50 bg-surface px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
            Swarm IC Analysis
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Run the 7-agent swarm on your portfolio for regime-adjusted alpha signals,
            tax strategy, and an IC-grade memo.
          </p>
          <Link
            href="/swarm"
            className="inline-block rounded-md bg-primary/15 border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/25"
          >
            Run Swarm IC →
          </Link>
        </div>
      )}

      {/* ── Research feed ────────────────────────────────────────────────── */}
      <ResearchFeedClient limit={5} />

      {/* ── No portfolio: prominent upload CTA ──────────────────────────── */}
      {!hasPortfolio && (
        <div className="mt-6 rounded-xl border border-dashed border-border/50 bg-surface px-5 py-12 text-center">
          <div className="mb-3 flex justify-center">
            <PieChart className="h-10 w-10 text-primary" aria-hidden />
          </div>
          <p className="text-sm font-medium text-foreground">Start your first analysis</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Upload a CSV with your holdings to generate an IC-grade portfolio report
          </p>
          <Link
            href="/dashboard/portfolio"
            className="mt-5 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Upload Portfolio →
          </Link>
        </div>
      )}

      {/* ── Feedback banner ──────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between rounded-xl border border-border/50 bg-surface px-5 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            You&apos;re on NeuFin beta — your feedback shapes what we build.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Takes 5 minutes · Read personally by the founding team
          </p>
        </div>
        <Link href="/feedback" target="_blank">
          <button className="ml-4 flex-shrink-0 rounded-lg border border-primary/30 bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25">
            Share feedback →
          </button>
        </Link>
      </div>
    </div>
  )
}
