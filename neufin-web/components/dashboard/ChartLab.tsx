'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CandlestickChart, { type ChartMarker } from '@/components/CandlestickChart'
import type { CandleData } from '@/lib/api'
import { apiGet } from '@/lib/api-client'

type Timeframe = '1M' | '3M' | '6M' | '1Y' | '3Y'
const TIMEFRAMES: Timeframe[] = ['1M', '3M', '6M', '1Y', '3Y']

const periodMap: Record<Timeframe, string> = {
  '1M': '1mo',
  '3M': '3mo',
  '6M': '6mo',
  '1Y': '1y',
  '3Y': '3y',
}

export interface ChartLabProps {
  positions: Array<{ symbol: string; shares: number; weight: number }>
  portfolioId: string
  swarmResult?: Record<string, unknown> | null
}

export default function ChartLab({ positions, swarmResult }: ChartLabProps) {
  const [selectedTicker, setSelectedTicker] = useState(positions[0]?.symbol ?? '')
  const [timeframe, setTimeframe] = useState<Timeframe>('3M')
  const [data, setData] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const positionKey = useMemo(
    () => positions.map((p) => p.symbol).join(','),
    [positions],
  )

  const selectedPosition = useMemo(
    () => positions.find((p) => p.symbol === selectedTicker) ?? null,
    [positions, selectedTicker],
  )

  const markers = useMemo<ChartMarker[]>(() => {
    if (!data.length || !swarmResult || !selectedTicker) return []
    const lastTime = data[data.length - 1].time
    const out: ChartMarker[] = []

    const riskSentinel = (swarmResult as any).risk_sentinel
    const alphaScout = (swarmResult as any).alpha_scout
    const taxReport = (swarmResult as any).tax_report

    if (riskSentinel?.primary_risks?.length) {
      out.push({
        time: lastTime,
        position: 'aboveBar',
        color: '#ef4444',
        shape: 'arrowDown',
        text: 'Risk flag',
      })
    }
    if (alphaScout?.opportunities?.some((o: any) => o?.symbol === selectedTicker)) {
      out.push({
        time: lastTime,
        position: 'belowBar',
        color: '#22c55e',
        shape: 'arrowUp',
        text: 'Alpha',
      })
    }
    if (taxReport?.liability_top3?.some((t: any) => t?.symbol === selectedTicker)) {
      out.push({
        time: lastTime,
        position: 'inBar',
        color: '#f59e0b',
        shape: 'circle',
        text: 'Tax',
      })
    }
    return out
  }, [data, swarmResult, selectedTicker])

  const currentStats = useMemo(() => {
    if (!data.length) return null
    const first = data[0]
    const last = data[data.length - 1]
    const dayChangePct = last.open ? ((last.close - last.open) / last.open) * 100 : 0
    const betaMap = ((swarmResult as any)?.quant_analysis?.beta_map ?? {}) as Record<string, number>
    return {
      current: last.close,
      dayChangePct,
      beta: betaMap[selectedTicker] ?? null,
      weight: selectedPosition ? selectedPosition.weight * 100 : null,
    }
  }, [data, swarmResult, selectedTicker, selectedPosition])

  const loadTicker = useCallback(async (ticker: string, tf: Timeframe) => {
    setLoading(true)
    setError(null)
    try {
      const period = periodMap[tf]
      const res = await apiGet<{ data?: CandleData[] } & Record<string, unknown>>(
        `/api/portfolio/chart/${encodeURIComponent(ticker)}?period=${encodeURIComponent(period)}`,
      )
      const rows = Array.isArray(res.data)
        ? res.data
        : Array.isArray((res as { candles?: CandleData[] }).candles)
          ? (res as { candles: CandleData[] }).candles
          : []
      setData(rows)
      if (!rows.length) setError(`Price data unavailable for ${ticker}`)
    } catch {
      setData([])
      setError(`Price data unavailable for ${ticker}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load when portfolio positions become available (not only on chip click)
  useEffect(() => {
    if (!positionKey) return
    const sym = positionKey.split(',')[0]
    if (!sym) return
    setSelectedTicker(sym)
    void loadTicker(sym, '3M')
    setTimeframe('3M')
  }, [positionKey, loadTicker])

  return (
    <div className="rounded-xl border border-border/50 bg-surface p-4">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {positions.map((p) => (
          <button
            key={p.symbol}
            type="button"
            onClick={() => {
              setSelectedTicker(p.symbol)
              void loadTicker(p.symbol, timeframe)
            }}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-sm ${
              selectedTicker === p.symbol
                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300'
                : 'border-border bg-surface-2 text-muted-foreground'
            }`}
          >
            {p.symbol} {(p.weight * 100).toFixed(1)}%
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-1.5">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => {
              setTimeframe(tf)
              if (selectedTicker) void loadTicker(selectedTicker, tf)
            }}
            className={`rounded px-2 py-1 font-mono text-sm ${
              timeframe === tf ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border/60 bg-[#0B0F14] p-3">
        <div className="h-72">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded bg-surface-2" />
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => selectedTicker && void loadTicker(selectedTicker, timeframe)}
                className="rounded border border-border px-3 py-1 text-xs"
              >
                Retry
              </button>
            </div>
          ) : (
            <CandlestickChart data={data} symbol={selectedTicker} height={280} markers={markers} />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric title="Current Price" value={currentStats ? `$${currentStats.current.toFixed(2)}` : '—'} />
        <Metric
          title="Day Change %"
          value={currentStats ? `${currentStats.dayChangePct >= 0 ? '+' : ''}${currentStats.dayChangePct.toFixed(2)}%` : '—'}
        />
        <Metric
          title="Beta vs Market"
          value={currentStats?.beta != null ? currentStats.beta.toFixed(2) : '—'}
        />
        <Metric
          title="Position Weight"
          value={currentStats?.weight != null ? `${currentStats.weight.toFixed(1)}%` : '—'}
        />
      </div>
    </div>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2 p-3">
      <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground/70">{title}</p>
      <p className="mt-1 font-mono text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}
