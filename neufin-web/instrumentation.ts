/**
 * instrumentation.ts — Next.js 15+ instrumentation hook.
 *
 * Initialises Sentry for the Node.js and Edge runtimes.  The client-side
 * counterpart lives in sentry.client.config.ts (loaded automatically by
 * the @sentry/nextjs webpack plugin via withSentryConfig in next.config.js).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(
  err: unknown,
  // Next.js 15 passes { path, method, headers }; Sentry v10 accepts RequestInfo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any,
  context: { routeType: string },
) {
  const { captureRequestError } = await import("@sentry/nextjs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  captureRequestError(err, request, context as any);
}

