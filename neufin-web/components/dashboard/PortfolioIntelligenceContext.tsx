"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePortfolioData } from "@/hooks/usePortfolioData";

type PortfolioIntel = ReturnType<typeof usePortfolioData>;

const PortfolioIntelligenceContext = createContext<PortfolioIntel | null>(
  null,
);

export function PortfolioIntelligenceProvider({ children }: { children: ReactNode }) {
  const value = usePortfolioData();
  return (
    <PortfolioIntelligenceContext.Provider value={value}>
      {children}
    </PortfolioIntelligenceContext.Provider>
  );
}

export function usePortfolioIntelligence(): PortfolioIntel {
  const ctx = useContext(PortfolioIntelligenceContext);
  if (!ctx) {
    throw new Error(
      "usePortfolioIntelligence must be used within PortfolioIntelligenceProvider",
    );
  }
  return ctx;
}
