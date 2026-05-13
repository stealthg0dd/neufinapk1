/**
 * Canonical full-access check for paywalls (dashboard, portfolio, swarm, reports).
 * Normalizes plan/status fields from /api/subscription/status and /api/vault/subscription.
 */

export type SubscriptionAccessInput = {
  plan?: string;
  subscription_tier?: string;
  status?: string;
  subscription_status?: string;
  days_remaining?: number | null;
  trial_days_remaining?: number | null;
  is_admin?: boolean;
  /** Set by /api/vault/subscription for trial window + paid (server-computed). */
  is_pro?: boolean;
  /** Server-computed from GET /api/subscription/status or /api/vault/subscription. */
  has_full_access?: boolean;
};

export function hasFullAccess(
  subscription: SubscriptionAccessInput | null | undefined,
): boolean {
  if (!subscription) return false;

  if (subscription.has_full_access === true) return true;

  if (subscription.is_admin) return true;

  if (subscription.is_pro === true) return true;

  const plan = (
    subscription.plan ??
    subscription.subscription_tier ??
    "free"
  )
    .toString()
    .toLowerCase();

  const status = (
    subscription.status ??
    subscription.subscription_status ??
    ""
  )
    .toString()
    .toLowerCase();

  if (
    status === "active" &&
    ["enterprise", "advisor", "retail"].includes(plan)
  ) {
    return true;
  }

  const days =
    subscription.trial_days_remaining ?? subscription.days_remaining ?? null;
  if (status === "trial" && typeof days === "number" && days > 0) {
    return true;
  }

  return false;
}
