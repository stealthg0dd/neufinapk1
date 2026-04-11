'use client'

import type { RegimeData } from '@/hooks/usePortfolioData'

interface Props {
  regime: RegimeData | null
}

function regimeColor(r: string | undefined) {
  const u = (r ?? '').toLowerCase()
  if (u.includes('risk_off') || u.includes('risk-off') || u.includes('recession') || u.includes('crisis')) return '#EF4444'
  if (u.includes('risk_on') || u.includes('risk-on') || u.includes('recovery') || u.includes('growth')) return '#22C55E'
  return '#F5A623'
}

function regimeLabel(r: string | undefined) {
  if (!r || r === 'unknown') return 'Pending'
  return r.replace(/_/g, ' ').replace(/-/g, '-')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function RegimeCard({ regime }: Props) {
  const raw = regime?.regime ?? regime?.label ?? undefined
  const col = regimeColor(raw)
  const label = regimeLabel(raw)
  const conf = regime?.confidence ?? 0
  const confPct = conf > 0 ? Math.round(conf * 100) : null

  return (
    <div style={{
      background: '#161D2E', borderRadius: 12, border: '1px solid #2A3550',
      padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ color: '#1EB8CC', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em' }}>
        MACRO REGIME
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: col, boxShadow: `0 0 6px ${col}`,
        }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: col }}>
          {label}
        </span>
      </div>

      {confPct !== null ? (
        <>
          <div style={{ marginTop: 8, height: 4, background: '#2A3550', borderRadius: 2 }}>
            <div style={{
              height: '100%', background: col, borderRadius: 2,
              width: `${confPct}%`, transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ color: '#64748B', fontSize: 11, marginTop: 3 }}>
            Confidence: {confPct}%
          </div>
        </>
      ) : (
        <div style={{ color: '#64748B', fontSize: 11, marginTop: 4 }}>
          Live macro signal · Updates daily
        </div>
      )}
    </div>
  )
}
