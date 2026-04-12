'use client'

import { useEffect, useRef } from 'react'
import type { CandleData } from '@/lib/api'

export type ChartMarker = {
  time: string
  position: 'aboveBar' | 'belowBar' | 'inBar'
  color: string
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square'
  text: string
}

interface Props {
  data: CandleData[]
  symbol: string
  height?: number
  markers?: ChartMarker[]
}

export default function CandlestickChart({ data, symbol, height = 300, markers = [] }: Props) {
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
          background: { type: ColorType.Solid, color: '#0B0F14' },
          textColor: '#8b949e',
        },
        grid: {
          vertLines: { color: '#1b222c' },
          horzLines: { color: '#1b222c' },
        },
        crosshair: { mode: 1 },
        timeScale: { borderColor: '#2a3441', timeVisible: true },
        rightPriceScale: { borderColor: '#2a3441' },
      })

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22d3ee',
        downColor: '#ef4444',
        borderUpColor: '#22d3ee',
        borderDownColor: '#ef4444',
        wickUpColor: '#22d3ee',
        wickDownColor: '#ef4444',
      })
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      })
      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.75,
          bottom: 0,
        },
        borderVisible: false,
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
      volumeSeries.setData(
        data.map((d) => ({
          time: d.time as import('lightweight-charts').Time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(34, 211, 238, 0.35)' : 'rgba(239, 68, 68, 0.35)',
        })),
      )
      if (markers.length > 0) {
        candleSeries.setMarkers(
          markers.map((m) => ({
            ...m,
            time: m.time as import('lightweight-charts').Time,
          })),
        )
      }

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
  }, [data, symbol, height, markers])

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
