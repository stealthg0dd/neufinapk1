'use client'

interface Props {
  score: number | null
  investorType: string | null
  hasPortfolio: boolean
}

function scoreColor(s: number | null) {
  if (s == null) return '#64748B'
  if (s >= 71) return '#22C55E'
  if (s >= 41) return '#F5A623'
  return '#EF4444'
}

function scoreLabel(s: number | null) {
  if (s == null) return '—'
  if (s >= 71) return 'Healthy'
  if (s >= 41) return 'At Risk'
  return 'Critical'
}

export function DnaScoreCard({ score, investorType, hasPortfolio }: Props) {
  const col = scoreColor(score)
  const label = scoreLabel(score)

  return (
    <div style={{
      background: '#161D2E', borderRadius: 12, border: '1px solid #2A3550',
      padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ color: '#1EB8CC', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em' }}>
        PORTFOLIO HEALTH
      </div>

      {hasPortfolio && score != null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 42, fontWeight: 700, color: col, lineHeight: 1 }}>
              {score}
            </span>
            <span style={{ fontSize: 11, color: col, fontWeight: 600 }}>{label}</span>
          </div>
          <div style={{ color: '#64748B', fontSize: 11, marginTop: 4 }}>
            DNA Score · {investorType ?? 'Portfolio Investor'}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 32, color: '#2A3550', marginTop: 8 }}>—</div>
          <div style={{ color: '#64748B', fontSize: 11, marginTop: 4 }}>
            {hasPortfolio ? 'Analysis pending' : 'Upload a portfolio to see your score'}
          </div>
        </>
      )}
    </div>
  )
}
