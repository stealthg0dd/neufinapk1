'use client'

import { useEffect, useRef } from 'react'
import type { CandleData } from '@/lib/api'

interface Props {
  data: CandleData[]
  symbol: string
  height?: number
}

export default function CandlestickChart({ data, symbol, height = 300 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !data.length) return

    let chart: ReturnType<typeof import('lightweight-charts')['createChart']>

    const init = async () => {
      const { createChart, ColorType } = await import('lightweight-charts')

      if (!containerRef.current) return

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#6b7280',
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
        crosshair: { mode: 1 },
        timeScale: { borderColor: '#374151', timeVisible: true },
        rightPriceScale: { borderColor: '#374151' },
      })

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })

      // lightweight-charts expects time as 'YYYY-MM-DD' or UTCTimestamp
      candleSeries.setData(
        data.map((d) => ({
          time: d.time as import('lightweight-charts').Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      )

      chart.timeScale().fitContent()

      const handleResize = () => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth })
        }
      }
      window.addEventListener('resize', handleResize)

      return () => window.removeEventListener('resize', handleResize)
    }

    let cleanup: (() => void) | undefined
    init().then((fn) => { cleanup = fn })

    return () => {
      cleanup?.()
      chart?.remove()
    }
  }, [data, symbol, height])

  if (!data.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-gray-600 text-sm"
      >
        No data for {symbol}
      </div>
    )
  }

  return <div ref={containerRef} style={{ height }} className="w-full" />
}
