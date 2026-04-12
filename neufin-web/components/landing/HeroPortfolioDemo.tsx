import { GlassCard } from '@/components/ui/GlassCard'

export function HeroPortfolioDemo() {
  return (
    <GlassCard className="p-8 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] mb-2">
        Live preview · Portfolio DNA
      </p>
      <div className="flex items-end gap-2 mb-6">
        <span className="font-sans text-6xl tabular-nums text-navy animate-[pulse_2.2s_ease-out_1] md:text-7xl">
          78
        </span>
        <span className="text-xl text-[var(--text-muted)] mb-2 font-mono">/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden mb-6">
        <div className="h-full w-0 animate-[grow-score_2.2s_cubic-bezier(0.22,1,0.36,1)_forwards] rounded-full bg-gradient-to-r from-primary to-primary-dark" />
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-2)]/80 px-3 py-1.5 text-xs font-mono text-[var(--text-primary)]">
          <span className="text-[var(--text-muted)]">Risk:</span>
          Moderate
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-2)]/80 px-3 py-1.5 text-xs font-mono text-[var(--text-primary)]">
          <span className="text-[var(--text-muted)]">Beta:</span>
          0.82
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--surface-2)]/80 px-3 py-1.5 text-xs font-mono text-[var(--text-primary)]">
          <span className="text-[var(--text-muted)]">HHI:</span>
          0.34
        </span>
      </div>
    </GlassCard>
  )
}
