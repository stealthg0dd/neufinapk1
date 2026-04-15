"use client";

import { useEffect, useState } from "react";

export type DashboardMode = "cio" | "trader" | "advisor";

const ADVANCED_QUANT_KEY = "neufin:advanced-quant-mode";
const DASHBOARD_MODE_KEY = "neufin:dashboard-mode";

export function useDashboardPowerMode() {
  const [advancedQuantMode, setAdvancedQuantMode] = useState(false);
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("cio");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const advancedRaw = window.localStorage.getItem(ADVANCED_QUANT_KEY);
    const modeRaw = window.localStorage.getItem(DASHBOARD_MODE_KEY);
    setAdvancedQuantMode(advancedRaw === "1");
    if (modeRaw === "cio" || modeRaw === "trader" || modeRaw === "advisor") {
      setDashboardMode(modeRaw);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADVANCED_QUANT_KEY, advancedQuantMode ? "1" : "0");
  }, [advancedQuantMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_MODE_KEY, dashboardMode);
  }, [dashboardMode]);

  return {
    advancedQuantMode,
    setAdvancedQuantMode,
    dashboardMode,
    setDashboardMode,
  };
}
