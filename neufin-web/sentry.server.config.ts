/**
 * Sentry server-side initialisation (Node.js runtime).
 * Called from instrumentation.ts when runtime === "nodejs".
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
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),

  environment: process.env.APP_ENV ?? "production",

  release:
    process.env.SENTRY_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "unknown",

  enabled: Boolean(process.env.SENTRY_DSN),

  beforeSend(event) {
    if (event.request)
      event.request = scrubObject(event.request) as typeof event.request;
    if (event.extra)
      event.extra = scrubObject(event.extra) as typeof event.extra;
    return event;
  },
});

Sentry.setTag("service", "neufin-web");
Sentry.setTag("company", "neufin");
