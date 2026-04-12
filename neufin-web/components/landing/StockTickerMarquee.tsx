import { getLandingTickers } from '@/lib/market/ticker'

function formatPct(p: number): string {
  const s = Math.abs(p).toFixed(2)
  return `${p >= 0 ? '+' : '-'}${s}%`
}

export default async function StockTickerMarquee() {
  const tickers = await getLandingTickers()
  const doubled = [...tickers, ...tickers]

  return (
    <div className="stock-ticker-marquee overflow-hidden">
      <div className="flex h-full items-center gap-10 whitespace-nowrap py-0 will-change-transform animate-[scroll_35s_linear_infinite]">
        {doubled.map((t, idx) => {
          const up = t.changePct >= 0
          return (
            <div key={`${t.symbol}-${idx}`} className="flex items-center gap-2 font-mono">
              <span className="ticker-muted">{t.symbol}</span>
              <span className="text-[#334155]">${t.price.toFixed(2)}</span>
              <span className={up ? 'ticker-up' : 'ticker-down'}>{formatPct(t.changePct)}</span>
              <span className="ticker-muted opacity-50">|</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

