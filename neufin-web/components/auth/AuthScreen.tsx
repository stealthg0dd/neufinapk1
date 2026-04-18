"use client";

import { Suspense, useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { claimAnonymousRecord } from "@/lib/api";
import { useNeufinAnalytics } from "@/lib/analytics";
import { GlassCard } from "@/components/ui/GlassCard";
import { BrandLogo } from "@/components/BrandLogo";

async function claimPendingRecord(token: string) {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem("dnaResult");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    const recordId = parsed?.record_id;
    if (recordId && !parsed?.user_id_claimed) {
      await claimAnonymousRecord(recordId, token);
      localStorage.setItem(
        "dnaResult",
        JSON.stringify({ ...parsed, user_id_claimed: true }),
      );
    }
  } catch {
    /* ignore */
  }
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthScreen({
  initialMode,
}: {
  initialMode: "login" | "signup";
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      }
    >
      <AuthScreenInner initialMode={initialMode} />
    </Suspense>
  );
}

function AuthScreenInner({ initialMode }: { initialMode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { capture } = useNeufinAnalytics();

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const next = searchParams.get("next") || "/dashboard";
  const oauthError = searchParams.get("error");
  const [hasPending, setHasPending] = useState(false);
  useEffect(() => {
    try {
      setHasPending(
        !!JSON.parse(localStorage.getItem("dnaResult") || "null")?.record_id,
      );
    } catch {
      setHasPending(false);
    }
  }, []);

  useEffect(() => {
    if (oauthError) setError(decodeURIComponent(oauthError));
  }, [oauthError]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
          session?.access_token
        ) {
          await claimPendingRecord(session.access_token);
          router.replace(next);
        }
      },
    );
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  async function handleGoogle() {
    setLoading(true);
    setError("");
    sessionStorage.setItem("neufin_auth_method", "google");
    // Always redirect to the canonical domain so the Supabase OAuth callback
    // URL is consistent regardless of which domain the user started on
    // (neufin.ai, www.neufin.ai, or neufin-web.vercel.app).
    // A mismatched redirectTo causes Supabase to fall back to implicit flow
    // (landing on /#access_token= instead of /auth/callback?code=).
    const CANONICAL_ORIGIN = "https://www.neufin.ai";
    const redirectTo = `${CANONICAL_ORIGIN}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: false,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        capture("user_signed_up", { method: "email" });
        setSent(true);
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) {
          const msg = err.message?.toLowerCase() ?? "";
          if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
            throw new Error(
              "Please confirm your email before signing in. Check your inbox for the confirmation link.",
            );
          }
          if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
            throw new Error("Incorrect email or password. Please try again.");
          }
          if (msg.includes("too many requests") || msg.includes("rate_limit")) {
            throw new Error("Too many sign-in attempts. Please wait a moment and try again.");
          }
          throw err;
        }
        capture("user_logged_in", { method: "email" });
        if (data.session?.access_token)
          await claimPendingRecord(data.session.access_token);
        router.replace(next);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-app flex flex-col items-center justify-center p-6">
        <GlassCard className="w-full max-w-md p-8 text-center space-y-4">
          <div className="text-4xl" aria-hidden>
            ✉️
          </div>
          <h1 className="font-sans text-2xl text-[var(--text-primary)]">
            Check your email
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            We sent a confirmation link to {email}. Confirm then sign in.
          </p>
          {hasPending && (
            <p className="text-xs text-primary bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
              Your portfolio analysis will link to your account when you
              confirm.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError("");
              setEmail("");
            }}
            className="text-sm text-[var(--readable-muted)] hover:text-[var(--text-body)] transition-colors"
          >
            ← Try a different email
          </button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center p-6 neufin-grid-bg">
      <motion.div
        layout
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        <GlassCard className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <BrandLogo variant="marketing-compact" href="/" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {mode === "login"
                ? "Sign in to NeuFin"
                : "Create your NeuFin account"}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {hasPending
                ? "Sign in to save your portfolio analysis across devices."
                : "Institutional-grade behavioral intelligence, one account."}
            </p>
          </div>

          <motion.button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-lg bg-white text-navy font-semibold text-sm disabled:opacity-50"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-shell-muted border-t-navy rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </motion.button>

          <div className="flex items-center gap-3 text-xs text-[var(--readable-muted)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            or continue with email
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/25 rounded-lg px-4 py-3"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <form onSubmit={handlePassword} className="space-y-4">
            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs text-[var(--text-secondary)] mb-1.5"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--glass-border)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--readable-muted)] focus-amber"
              />
            </div>
            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs text-[var(--text-secondary)] mb-1.5"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--glass-border)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--readable-muted)] focus-amber"
              />
            </div>

            <motion.div layout className="pt-1">
              <motion.button
                type="submit"
                disabled={loading}
                whileTap={{ scale: 0.99 }}
                className="w-full py-3 rounded-lg bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : mode === "login" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </motion.button>
            </motion.div>
          </form>

          <motion.div
            layout
            className="text-center text-sm text-[var(--text-body)]"
          >
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <Link
                  href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="text-primary font-medium hover:underline"
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link
                  href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </Link>
              </>
            )}
          </motion.div>

          <p className="text-center text-xs text-[var(--readable-muted)]">
            By continuing you agree to our{" "}
            <Link
              href="/privacy"
              className="text-[var(--text-body)] underline underline-offset-2 hover:text-[var(--text-primary)]"
            >
              Privacy Policy
            </Link>
          </p>
        </GlassCard>

        <p className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-[var(--readable-muted)] hover:text-[var(--text-body)]"
          >
            ← Back to home
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
