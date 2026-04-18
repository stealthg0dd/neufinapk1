"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import DashboardSidebar from "@/components/DashboardSidebar";
import { CommandBar } from "@/components/CommandBar";
import { CheckoutSessionSuccessFeedback } from "@/components/dashboard/CheckoutSessionSuccessFeedback";
import { TrialStatusBanner } from "@/components/dashboard/TrialStatusBanner";
import { MarketDeskRail } from "@/components/dashboard/MarketDeskRail";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";

const RAIL_STORAGE_KEY = "neufin:dashboard:marketdesk-open";

export function DashboardShell({
  children,
  regime,
}: {
  children: React.ReactNode;
  regime: unknown;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [marketDeskOpen, setMarketDeskOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(RAIL_STORAGE_KEY);
    setMarketDeskOpen(raw === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RAIL_STORAGE_KEY, marketDeskOpen ? "1" : "0");
  }, [marketDeskOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  if (loading || !user) {
    return <div className="min-h-screen bg-app" />;
  }

  return (
    <div className="flex h-screen min-w-0 overflow-x-hidden overflow-hidden bg-app text-navy">
      {/* Desktop sidebar */}
      <aside className="hidden h-full shrink-0 lg:flex">
        <DashboardSidebar user={user} />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-72 max-w-[min(18rem,88vw)] flex-col bg-white shadow-2xl">
            <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E2E8F0] px-5">
              <div className="flex items-center">
                <BrandLogo variant="sidebar" href="/dashboard" />
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-navy"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DashboardSidebar user={user} embedded />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-[#E2E8F0] bg-white px-4 lg:hidden">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#334155] transition-colors hover:bg-[#F8FAFC]"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <div className="flex items-center">
            <BrandLogo variant="sidebar" href="/dashboard" />
          </div>
        </header>
        <CommandBar
          regimeData={regime}
          onToggleCopilot={() => setMarketDeskOpen((o) => !o)}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-app py-4 md:py-6">
            <div className="page-container">
              <Suspense fallback={null}>
                <CheckoutSessionSuccessFeedback />
              </Suspense>
              <TrialStatusBanner />
              {children}
            </div>
          </main>
        </div>
      </div>
      <MarketDeskRail
        open={marketDeskOpen}
        onToggle={() => setMarketDeskOpen((o) => !o)}
      />
    </div>
  );
}
