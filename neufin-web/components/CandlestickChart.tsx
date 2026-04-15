"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CandleData } from "@/lib/api";
import { chartPalette } from "@/lib/chart-palette";

export type ChartMarker = {
  time: string;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
};

export type QuantOverlaySignal = {
  time: string;
  type: "buy_zone" | "sell_zone" | "volatility_spike" | "regime_shift";
  strength?: number;
  label?: string;
  price?: number;
};

type IndicatorState = {
  rsi: boolean;
  macd: boolean;
  bollinger: boolean;
  vwap: boolean;
};

interface Props {
  data: CandleData[];
  symbol: string;
  height?: number;
  markers?: ChartMarker[];
  quantSignals?: QuantOverlaySignal[];
  timeframe?: string;
  timeframes?: string[];
  onTimeframeChange?: (timeframe: string) => void;
  indicators?: Partial<IndicatorState>;
  showControls?: boolean;
}

function ema(values: number[], period: number): number[] {
  if (!values.length || period <= 1) return values;
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    const n = i + 1 < period ? i + 1 : period;
    out.push(sum / n);
  }
  return out;
}

export default function CandlestickChart({
  data,
  symbol,
  height = 300,
  markers = [],
  quantSignals = [],
  timeframe,
  timeframes = ["1M", "3M", "6M", "1Y", "3Y"],
  onTimeframeChange,
  indicators,
  showControls = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowStartPct, setWindowStartPct] = useState(0);
  const [windowEndPct, setWindowEndPct] = useState(100);
  const [localIndicators, setLocalIndicators] = useState<IndicatorState>({
    rsi: false,
    macd: false,
    bollinger: true,
    vwap: true,
    ...(indicators || {}),
  });

  const computed = useMemo(() => {
    const close = data.map((d) => d.close);
    const typical = data.map((d) => (d.high + d.low + d.close) / 3);

    // Bollinger(20, 2)
    const bbMid = sma(close, 20);
    const bbUpper: number[] = [];
    const bbLower: number[] = [];
    for (let i = 0; i < close.length; i += 1) {
      const start = Math.max(0, i - 19);
      const slice = close.slice(start, i + 1);
      const mean = bbMid[i];
      const variance =
        slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
        Math.max(1, slice.length);
      const sd = Math.sqrt(variance);
      bbUpper.push(mean + sd * 2);
      bbLower.push(mean - sd * 2);
    }

    // VWAP
    const vwap: number[] = [];
    let cumPV = 0;
    let cumV = 0;
    for (let i = 0; i < data.length; i += 1) {
      cumPV += typical[i] * data[i].volume;
      cumV += data[i].volume;
      vwap.push(cumV > 0 ? cumPV / cumV : typical[i]);
    }

    // RSI(14)
    const rsi: number[] = [];
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < close.length; i += 1) {
      if (i === 0) {
        rsi.push(50);
        continue;
      }
      const delta = close[i] - close[i - 1];
      const gain = Math.max(0, delta);
      const loss = Math.max(0, -delta);
      if (i <= 14) {
        avgGain += gain;
        avgLoss += loss;
        const g = avgGain / i;
        const l = avgLoss / i;
        const rs = l === 0 ? 100 : g / l;
        rsi.push(100 - 100 / (1 + rs));
      } else {
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      }
    }

    // MACD(12,26,9)
    const ema12 = ema(close, 12);
    const ema26 = ema(close, 26);
    const macd = close.map((_, i) => ema12[i] - ema26[i]);
    const signal = ema(macd, 9);

    return { bbMid, bbUpper, bbLower, vwap, rsi, macd, signal };
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    let chart: ReturnType<(typeof import("lightweight-charts"))["createChart"]>;

    const init = async () => {
      const { createChart, ColorType } = await import("lightweight-charts");

      if (!containerRef.current) return;

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
          vertLine: {
            color: chartPalette.neutral,
            width: 1,
            style: 2,
            labelBackgroundColor: chartPalette.neutralMuted,
          },
          horzLine: {
            color: chartPalette.neutral,
            width: 1,
            style: 2,
            labelBackgroundColor: chartPalette.neutralMuted,
          },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          vertTouchDrag: true,
          horzTouchDrag: true,
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: true,
        },
        timeScale: { borderColor: chartPalette.grid, timeVisible: true },
        rightPriceScale: { borderColor: chartPalette.grid },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: chartPalette.primary,
        downColor: chartPalette.risk,
        borderUpColor: chartPalette.primary,
        borderDownColor: chartPalette.risk,
        wickUpColor: chartPalette.primary,
        wickDownColor: chartPalette.risk,
      });
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: {
          top: 0.75,
          bottom: 0,
        },
        borderVisible: false,
      });

      // lightweight-charts expects time as 'YYYY-MM-DD' or UTCTimestamp
      candleSeries.setData(
        data.map((d) => ({
          time: d.time as import("lightweight-charts").Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      );
      volumeSeries.setData(
        data.map((d) => ({
          time: d.time as import("lightweight-charts").Time,
          value: d.volume,
          color:
            d.close >= d.open
              ? `${chartPalette.positive}47`
              : `${chartPalette.risk}47`,
        })),
      );
      if (markers.length > 0) {
        candleSeries.setMarkers(
          markers.map((m) => ({
            ...m,
            time: m.time as import("lightweight-charts").Time,
          })),
        );
      }

      const overlayMarkers = quantSignals.map((s) => {
        const kind = s.type;
        if (kind === "buy_zone") {
          return {
            time: s.time as import("lightweight-charts").Time,
            position: "belowBar" as const,
            color: "#22c55e",
            shape: "arrowUp" as const,
            text: s.label || "Buy zone",
          };
        }
        if (kind === "sell_zone") {
          return {
            time: s.time as import("lightweight-charts").Time,
            position: "aboveBar" as const,
            color: "#ef4444",
            shape: "arrowDown" as const,
            text: s.label || "Sell zone",
          };
        }
        if (kind === "regime_shift") {
          return {
            time: s.time as import("lightweight-charts").Time,
            position: "inBar" as const,
            color: "#8b5cf6",
            shape: "square" as const,
            text: s.label || "Regime",
          };
        }
        return {
          time: s.time as import("lightweight-charts").Time,
          position: "aboveBar" as const,
          color: "#f59e0b",
          shape: "circle" as const,
          text: s.label || "Vol spike",
        };
      });

      if (overlayMarkers.length > 0) {
        candleSeries.setMarkers([
          ...markers.map((m) => ({
            ...m,
            time: m.time as import("lightweight-charts").Time,
          })),
          ...overlayMarkers,
        ]);
      }

      const lineData = (arr: number[]) =>
        data.map((d, i) => ({
          time: d.time as import("lightweight-charts").Time,
          value: Number.isFinite(arr[i]) ? Number(arr[i].toFixed(4)) : 0,
        }));

      if (localIndicators.bollinger) {
        const bbUpperSeries = chart.addLineSeries({
          color: "#a855f7",
          lineWidth: 1,
          lineStyle: 2,
        });
        const bbMidSeries = chart.addLineSeries({
          color: "#6366f1",
          lineWidth: 1,
        });
        const bbLowerSeries = chart.addLineSeries({
          color: "#a855f7",
          lineWidth: 1,
          lineStyle: 2,
        });
        bbUpperSeries.setData(lineData(computed.bbUpper));
        bbMidSeries.setData(lineData(computed.bbMid));
        bbLowerSeries.setData(lineData(computed.bbLower));
      }

      if (localIndicators.vwap) {
        const vwapSeries = chart.addLineSeries({
          color: "#0ea5e9",
          lineWidth: 2,
        });
        vwapSeries.setData(lineData(computed.vwap));
      }

      if (localIndicators.rsi) {
        const rsiSeries = chart.addLineSeries({
          color: "#f59e0b",
          lineWidth: 1,
          priceScaleId: "rsi",
        });
        chart.priceScale("rsi").applyOptions({
          visible: true,
          scaleMargins: { top: 0.82, bottom: 0.02 },
          borderVisible: false,
        });
        rsiSeries.setData(lineData(computed.rsi));
      }

      if (localIndicators.macd) {
        const macdSeries = chart.addLineSeries({
          color: "#14b8a6",
          lineWidth: 1,
          priceScaleId: "macd",
        });
        const signalSeries = chart.addLineSeries({
          color: "#f97316",
          lineWidth: 1,
          lineStyle: 2,
          priceScaleId: "macd",
        });
        chart.priceScale("macd").applyOptions({
          visible: true,
          scaleMargins: { top: 0.64, bottom: 0.24 },
          borderVisible: false,
        });
        macdSeries.setData(lineData(computed.macd));
        signalSeries.setData(lineData(computed.signal));
      }

      chart.timeScale().fitContent();

      if (data.length > 20) {
        const start = Math.floor((windowStartPct / 100) * (data.length - 1));
        const end = Math.floor((windowEndPct / 100) * (data.length - 1));
        const startTime =
          data[Math.max(0, Math.min(start, data.length - 1))]?.time;
        const endTime = data[Math.max(0, Math.min(end, data.length - 1))]?.time;
        if (startTime && endTime) {
          chart.timeScale().setVisibleRange({
            from: startTime as import("lightweight-charts").Time,
            to: endTime as import("lightweight-charts").Time,
          });
        }
      }

      const handleResize = () => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", handleResize);

      return () => window.removeEventListener("resize", handleResize);
    };

    let cleanup: (() => void) | undefined;
    init().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cleanup?.();
      chart?.remove();
    };
  }, [
    computed.bbLower,
    computed.bbMid,
    computed.bbUpper,
    computed.macd,
    computed.rsi,
    computed.signal,
    computed.vwap,
    data,
    height,
    localIndicators.bollinger,
    localIndicators.macd,
    localIndicators.rsi,
    localIndicators.vwap,
    markers,
    quantSignals,
    symbol,
    windowEndPct,
    windowStartPct,
  ]);

  if (!data.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-muted2"
      >
        No data for {symbol}
      </div>
    );
  }

  return (
    <div className="w-full">
      {showControls && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {timeframes.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange?.(tf)}
                className={`rounded px-2 py-1 font-mono text-xs ${timeframe === tf ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(["rsi", "macd", "bollinger", "vwap"] as const).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() =>
                  setLocalIndicators((prev) => ({
                    ...prev,
                    [name]: !prev[name],
                  }))
                }
                className={`rounded border px-2 py-1 font-mono ${localIndicators[name] ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300" : "border-border text-muted-foreground"}`}
              >
                {name.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {showControls && data.length > 30 && (
        <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            Start
            <input
              type="range"
              min={0}
              max={95}
              value={windowStartPct}
              onChange={(e) =>
                setWindowStartPct(
                  Math.min(Number(e.target.value), windowEndPct - 5),
                )
              }
              className="w-full"
            />
          </label>
          <label className="flex items-center gap-2">
            End
            <input
              type="range"
              min={5}
              max={100}
              value={windowEndPct}
              onChange={(e) =>
                setWindowEndPct(
                  Math.max(Number(e.target.value), windowStartPct + 5),
                )
              }
              className="w-full"
            />
          </label>
        </div>
      )}

      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
