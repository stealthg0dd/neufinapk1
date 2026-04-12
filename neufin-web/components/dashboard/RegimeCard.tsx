'use client'

import type { RegimeData } from '@/hooks/usePortfolioData'

interface Props {
  regime: RegimeData | null
}

function regimeColor(r: string | undefined) {
  const u = (r ?? '').toLowerCase()
  if (u.includes('risk_off') || u.includes('risk-off') || u.includes('recession') || u.includes('crisis')) return '#DC2626'
  if (u.includes('risk_on') || u.includes('risk-on') || u.includes('recovery') || u.includes('growth')) return '#16A34A'
  return '#d97706'
}

function regimeLabel(r: string | undefined) {
  if (!r || r === 'unknown') return 'Pending'
  return r
    .replace(/_/g, ' ')
    .replace(/-/g, '-')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function RegimeCard({ regime }: Props) {
  const raw = regime?.regime ?? regime?.label ?? undefined
  const col = regimeColor(raw)
  const label = regimeLabel(raw)
  const conf = regime?.confidence ?? 0
  const confPct = conf > 0 ? Math.round(conf * 100) : null

  return (
    <div className="card-elevated flex flex-col gap-1">
      <div className="text-label text-primary">MACRO REGIME</div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: col }}
        />
        <span className="text-base font-bold" style={{ color: col }}>
          {label}
        </span>
      </div>

      {confPct !== null ? (
        <>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ background: col, width: `${confPct}%` }}
            />
          </div>
          <p className="mt-1 text-body-sm text-slate-600">Confidence: {confPct}%</p>
        </>
      ) : (
        <p className="mt-2 text-body-sm text-slate-600">Live macro signal · Updates daily</p>
      )}
    </div>
  )
}
