"use client";

/**
 * SentryUserContext — sets the current Supabase user on the Sentry scope
 * so every error and transaction is tagged with the authenticated user's id
 * and email.
 *
 * Mount this once inside the root layout (inside <AuthProvider>).
 * It subscribes to Supabase auth state changes and forwards the identity
 * to Sentry without any extra API calls.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { supabase } from "@/lib/supabase";

export function SentryUserContext() {
  useEffect(() => {
    // Seed from the active session on mount (covers page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        Sentry.setUser({
          id: session.user.id,
          email: session.user.email ?? undefined,
        });
      } else {
        Sentry.setUser(null);
      }
    });

    // Track every auth state transition (sign-in / sign-out / token-refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        Sentry.setUser({
          id: session.user.id,
          email: session.user.email ?? undefined,
        });
      } else {
        Sentry.setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
