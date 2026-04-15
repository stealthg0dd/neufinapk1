/**
 * Sentry client-side initialisation (browser).
 * Loaded automatically by @sentry/nextjs via next.config.js withSentryConfig.
 * All values are sourced from NEXT_PUBLIC_SENTRY_DSN (public — safe to expose).
 */
import * as Sentry from "@sentry/nextjs";

const _SENSITIVE = new Set(["password", "token", "api_key", "fernet_key"]);

function scrubObject(obj: unknown): unknown {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        _SENSITIVE.has(k.toLowerCase()) ? "[REDACTED]" : scrubObject(v),
      ]),
    );
  }
  if (Array.isArray(obj)) return obj.map(scrubObject);
  return obj;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Trace a random 10 % of navigations/requests in production.
  // Set NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0 in staging.
  tracesSampleRate: parseFloat(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
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

  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? "unknown",

  // Only initialise when a DSN is configured — keeps local dev noise-free.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  initialScope: {
    tags: { service: "neufin-web", company: "neufin" },
  },

  beforeSend(event) {
    if (event.request)
      event.request = scrubObject(event.request) as typeof event.request;
    if (event.extra)
      event.extra = scrubObject(event.extra) as typeof event.extra;
    return event;
  },
});
