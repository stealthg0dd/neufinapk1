/**
 * Sentry edge-runtime initialisation (Vercel Edge / middleware).
 * Called from instrumentation.ts when runtime === "edge".
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  environment: process.env.APP_ENV ?? "production",
  release:
    process.env.SENTRY_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "unknown",
  enabled: Boolean(process.env.SENTRY_DSN),
});

Sentry.setTag("service", "neufin-web");
Sentry.setTag("company", "neufin");
