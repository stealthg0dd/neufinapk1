"use client";

type HeatCell = {
  time: string;
  region: string;
  regime_state: string;
  intensity: number;
  global_regime?: string;
};

type Props = {
  timeline: string[];
  regions: string[];
  cells: HeatCell[];
};

function cellColor(state: string, intensity: number): string {
  const s = (state || "").toLowerCase();
  const alpha = Math.max(0.2, Math.min(0.95, 0.2 + intensity / 12));
  if (s === "risk_off") return `rgba(220, 38, 38, ${alpha})`;
  if (s === "transition") return `rgba(245, 158, 11, ${alpha})`;
  if (s === "risk_on") return `rgba(34, 197, 94, ${alpha})`;
  return `rgba(100, 116, 139, ${alpha})`;
}

export default function RegimeHeatmap({ timeline, regions, cells }: Props) {
  const key = new Map<string, HeatCell>();
  for (const cell of cells || []) {
    key.set(`${cell.time}__${cell.region}`, cell);
  }

  const cols = Math.min(24, timeline.length);
  const shownTimeline = timeline.slice(-cols);

  return (
    <div className="rounded-xl border border-border/40 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Regime Heatmap
          </h3>
          <p className="text-xs text-muted-foreground">
            Time on x-axis, regions on y-axis, color by regime state
          </p>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-green-500" />
            Risk-On
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-amber-500" />
            Transition
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-red-500" />
            Risk-Off
          </span>
        </div>
      </div>

      {regions.length === 0 || shownTimeline.length === 0 ? (
        <div className="rounded-md border border-border/40 bg-background/40 p-4 text-sm text-muted-foreground">
          Heatmap data unavailable.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div
              className="mb-1 grid"
              style={{
                gridTemplateColumns: `120px repeat(${shownTimeline.length}, minmax(18px, 1fr))`,
              }}
            >
              <div />
              {shownTimeline.map((t) => (
                <div
                  key={t}
                  className="text-center font-mono text-xs text-muted-foreground"
                >
                  {t.slice(5)}
                </div>
              ))}
            </div>

            {regions.map((region) => (
              <div
                key={region}
                className="mb-1 grid"
                style={{
                  gridTemplateColumns: `120px repeat(${shownTimeline.length}, minmax(18px, 1fr))`,
                }}
              >
                <div className="pr-2 font-mono text-xs text-foreground">
                  {region}
                </div>
                {shownTimeline.map((t) => {
                  const c = key.get(`${t}__${region}`);
                  const bg = c
                    ? cellColor(c.regime_state, c.intensity)
                    : "rgba(51, 65, 85, 0.2)";
                  return (
                    <div
                      key={`${region}-${t}`}
                      title={
                        c
                          ? `${region} ${t} | ${c.regime_state} | intensity ${c.intensity}`
                          : `${region} ${t} | no data`
                      }
                      className="h-5 border border-black/10"
                      style={{ background: bg }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
