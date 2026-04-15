"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Disables browser scroll-restoration and forces the window to the top
 * on every route change. Rendered as the first child of RootLayout so it
 * runs before any page content is painted.
 *
 * Root cause for landing-page scroll jump: LandingMarketChatPanel's
 * scrollIntoView was the primary fix, but this component provides a
 * belt-and-suspenders guarantee for any future components that might
 * call scrollIntoView or anchor-navigate on mount.
 */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    // Disable browser scroll restoration so Back/Forward navigation
    // doesn't remember position and jump users mid-page.
    if (typeof window !== "undefined" && history.scrollRestoration) {
      history.scrollRestoration = "manual";
    }
    // Force scroll to top on every navigation.
    // 'instant' avoids a visual flash that 'smooth' would cause.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
