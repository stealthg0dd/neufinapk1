/**
 * Public Yahoo Finance chart API — used when Railway returns no OHLCV
 * (wrong host, missing keys, or upstream 404) so dashboard charts still load.
 */

export type ChartCandle = {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const PERIOD_RANGE: Record<string, string> = {
  '1mo': '1mo',
  '3mo': '3mo',
  '6mo': '6mo',
  '1y': '1y',
  '3y': '5y',
}

const PERIOD_DAYS: Record<string, number> = {
  '1mo': 30,
  '3mo': 90,
  '6mo': 180,
  '1y': 365,
  '3y': 1095,
}

function isoDateFromUnix(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10)
}

export function candlesFromProxyBody(body: unknown): ChartCandle[] | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const d = o.data
  if (Array.isArray(d) && d.length > 0) return d as ChartCandle[]
  const c = o.candles
  if (Array.isArray(c) && c.length > 0) return c as ChartCandle[]
  return null
}

export async function fetchYahooChartCandles(
  ticker: string,
  period: string,
): Promise<ChartCandle[] | null> {
  const sym = ticker.trim().toUpperCase()
  if (!sym) return null
  const range = PERIOD_RANGE[period] ?? '3mo'
  const maxDays = PERIOD_DAYS[period] ?? 90
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NeuFin/1.0; +https://neufin.com) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      next: { revalidate: 300 },
    })
    if (!r.ok) return null
    const json = (await r.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[]
          indicators?: { quote?: Array<Record<string, (number | null)[] | undefined>> }
        }>
        error?: { description?: string }
      }
    }
    const err = json.chart?.error
    if (err?.description) return null
    const result = json.chart?.result?.[0]
    const ts = result?.timestamp
    const quote = result?.indicators?.quote?.[0]
    if (!ts?.length || !quote) return null

    const { open: O, high: H, low: L, close: C, volume: V } = quote
    const out: ChartCandle[] = []
    const now = Date.now() / 1000
    const cutoff = now - maxDays * 86400

    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]
      if (t == null || t < cutoff) continue
      const o = O?.[i]
      const h = H?.[i]
      const low = L?.[i]
      const c = C?.[i]
      if (o == null || h == null || low == null || c == null) continue
      if (c <= 0) continue
      const v = V?.[i]
      out.push({
        time: isoDateFromUnix(t),
        open: Math.round(o * 100) / 100,
        high: Math.round(h * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(c * 100) / 100,
        volume: typeof v === 'number' && !Number.isNaN(v) ? Math.round(v) : 0,
      })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}
