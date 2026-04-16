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

type QuantOverlayState = {
  buySellZones: boolean;
  volatilitySpikes: boolean;
  regimeShifts: boolean;
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

function downsampleCandles(rows: CandleData[], maxPoints: number): CandleData[] {
  if (rows.length <= maxPoints) return rows;
  const bucketSize = Math.ceil(rows.length / maxPoints);
  const out: CandleData[] = [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const bucket = rows.slice(i, i + bucketSize);
    if (!bucket.length) continue;
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    out.push({
      time: last.time,
      open: first.open,
      high: Math.max(...bucket.map((item) => item.high)),
      low: Math.min(...bucket.map((item) => item.low)),
      close: last.close,
      volume: bucket.reduce((sum, item) => sum + item.volume, 0),
    });
  }
  return out;
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
  const [quantOverlayState, setQuantOverlayState] = useState<QuantOverlayState>({
    buySellZones: true,
    volatilitySpikes: true,
    regimeShifts: true,
  });

  const renderData = useMemo(() => {
    const maxPoints = timeframe === "5Y" ? 520 : timeframe === "1Y" ? 700 : 1000;
    return downsampleCandles(data, maxPoints);
  }, [data, timeframe]);

  const visibleQuantSignals = useMemo(
    () =>
      quantSignals.filter((signal) => {
        if (signal.type === "buy_zone" || signal.type === "sell_zone") {
          return quantOverlayState.buySellZones;
        }
        if (signal.type === "volatility_spike") {
          return quantOverlayState.volatilitySpikes;
        }
        return quantOverlayState.regimeShifts;
      }),
    [quantOverlayState, quantSignals],
  );

  const computed = useMemo(() => {
    const close = renderData.map((d) => d.close);
    const typical = renderData.map((d) => (d.high + d.low + d.close) / 3);

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
      for (let i = 0; i < renderData.length; i += 1) {
        cumPV += typical[i] * renderData[i].volume;
        cumV += renderData[i].volume;
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
  }, [renderData]);

  useEffect(() => {
    setWindowStartPct(0);
    setWindowEndPct(100);
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!containerRef.current || !renderData.length) return;

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
        renderData.map((d) => ({
          time: d.time as import("lightweight-charts").Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      );
      volumeSeries.setData(
        renderData.map((d) => ({
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

      const overlayMarkers = visibleQuantSignals.map((s) => {
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
        renderData.map((d, i) => ({
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

      if (renderData.length > 20) {
        const start = Math.floor((windowStartPct / 100) * (renderData.length - 1));
        const end = Math.floor((windowEndPct / 100) * (renderData.length - 1));
        const startTime =
          renderData[Math.max(0, Math.min(start, renderData.length - 1))]?.time;
        const endTime =
          renderData[Math.max(0, Math.min(end, renderData.length - 1))]?.time;
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
    renderData,
    height,
    localIndicators.bollinger,
    localIndicators.macd,
    localIndicators.rsi,
    localIndicators.vwap,
    markers,
    visibleQuantSignals,
    symbol,
    windowEndPct,
    windowStartPct,
  ]);

  if (!renderData.length) {
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
          <button
            type="button"
            onClick={() => {
              setWindowStartPct(0);
              setWindowEndPct(100);
            }}
            className="rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground"
          >
            Reset Zoom
          </button>
        </div>
      )}

      {showControls && (
        <div className="mb-3 grid gap-2 lg:grid-cols-2">
          <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1EB8CC]">
              Technical Overlays
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-200">
              {(["rsi", "macd", "bollinger", "vwap"] as const).map((name) => (
                <label key={name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localIndicators[name]}
                    onChange={() =>
                      setLocalIndicators((prev) => ({
                        ...prev,
                        [name]: !prev[name],
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-500 bg-slate-950 accent-[#1EB8CC]"
                  />
                  <span>{name.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </div>
          {quantSignals.length > 0 && (
            <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1EB8CC]">
                Quant Signal Overlays
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-slate-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={quantOverlayState.buySellZones}
                    onChange={() =>
                      setQuantOverlayState((prev) => ({
                        ...prev,
                        buySellZones: !prev.buySellZones,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-500 bg-slate-950 accent-[#1EB8CC]"
                  />
                  <span>Buy/Sell signal zones</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={quantOverlayState.volatilitySpikes}
                    onChange={() =>
                      setQuantOverlayState((prev) => ({
                        ...prev,
                        volatilitySpikes: !prev.volatilitySpikes,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-500 bg-slate-950 accent-[#1EB8CC]"
                  />
                  <span>Volatility spike markers</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={quantOverlayState.regimeShifts}
                    onChange={() =>
                      setQuantOverlayState((prev) => ({
                        ...prev,
                        regimeShifts: !prev.regimeShifts,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-500 bg-slate-950 accent-[#1EB8CC]"
                  />
                  <span>Regime shift markers</span>
                </label>
              </div>
            </div>
          )}
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
