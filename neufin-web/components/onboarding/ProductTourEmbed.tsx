"use client";

import { useEffect, useRef } from "react";
import { useNeufinAnalytics } from "@/lib/analytics";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-events";
import { getDemoEmbedUrl } from "@/lib/demo-environment";

/**
 * Embeds vendor product tour iframe when NEXT_PUBLIC_DEMO_EMBED_URL is set.
 * Place on /help/tutorials or dashboard onboarding slot.
 */
export function ProductTourEmbed() {
  const { capture } = useNeufinAnalytics();
  const src = getDemoEmbedUrl();
  const launched = useRef(false);

  useEffect(() => {
    if (!src || launched.current) return;
    launched.current = true;
    capture(ONBOARDING_EVENTS.productTourLaunched, { src });
  }, [capture, src]);

  if (!src) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center text-sm text-readable">
        <p className="font-medium text-navy">Interactive tour</p>
        <p className="mt-2 max-w-md mx-auto">
          Set <code className="text-xs">NEXT_PUBLIC_DEMO_EMBED_URL</code> to your
          Storylane, Arcade, or Navattic embed URL. The app stays vendor-agnostic.
        </p>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black/5 shadow-sm">
      <iframe
        title="Product tour"
        src={src}
        className="h-full min-h-[360px] w-full"
        allow="clipboard-write"
      />
    </div>
  );
}
