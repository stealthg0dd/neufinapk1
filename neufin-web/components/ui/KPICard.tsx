'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'

export interface KPICardProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  variant?: 'default' | 'positive' | 'warning' | 'risk' | 'ai'
  compact?: boolean
  loading?: boolean
}

const variantChip: Record<NonNullable<KPICardProps['variant']>, string> = {
  default: 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]',
  positive: 'bg-positive/10 text-positive',
  warning: 'bg-warning/10 text-warning',
  risk: 'bg-risk/10 text-risk',
  ai: 'bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))]',
}

export function KPICard({
  title,
  value,
  change,
  changeLabel,
  icon,
  variant = 'default',
  compact = false,
  loading = false,
}: KPICardProps) {
  const chip = variantChip[variant]

  if (loading) {
    return (
      <div
        className={`relative overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-surface p-4 transition-colors hover:border-[hsl(var(--primary)/0.2)] ${compact ? 'p-3' : ''}`}
      >
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.4)] to-transparent" />
        <div className="mb-3 flex animate-pulse items-center justify-between">
          <div className="h-3 w-24 rounded bg-[hsl(var(--muted-foreground)/0.2)]" />
          <div className="h-7 w-7 rounded bg-[hsl(var(--muted-foreground)/0.15)]" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded bg-[hsl(var(--muted-foreground)/0.15)]" />
        <div className="mt-2 h-3 w-28 animate-pulse rounded bg-[hsl(var(--muted-foreground)/0.1)]" />
      </div>
    )
  }

  const isConfidence = changeLabel === 'confidence' && typeof change === 'number'
  const showDirection = change !== undefined && !isConfidence && Math.abs(change) > 0

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-surface p-4 transition-colors hover:border-[hsl(var(--primary)/0.2)] ${compact ? 'p-3' : ''}`}
    >
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.4)] to-transparent" />

      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {title}
        </span>
        {icon ? (
          <div className={`flex h-7 w-7 items-center justify-center rounded ${chip}`}>{icon}</div>
        ) : null}
      </div>

      <p className="font-finance text-2xl font-semibold tabular-nums text-[hsl(var(--foreground))]">
        {value}
      </p>

      {isConfidence ? (
        <div className="mt-1.5">
          <span className="text-[11px] font-medium tabular-nums text-[hsl(var(--muted-foreground))]">
            {Math.round(change <= 1 ? change * 100 : change)}% confidence
          </span>
        </div>
      ) : showDirection ? (
        <div className="mt-1.5 flex items-center gap-1">
          {change > 0 ? (
            <ChevronUp className="h-3 w-3 shrink-0 text-positive" strokeWidth={2.5} />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 text-risk" strokeWidth={2.5} />
          )}
          <span className={`text-[11px] font-medium tabular-nums ${change > 0 ? 'text-positive' : 'text-risk'}`}>
            {Math.abs(change)}
          </span>
          {changeLabel ? (
            <span className="ml-1 text-[10px] text-[hsl(var(--muted-foreground))]">{changeLabel}</span>
          ) : null}
        </div>
      ) : change !== undefined && changeLabel && !isConfidence ? (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[11px] font-medium tabular-nums text-[hsl(var(--muted-foreground))]">
            {change}
          </span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{changeLabel}</span>
        </div>
      ) : changeLabel && change === undefined ? (
        <div className="mt-1.5">
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{changeLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
