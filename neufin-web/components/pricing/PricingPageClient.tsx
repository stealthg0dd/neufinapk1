"use client";

import { useState } from "react";
import Link from "next/link";
import NeuFinLogo from "@/components/landing/NeuFinLogo";
import { motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { GlassCard } from "@/components/ui/GlassCard";
import { PopularPlanBadge } from "@/components/ui/PopularPlanBadge";
import toast from "react-hot-toast";
import { stripeSuccessUrlDashboard } from "@/lib/stripe-checkout-urls";

const faqs = [
  {
    q: "What payment methods do you accept?",
    a: "We bill in USD via Stripe. Major cards and supported wallets are accepted where Stripe enables them.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. You can cancel subscription from the billing portal; access continues through the end of the paid period.",
  },
  {
    q: "Is NeuFin regulated financial advice?",
    a: "No. NeuFin provides analytics and research tools for professionals. It is not personalized financial advice.",
  },
  {
    q: "Do you offer trials?",
    a: "The Advisor tier includes a 14-day trial when checkout is available. Enterprise starts with a scoping call.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <GlassCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left text-sm font-medium text-navy"
      >
        {q}
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="h-4 w-4 shrink-0 text-readable" />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <p className="px-4 pb-4 text-sm leading-relaxed text-readable">
          {a}
        </p>
      </motion.div>
    </GlassCard>
  );
}

export default function PricingPageClient() {
  const { getAccessToken } = useAuth();
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const advisorMonthly = 299;
  const entMonthly = 999;
  const advDisplay = annual
    ? Math.round((advisorMonthly * 10) / 12)
    : advisorMonthly;
  const entDisplay = annual ? Math.round((entMonthly * 10) / 12) : entMonthly;

  async function startAdvisorCheckout() {
    setCheckoutLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error("Sign in to start your trial");
        window.location.href = "/login?next=/pricing";
        return;
      }
      const origin = window.location.origin;
      const res = await apiFetch("/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({
          plan: "unlimited",
          success_url: stripeSuccessUrlDashboard(origin),
          cancel_url: `${origin}/pricing`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.detail === "string"
            ? data.detail
            : "Checkout unavailable",
        );
        return;
      }
      if (data.checkout_url) window.location.href = data.checkout_url;
      else toast.error("No checkout URL returned");
    } catch {
      toast.error("Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-app)]">
      <nav className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[4rem] flex items-center justify-between gap-3 py-1 md:min-h-[4.25rem]">
          <Link href="/" className="shrink-0 flex-none py-1">
            <NeuFinLogo variant="header" priority />
          </Link>
          <div className="flex gap-2">
            <Link href="/upload" className="btn-secondary px-3 py-2 text-sm">
              Analysis
            </Link>
            <Link href="/login" className="btn-primary px-3 py-2 text-sm">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 px-4 py-section sm:px-6">
        <div className="mx-auto mb-12 max-w-5xl text-center">
          <h1 className="mb-4 font-sans text-4xl text-navy md:text-5xl">
            Pricing
          </h1>
          <p className="mx-auto max-w-xl text-[var(--slate)]">
            Institutional workflows, without the terminal price tag.
          </p>

          <div className="relative mt-8 inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] p-1">
            <motion.div
              className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-lg border border-primary/30 bg-primary/10"
              layout
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              style={{ left: annual ? "calc(50% + 2px)" : 4 }}
            />
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`relative z-10 rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                !annual ? "text-primary" : "text-[var(--slate)]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`relative z-10 rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                annual ? "text-primary" : "text-[var(--slate)]"
              }`}
            >
              Annual
            </button>
          </div>
          {annual && (
            <p className="mt-3 text-sm font-medium text-success2">
              2 months free on paid tiers — billed annually
            </p>
          )}
        </div>

        <div className="mx-auto grid max-w-6xl items-stretch gap-6 md:grid-cols-3">
          {/* Free */}
          <GlassCard className="flex flex-col rounded-xl border border-[var(--border)] bg-white p-7 shadow-[var(--shadow-sm)]">
            <p className="mb-2 text-base font-bold uppercase tracking-wide text-navy">
              Free
            </p>
            <p className="mb-1 font-sans text-5xl font-bold text-navy">$0</p>
            <p className="mb-6 text-sm text-[var(--slate)]">per month</p>
            <ul className="mb-6 flex-1 space-y-2 text-sm leading-relaxed text-[var(--slate)]">
              {["3 DNA analyses", "Basic behavioral report", "CSV upload"].map(
                (f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success2" />
                    {f}
                  </li>
                ),
              )}
            </ul>
            <Link
              href="/upload"
              className="block w-full rounded-lg border-2 border-[var(--border)] py-3 text-center text-sm font-semibold text-navy transition-colors hover:border-primary hover:text-primary"
            >
              Start Free
            </Link>
          </GlassCard>

          {/* Advisor */}
          <GlassCard className="flex flex-col overflow-hidden rounded-xl border-2 border-primary bg-white p-0 shadow-[var(--shadow-sm)]">
            <PopularPlanBadge variant="strip" />
            <div className="flex flex-1 flex-col p-7">
              <p className="mb-2 text-base font-bold uppercase tracking-wide text-navy">
                Advisor
              </p>
              <p className="mb-1 font-sans text-5xl font-bold text-primary">
                ${advDisplay}
              </p>
              <p className="mb-6 text-sm font-medium text-[var(--slate)]">
                per month{annual ? ", billed annually" : ""}
              </p>
              <ul className="mb-6 flex-1 space-y-2 text-sm leading-relaxed text-[var(--slate)]">
                {[
                  "Unlimited analyses",
                  "10 advisor reports / mo",
                  "Multi-client workspace",
                  "API access",
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success2" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={checkoutLoading}
                onClick={startAdvisorCheckout}
                className="w-full rounded-lg bg-primary py-3 text-center text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {checkoutLoading ? "Redirecting…" : "Start 14-Day Free Trial"}
              </button>
            </div>
          </GlassCard>

          {/* Enterprise */}
          <GlassCard className="flex flex-col rounded-xl border border-[var(--border)] bg-white p-7 shadow-[var(--shadow-sm)]">
            <p className="mb-2 text-base font-bold uppercase tracking-wide text-navy">
              Enterprise
            </p>
            <p className="mb-1 font-sans text-5xl font-bold text-navy">
              ${entDisplay}
            </p>
            <p className="mb-2 text-sm text-[var(--slate)]">
              per month{annual ? ", billed annually" : ""}
            </p>
            <p className="mb-6 text-xs text-primary">
              Custom pricing available
            </p>
            <ul className="mb-6 flex-1 space-y-2 text-sm leading-relaxed text-[var(--slate)]">
              {[
                "Everything in Advisor",
                "Unlimited reports",
                "White-label",
                "Dedicated support",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success2" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/contact-sales"
              className="block w-full rounded-lg border-2 border-[var(--border)] py-3 text-center text-sm font-semibold text-navy transition-colors hover:border-primary hover:text-primary"
            >
              Contact Sales
            </Link>
          </GlassCard>
        </div>

        <div className="max-w-2xl mx-auto mt-16 space-y-3">
          <h2 className="mb-6 text-center font-sans text-2xl text-navy">FAQ</h2>
          {faqs.map((f) => (
            <FAQItem key={f.q} {...f} />
          ))}
        </div>
      </main>

      <section className="border-t border-[var(--border)] py-section px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm leading-relaxed text-readable">
            <strong className="text-[var(--slate)]">
              Regulatory Disclaimer:
            </strong>{" "}
            NeuFin provides financial data and analysis tools for informational
            and educational purposes only. This is not financial advice. Past
            performance does not indicate future results. NeuFin aligns with MAS
            guidelines on fintech and data services.
          </p>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-6 text-center text-sm text-readable">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center">
          <NeuFinLogo variant="compact" className="mb-3" />
          <span>NeuFin © {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
