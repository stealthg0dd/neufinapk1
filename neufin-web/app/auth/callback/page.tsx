"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { syncAuthCookie } from "@/lib/sync-auth-cookie";

export default function AuthCallback() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const tryRedirect = async () => {
      // Poll for the session up to 10 times (3 seconds total).
      // Supabase JS automatically exchanges the ?code= PKCE token when
      // detectSessionInUrl is true — we just need to wait for it to finish.
      for (let i = 0; i < 10; i++) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          // 1. Write neufin-auth cookie client-side (same as AuthProvider).
          //    This must happen before the hard navigation so middleware can
          //    read it on the first request to /dashboard.
          syncAuthCookie(session);

          // 2. Belt-and-suspenders: also write via server-side endpoint so
          //    the cookie is HttpOnly-safe and persists across SSR requests.
          try {
            await fetch("/api/auth/set-cookie", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              }),
            });
          } catch {
            // Non-fatal — syncAuthCookie above already covers middleware.
          }

          // 3. Hard navigate (not router.push/replace) so the browser sends a
          //    fresh full-page request with the cookie already in the jar.
          //    This avoids stale React context state from the callback page
          //    leaking into /dashboard.
          const params = new URLSearchParams(window.location.search);
          const next = params.get("next") || "/dashboard";
          window.location.replace(next);
          return;
        }

        // 300 ms between attempts
        await new Promise<void>((r) => setTimeout(r, 300));
      }

      // After 3 s with no session, redirect to login with an error flag.
      window.location.replace("/login?error=auth_timeout");
    };

    void tryRedirect();
  }, [router]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0B0F14",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "2px solid #1EB8CC",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ color: "#F0F4FF", fontSize: 15, fontWeight: 500 }}>
        Signing you in to NeuFin...
      </div>
      <div style={{ color: "#64748B", fontSize: 12 }}>
        Setting up your session
      </div>
    </div>
  );
}
