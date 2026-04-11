'use client'

interface Props {
  totalValue: number | null | undefined
  numPositions?: number
  hasPortfolio: boolean
}

function formatValue(v: number | null | undefined) {
  if (v == null || v === 0) return null
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

export function PortfolioValueCard({ totalValue, numPositions, hasPortfolio }: Props) {
  const formatted = formatValue(totalValue)

  return (
    <div style={{
      background: '#161D2E', borderRadius: 12, border: '1px solid #2A3550',
      padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ color: '#1EB8CC', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em' }}>
        PORTFOLIO VALUE
      </div>

      {hasPortfolio && formatted ? (
        <>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#F0F4FF', marginTop: 8, lineHeight: 1 }}>
            {formatted}
          </div>
          <div style={{ color: '#64748B', fontSize: 11, marginTop: 4 }}>
            {numPositions != null && numPositions > 0
              ? `${numPositions} portfolio${numPositions > 1 ? 's' : ''} analysed`
              : 'Portfolio analysed'}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 32, color: '#2A3550', marginTop: 8 }}>—</div>
          <div style={{ color: '#64748B', fontSize: 11, marginTop: 4 }}>
            {hasPortfolio ? 'Value loading' : 'No portfolio yet'}
          </div>
        </>
      )}
    </div>
  )
}
