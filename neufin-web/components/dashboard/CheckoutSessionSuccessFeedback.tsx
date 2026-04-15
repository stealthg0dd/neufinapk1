"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, Sparkles, X } from "lucide-react";

/**
 * After Stripe Checkout, success_url lands on /dashboard?session_id=…
 * Shows toast + dismissible banner while the webhook upgrades the profile.
 */
export function CheckoutSessionSuccessFeedback() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const handledRef = useRef(false);
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId || handledRef.current) return;
    handledRef.current = true;

    setBanner(true);
    toast.success("Payment successful — your plan is updating now.", {
      duration: 6000,
      icon: "✓",
    });

    const next = new URLSearchParams(searchParams.toString());
    next.delete("session_id");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  if (!banner) return null;

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-4 py-3 text-sm text-foreground shadow-sm"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
        <Sparkles className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="flex items-center gap-2 font-medium text-emerald-100">
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-emerald-400"
            aria-hidden
          />
          Payment successful
        </p>
        <p className="mt-1 text-muted-foreground leading-relaxed">
          Thanks for subscribing. Your advisor access is activating in the
          background — refresh in a moment if features don&apos;t unlock right
          away.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setBanner(false)}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
