/**
 * Client-side feature flags (NEXT_PUBLIC_*).
 * When env vars are missing, features stay off — no behavior change until explicitly enabled.
 */
export function isAdvisorModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_ADVISOR_MODE === "true";
}

export function isPlaidConnectEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PLAID_CONNECT === "true";
}
