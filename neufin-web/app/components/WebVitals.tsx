"use client";

/**
 * WebVitals — reports Core Web Vitals to PostHog and (in dev) console.
 *
 * Drop this as a child of the root layout. It renders nothing visible.
 *
 * Metrics captured:
 *   LCP  — Largest Contentful Paint  (target < 2.5 s)
 *   FID  — First Input Delay         (target < 100 ms)
 *   CLS  — Cumulative Layout Shift   (target < 0.1)
 *   FCP  — First Contentful Paint    (target < 1.8 s)
 *   TTFB — Time to First Byte        (target < 800 ms)
 *   INP  — Interaction to Next Paint (target < 200 ms, replaces FID in v3)
 */

import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";
import posthog from "posthog-js";
import { logger } from "@/lib/logger";

/** Performance budget thresholds (Good / Needs Improvement / Poor) */
const BUDGET: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
};

function rating(
  name: string,
  value: number,
): "good" | "needs-improvement" | "poor" {
  const b = Object.prototype.hasOwnProperty.call(BUDGET, name)
    ? BUDGET[name as keyof typeof BUDGET]
    : undefined;
  if (!b) return "good";
  if (value <= b.good) return "good";
  if (value <= b.poor) return "needs-improvement";
  return "poor";
}

export function WebVitals() {
  useEffect(() => {
    // no-op — posthog is initialised in PostHogProvider; this component just
    // needs to mount after the provider so the posthog singleton is ready.
  }, []);

  useReportWebVitals((metric) => {
    const { name, value, id, navigationType } = metric;
    const r = rating(name, value);

    // ── Development: verbose console output ──────────────────────────────────
    if (process.env.NODE_ENV !== "production") {
      logger.debug(
        { name, value: Number(value.toFixed(2)), rating: r },
        "web_vitals.metric",
      );
    }

    // ── PostHog: structured web-vitals event ─────────────────────────────────
    if (typeof window !== "undefined" && posthog.__loaded) {
      posthog.capture("web_vital", {
        metric_name: name,
        metric_value: Math.round(name === "CLS" ? value * 1000 : value),
        metric_id: id,
        metric_rating: r,
        navigation_type: navigationType,
        page_url: window.location.pathname,
      });
    }

    // ── Sentry: tag poor vitals as performance issues ─────────────────────────
    if (r === "poor" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then(({ captureMessage, withScope }) => {
        withScope((scope) => {
          scope.setTag("web_vital", name);
          scope.setTag("vital_rating", r);
          scope.setLevel("warning");
          scope.setContext("web_vital", { name, value, id, rating: r });
          captureMessage(
            `Poor Web Vital: ${name} = ${value.toFixed(0)}ms`,
            "warning",
          );
        });
      });
    }
  });

  return null;
}
