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
  default: 'bg-primary/10 text-primary',
  positive: 'bg-positive/10 text-positive',
  warning: 'bg-warning/10 text-warning',
  risk: 'bg-risk/10 text-risk',
  ai: 'bg-accent/10 text-accent',
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
        className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition duration-200 hover:shadow-md hover:-translate-y-0.5 ${compact ? 'p-3' : ''}`}
      >
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="mb-3 flex animate-pulse items-center justify-between">
          <div className="h-3 w-24 rounded bg-muted-foreground/20" />
          <div className={`rounded bg-muted-foreground/15 ${compact ? 'h-7 w-7' : 'h-8 w-8'}`} />
        </div>
        <div className="h-8 w-20 animate-pulse rounded bg-muted-foreground/15" />
        <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted-foreground/10" />
      </div>
    )
  }

  const isConfidence = changeLabel === 'confidence' && typeof change === 'number'
  const showDirection = change !== undefined && !isConfidence && Math.abs(change) > 0

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition duration-200 hover:shadow-md hover:-translate-y-0.5 ${compact ? 'p-3' : ''}`}
    >
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {icon ? (
          <div
            className={`flex shrink-0 items-center justify-center rounded-md ${compact ? 'h-7 w-7 [&>svg]:h-3.5 [&>svg]:w-3.5' : 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4'} ${chip}`}
          >
            {icon}
          </div>
        ) : null}
      </div>

      <p className="font-finance text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>

      {isConfidence ? (
        <div className="mt-1.5">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {Math.round(change <= 1 ? change * 100 : change)}% confidence
          </span>
        </div>
      ) : showDirection ? (
        <div className="mt-1.5 flex items-center gap-1">
          {change > 0 ? (
            <ChevronUp
              className={`shrink-0 text-positive ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
              strokeWidth={2.25}
            />
          ) : (
            <ChevronDown
              className={`shrink-0 text-risk ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
              strokeWidth={2.25}
            />
          )}
          <span className={`text-sm font-medium tabular-nums ${change > 0 ? 'text-positive' : 'text-risk'}`}>
            {Math.abs(change)}
          </span>
          {changeLabel ? (
            <span className="ml-1 text-sm text-muted-foreground">{changeLabel}</span>
          ) : null}
        </div>
      ) : change !== undefined && changeLabel && !isConfidence ? (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {change}
          </span>
          <span className="text-sm text-muted-foreground">{changeLabel}</span>
        </div>
      ) : changeLabel && change === undefined ? (
        <div className="mt-1.5">
          <span className="text-sm text-muted-foreground">{changeLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
