import type { SubscriptionInfo } from "@/lib/api";

/** True when the user can use advisor-mode surfaces (tier, role, or internal admin). */
export function canAccessAdvisorProduct(sub: SubscriptionInfo | null): boolean {
  if (!sub) return false;
  if (sub.is_admin === true) return true;
  const role = (sub.role ?? "").toLowerCase();
  if (role === "advisor" || role === "admin") return true;
  return sub.subscription_tier === "advisor" || sub.subscription_tier === "enterprise";
}
