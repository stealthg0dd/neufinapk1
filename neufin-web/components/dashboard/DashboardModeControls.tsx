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

const MODE_DESCRIPTIONS: Record<DashboardMode, string> = {
  cio: "Risk budget · Regime · Institutional metrics",
  trader: "Signal feed · Alpha · Execution metrics",
  advisor: "Client narrative · Tax harvest · Memo readiness",
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
                  "rounded-lg border px-3 py-2 text-left transition",
                  active
                    ? "border-[#1EB8CC] bg-[#E0F7FA]"
                    : "border-[#D1D5DB] bg-white hover:border-[#94A3B8]",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-xs font-semibold",
                    active ? "text-[#0B5561]" : "text-[#334155]",
                  ].join(" ")}
                >
                  {MODE_LABELS[mode]}
                </p>
                <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                  {MODE_DESCRIPTIONS[mode]}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
