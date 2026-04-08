import { getLandingTickers } from '@/lib/market/ticker'

function formatPct(p: number): string {
  const s = Math.abs(p).toFixed(2)
  return `${p >= 0 ? '+' : '-'}${s}%`
}

export default async function StockTickerMarquee() {
  const tickers = await getLandingTickers()
  const doubled = [...tickers, ...tickers]

  return (
    <div className="border-y border-border/30 bg-surface/30 py-2.5 overflow-hidden">
      <div className="flex gap-10 whitespace-nowrap will-change-transform animate-[scroll_35s_linear_infinite]">
        {doubled.map((t, idx) => {
          const up = t.changePct >= 0
          return (
            <div key={`${t.symbol}-${idx}`} className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-muted-foreground/70">{t.symbol}</span>
              <span className="text-foreground">${t.price.toFixed(2)}</span>
              <span className={up ? 'text-positive' : 'text-risk'}>
                {up ? '▲' : '▼'} {formatPct(t.changePct)}
              </span>
              <span className="text-muted-foreground/40">|</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

