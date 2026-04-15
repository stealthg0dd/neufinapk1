"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";

interface PlanStatus {
  subscription_tier: string;
  plan_name: string;
  price_monthly: number;
}

const PLAN_FEATURES: Record<string, string[]> = {
  retail: [
    "Unlimited DNA analyses",
    "Swarm AI analysis",
    "Portfolio alerts",
    "Mobile app access",
  ],
  advisor: [
    "Everything in Retail",
    "Multi-client dashboard",
    "White-label PDF reports (10/mo)",
    "MAS-compliant audit trail",
  ],
  enterprise: [
    "Everything in Advisor",
    "Unlimited reports",
    "Full REST API access",
    "10,000 API calls/day",
  ],
};

const PLAN_ICONS: Record<string, string> = {
  retail: "📈",
  advisor: "💼",
  enterprise: "🏦",
};

export default function PricingSuccessPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    apiGet<PlanStatus>("/api/subscription/status")
      .then((data) => {
        setPlan(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 5-second countdown then redirect to /dashboard
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          router.push("/dashboard");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, router]);

  const tier = plan?.subscription_tier || "retail";
  const features = PLAN_FEATURES[tier] || PLAN_FEATURES.retail;

  return (
    <div className="min-h-screen bg-shell-deep flex flex-col">
      <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="text-xl font-bold text-gradient">
            Neufin
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 py-section">
        <div className="w-full max-w-md text-center space-y-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 text-primary">
              <span className="inline-block w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
              <span>Confirming your plan…</span>
            </div>
          ) : (
            <>
              <div className="text-6xl mb-2">{PLAN_ICONS[tier] || "🎉"}</div>
              <div>
                <h1 className="text-3xl font-extrabold text-white mb-2">
                  Welcome to {plan?.plan_name || "NeuFin"}!
                </h1>
                <p className="text-shell-muted">
                  Your subscription is now active. Here&apos;s what you can do:
                </p>
              </div>

              <div className="glass-card space-y-3 p-6 text-left">
                {features.map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-3 text-sm text-slate-700"
                  >
                    <span className="shrink-0 text-green-600">✓</span>
                    {f}
                  </div>
                ))}
              </div>

              <div className="card text-center text-sm text-slate-600">
                Redirecting to your dashboard in{" "}
                <span className="font-semibold text-[#1EB8CC]">
                  {countdown}s
                </span>
                …
              </div>

              <div className="flex flex-col gap-2">
                <Link
                  href="/dashboard"
                  className="btn-primary text-center py-3"
                >
                  Go to Dashboard Now →
                </Link>
                <Link
                  href="/pricing"
                  className="text-sm text-shell-subtle hover:text-shell-fg/90 transition-colors"
                >
                  ← Back to Pricing
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
