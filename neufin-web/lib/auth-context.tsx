"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { supabase, attachSupabaseAuthDebug, type AuthUser } from "./supabase";
import { debugAuth } from "./auth-debug";
import { syncAuthCookie } from "./sync-auth-cookie";
import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Cached JWT — updated on every auth state change including TOKEN_REFRESHED */
  token: string | null;
  /**
   * Returns a guaranteed-fresh access token by calling getSession() at call-time.
   * The Supabase SDK auto-refreshes the token if it is expired or near expiry.
   * Use this for API calls where token staleness could cause a 401.
   */
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  token: null,
  getAccessToken: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    debugAuth("AuthProvider:mount");
    let listener: { subscription: { unsubscribe: () => void } } | null = null;
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    const detachSupabaseDebug = attachSupabaseAuthDebug();

    const run = async () => {
      // Extract hash tokens BEFORE any component can clear them
      if (typeof window !== "undefined") {
        const hash = window.location.hash;
        if (hash.includes("access_token=")) {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            // Clear hash immediately so no other component races with us
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
            // Set session synchronously before any other auth code runs
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        }
      }

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        logger.debug(
          {
            event,
            hasSession: Boolean(session),
            hasToken: Boolean(session?.access_token),
            userId: session?.user?.id ?? null,
          },
          "auth.state_change",
        );
        setUser(session?.user ?? null);
        setToken(session?.access_token ?? null);
        setIsLoading(false);
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          syncAuthCookie(session ?? null);
        }
        if (event === "SIGNED_OUT") {
          syncAuthCookie(null);
          setUser(null);
        }
        debugAuth(`AuthProvider:${event}`);
        if (session?.user) {
          Sentry.setUser({ id: session.user.id, email: session.user.email });
        } else {
          Sentry.setUser(null);
        }
      });
      listener = data;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      logger.debug(
        {
          hasSession: Boolean(session),
          hasToken: Boolean(session?.access_token),
          userId: session?.user?.id ?? null,
        },
        "auth.initial_session",
      );
      setUser(session?.user ?? null);
      setToken(session?.access_token ?? null);
      setIsLoading(false);
      syncAuthCookie(session ?? null);
      debugAuth("AuthProvider:getSession");

      refreshInterval = setInterval(
        async () => {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            logger.debug(
              { userId: data.session.user?.id ?? null },
              "auth.proactive_refresh",
            );
            syncAuthCookie(data.session);
            setToken(data.session.access_token);
          }
        },
        5 * 60 * 1000,
      );
    };

    void run();

    return () => {
      listener?.subscription.unsubscribe();
      if (refreshInterval) clearInterval(refreshInterval);
      detachSupabaseDebug();
    };
  }, []);

  const signOut = async () => {
    syncAuthCookie(null);
    await supabase.auth.signOut();
  };

  /**
   * Always fetches via getSession() so the SDK can silently refresh an expired
   * token before returning it.  Falls back to the cached token if getSession
   * fails (e.g. offline), so callers always get the best available value.
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getSession();
      const fresh = data.session?.access_token ?? null;
      if (fresh) setToken(fresh);
      return fresh;
    } catch {
      return token;
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{ user, loading: isLoading, signOut, token, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
