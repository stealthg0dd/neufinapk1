/**
 * instrumentation.ts — Next.js 15+ instrumentation hook.
 *
 * This file is required by Next.js 15+ to resolve the
 * `private-next-instrumentation-client` internal module.
 * Add SDK initialisation here if needed (e.g. OpenTelemetry).
 */
export async function register() {
  // No-op: no server-side instrumentation configured yet.
}

export async function onRequestError(
  _err: unknown,
  _request: { path: string; method: string },
  _context: { routeType: string },
) {
  // No-op: extend here to forward errors to an error-tracking service.
}
