'use client'

import { useEffect, useRef } from 'react'
import type { CandleData } from '@/lib/api'
import { chartPalette } from '@/lib/chart-palette'

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
          background: { type: ColorType.Solid, color: chartPalette.background },
          textColor: chartPalette.axis,
        },
        grid: {
          vertLines: { color: chartPalette.grid, style: 1 },
          horzLines: { color: chartPalette.grid, style: 1 },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: chartPalette.neutral, width: 1, style: 2, labelBackgroundColor: chartPalette.neutralMuted },
          horzLine: { color: chartPalette.neutral, width: 1, style: 2, labelBackgroundColor: chartPalette.neutralMuted },
        },
        timeScale: { borderColor: chartPalette.grid, timeVisible: true },
        rightPriceScale: { borderColor: chartPalette.grid },
      })

      const candleSeries = chart.addCandlestickSeries({
        upColor: chartPalette.primary,
        downColor: chartPalette.risk,
        borderUpColor: chartPalette.primary,
        borderDownColor: chartPalette.risk,
        wickUpColor: chartPalette.primary,
        wickDownColor: chartPalette.risk,
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
          color: d.close >= d.open ? `${chartPalette.positive}47` : `${chartPalette.risk}47`,
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
        className="flex items-center justify-center text-sm text-muted2"
      >
        No data for {symbol}
      </div>
    )
  }

  return <div ref={containerRef} style={{ height }} className="w-full" />
}
