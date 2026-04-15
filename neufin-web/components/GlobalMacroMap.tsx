"use client";

import { useMemo, useState } from "react";

type RegionRow = {
  region: string;
  sentiment: number;
  volatility: number;
  regime: string;
  latest_signal?: {
    title?: string;
    signal_type?: string;
    value?: number;
    date?: string;
  };
};

type Props = {
  regions: RegionRow[];
};

type RegionShape = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
};

const SHAPES: RegionShape[] = [
  { key: "US", x: 62, y: 78, w: 62, h: 30, label: "US" },
  { key: "GLOBAL", x: 138, y: 72, w: 50, h: 24, label: "Global" },
  { key: "EU", x: 200, y: 74, w: 44, h: 24, label: "EU" },
  { key: "UK", x: 188, y: 70, w: 12, h: 12, label: "UK" },
  { key: "SG", x: 292, y: 136, w: 16, h: 12, label: "SG" },
  { key: "SEA", x: 276, y: 124, w: 28, h: 20, label: "SEA" },
  { key: "CN", x: 280, y: 94, w: 44, h: 28, label: "CN" },
  { key: "JP", x: 334, y: 94, w: 18, h: 20, label: "JP" },
  { key: "AU", x: 318, y: 148, w: 44, h: 24, label: "AU" },
];

function tone(sentiment: number, volatility: number, regime: string): string {
  const s = Math.max(-10, Math.min(10, sentiment || 0));
  const v = Math.max(0, Math.min(12, volatility || 0));
  const r = (regime || "").toLowerCase();

  if (
    r.includes("risk_off") ||
    r.includes("risk-off") ||
    r.includes("recession")
  ) {
    if (v > 6) return "#8b1f1f";
    return "#b45309";
  }
  if (s > 1.5 && v < 3.5) return "#166534";
  if (s < -1.5 && v > 4.5) return "#7f1d1d";
  if (v > 5.5) return "#9a3412";
  return "#334155";
}

function sentimentLabel(v: number): string {
  if (v > 1.2) return "Constructive";
  if (v < -1.2) return "Defensive";
  return "Balanced";
}

export default function GlobalMacroMap({ regions }: Props) {
  const [hover, setHover] = useState<RegionRow | null>(null);

  const byRegion = useMemo(() => {
    const map = new Map<string, RegionRow>();
    for (const r of regions || []) {
      map.set(String(r.region || "").toUpperCase(), r);
    }
    return map;
  }, [regions]);

  return (
    <div className="rounded-xl border border-border/40 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Global Macro Map
          </h3>
          <p className="text-xs text-muted-foreground">
            Sentiment, volatility, and regime intensity by region
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Hover regions for macro detail
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-border/40 bg-[#0b1220] p-3">
        <svg viewBox="0 0 380 190" className="h-56 w-full">
          <defs>
            <linearGradient id="macroOcean" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#111827" />
            </linearGradient>
          </defs>
          <rect
            x="0"
            y="0"
            width="380"
            height="190"
            fill="url(#macroOcean)"
            rx="8"
          />

          {SHAPES.map((shape) => {
            const row = byRegion.get(shape.key);
            const fill = row
              ? tone(row.sentiment, row.volatility, row.regime)
              : "#1f2937";
            return (
              <g key={shape.key}>
                <rect
                  x={shape.x}
                  y={shape.y}
                  width={shape.w}
                  height={shape.h}
                  rx="4"
                  fill={fill}
                  stroke="#94a3b8"
                  strokeOpacity="0.25"
                  onMouseEnter={() =>
                    setHover(
                      row || {
                        region: shape.key,
                        sentiment: 0,
                        volatility: 0,
                        regime: "neutral",
                      },
                    )
                  }
                  onMouseLeave={() => setHover(null)}
                />
                <text
                  x={shape.x + shape.w / 2}
                  y={shape.y + shape.h / 2 + 4}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#e2e8f0"
                >
                  {shape.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="mt-3 rounded-md border border-border/40 bg-black/25 p-2 text-xs text-slate-200">
          {hover ? (
            <div className="grid gap-1 sm:grid-cols-2">
              <div>
                <span className="text-slate-400">Region:</span> {hover.region}
              </div>
              <div>
                <span className="text-slate-400">Regime:</span>{" "}
                {hover.regime || "neutral"}
              </div>
              <div>
                <span className="text-slate-400">Sentiment:</span>{" "}
                {sentimentLabel(hover.sentiment)} (
                {hover.sentiment?.toFixed?.(2) ?? 0})
              </div>
              <div>
                <span className="text-slate-400">Volatility:</span>{" "}
                {hover.volatility?.toFixed?.(2) ?? 0}
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400">Latest signal:</span>{" "}
                {hover.latest_signal?.title || "No recent signal"}
              </div>
            </div>
          ) : (
            <span className="text-slate-300">
              Move over a region to inspect live macro context.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
