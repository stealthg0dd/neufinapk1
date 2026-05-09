/**
 * Client-only feature flags (NEXT_PUBLIC_*). Safe at build time when unset.
 */
export function isAdvisorModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_ADVISOR_MODE === "true";
}

export function isPlaidConnectEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PLAID_CONNECT === "true";
}
