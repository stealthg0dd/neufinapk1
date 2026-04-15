"use client";

/**
 * UpgradeModal — shown when a 402 response is received (limit reached).
 *
 * Listens to the global 'subscription:required' CustomEvent dispatched by
 * authFetch in lib/api.ts, then renders an upgrade prompt.
 *
 * Usage: mount once in a layout / root component:
 *   <UpgradeModal />
 */

import { useEffect, useState } from "react";
import { apiPost } from "@/lib/api-client";
import { stripeSuccessUrlDashboard } from "@/lib/stripe-checkout-urls";

const PLAN_OPTIONS = [
  {
    id: "retail",
    name: "Retail Investor",
    price: 29,
    period: "/mo",
    description: "Unlimited DNA analyses + Swarm AI",
    priceId: "price_1TIuPkGVXReXuoyMrADQfcSQ",
    highlight: false,
  },
  {
    id: "advisor",
    name: "Financial Advisor",
    price: 299,
    period: "/mo",
    description: "Multi-client + white-label PDF reports",
    priceId: "price_1TIuPlGVXReXuoyMICYnUmXR",
    highlight: true,
  },
];

export default function UpgradeModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("retail");

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("subscription:required", handler);
    return () => window.removeEventListener("subscription:required", handler);
  }, []);

  async function handleUpgrade() {
    const plan = PLAN_OPTIONS.find((p) => p.id === selectedPlan);
    if (!plan) return;

    setLoading(true);
    try {
      const origin = window.location.origin;
      const data = await apiPost<{ checkout_url?: string }>(
        "/api/reports/checkout",
        {
          plan: selectedPlan,
          price_id: plan.priceId,
          success_url: stripeSuccessUrlDashboard(origin),
          cancel_url: `${origin}/pricing`,
        },
      );
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="glass-card animate-modal-panel w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Upgrade your plan
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              You&apos;ve reached your monthly limit
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xl leading-none text-slate-400 transition-colors hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-600">
            Choose a plan to continue with unlimited analyses and advanced
            features:
          </p>

          {/* Plan options */}
          <div className="space-y-3">
            {PLAN_OPTIONS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full rounded-xl border p-4 text-left transition-all duration-150 ${
                  selectedPlan === plan.id
                    ? "border-[#1EB8CC] bg-[#1EB8CC]/8"
                    : "border-gray-200 hover:border-gray-300"
                } ${plan.highlight ? "ring-1 ring-[#1EB8CC]/25" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {plan.name}
                      </span>
                      {plan.highlight && (
                        <span className="rounded-full bg-[#1EB8CC] px-2 py-0.5 text-xs font-semibold text-white">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {plan.description}
                    </p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <span className="text-lg font-bold text-slate-900">
                      ${plan.price}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {plan.period}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full btn-primary py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Redirecting to checkout…
              </>
            ) : (
              "Upgrade Now →"
            )}
          </button>

          <p className="text-center text-xs text-slate-500">
            Secured by Stripe · Cancel anytime · Instant access
          </p>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.location.href = "/pricing";
              }}
              className="text-xs font-medium text-[#1EB8CC] transition-colors hover:text-[#189fb2]"
            >
              See all plans →
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-500 transition-colors hover:text-slate-700"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
