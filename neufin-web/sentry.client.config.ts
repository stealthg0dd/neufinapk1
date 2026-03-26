/**
 * Sentry client-side initialisation (browser).
 * Loaded automatically by @sentry/nextjs via next.config.js withSentryConfig.
 * All values are sourced from NEXT_PUBLIC_SENTRY_DSN (public — safe to expose).
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Trace a random 10 % of navigations/requests in production.
  // Set NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0 in staging.
  tracesSampleRate: parseFloat(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
  ),

  // Record 10 % of sessions for Session Replay (increases when an error occurs).
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default — avoids capturing PII.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "production",

  // Only initialise when a DSN is configured — keeps local dev noise-free.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
