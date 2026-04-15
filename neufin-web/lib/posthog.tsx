"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect, ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const PH_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const PH_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

// ── Page-view auto-capture ─────────────────────────────────────────────────────
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!ph) return;
    const url = pathname + (searchParams.toString() ? `?${searchParams}` : "");
    ph.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}

// ── Provider ───────────────────────────────────────────────────────────────────
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!PH_KEY) return;
    posthog.init(PH_KEY, {
      api_host: PH_HOST,
      capture_pageview: false, // manual via PageViewTracker
      capture_pageleave: true,
      persistence: "localStorage",
    });
  }, []);

  if (!PH_KEY) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}

// ── Typed event helpers ────────────────────────────────────────────────────────
export function useAnalytics() {
  const ph = usePostHog();

  return {
    track: (event: string, props?: Record<string, unknown>) => {
      ph?.capture(event, props);
    },
    identify: (userId: string, traits?: Record<string, unknown>) => {
      ph?.identify(userId, traits);
    },
  };
}
