"use client";

import type { DashboardMode } from "@/hooks/useDashboardPowerMode";

type Props = {
  advancedQuantMode: boolean;
  dashboardMode: DashboardMode;
  onToggleAdvanced: (enabled: boolean) => void;
  onModeChange: (mode: DashboardMode) => void;
};

const MODE_LABELS: Record<DashboardMode, string> = {
  cio: "CIO Mode",
  trader: "Trader Mode",
  advisor: "Advisor Mode",
};

export default function DashboardModeControls({
  advancedQuantMode,
  dashboardMode,
  onToggleAdvanced,
  onModeChange,
}: Props) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
            Dashboard Control
          </p>
          <h3 className="text-[16px] font-semibold text-[#0F172A]">
            Enable Advanced Quant Mode
          </h3>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-3 self-start md:self-center">
          <input
            type="checkbox"
            checked={advancedQuantMode}
            onChange={(e) => onToggleAdvanced(e.target.checked)}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-[#1EB8CC]">
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
          </span>
          <span className="text-sm font-medium text-[#334155]">
            {advancedQuantMode ? "On" : "Off"}
          </span>
        </label>
      </div>

      {advancedQuantMode ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["cio", "trader", "advisor"] as DashboardMode[]).map((mode) => {
            const active = dashboardMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onModeChange(mode)}
                className={[
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  active
                    ? "border-[#1EB8CC] bg-[#E0F7FA] text-[#0B5561]"
                    : "border-[#D1D5DB] bg-white text-[#334155] hover:border-[#94A3B8]",
                ].join(" ")}
              >
                {MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
