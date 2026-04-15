/* eslint-disable no-console */

"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

// Only rendered in development — zero bundle cost in production.
export function AuthDebugPanel() {
  const { user, token, loading } = useAuth();
  const pathname = usePathname();

  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [hasCookie, setHasCookie] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [cookieTokenLength, setCookieTokenLength] = useState<number | null>(
    null,
  );
  const [localStorageTokenLength, setLocalStorageTokenLength] = useState<
    number | null
  >(null);
  const [tokensMatch, setTokensMatch] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = getSupabaseClient();
    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        const sessionToken = session?.access_token ?? null;
        setSessionKey(sessionToken ? "supabase-session" : null);
        setLocalStorageTokenLength(
          typeof sessionToken === "string" ? sessionToken.length : null,
        );
        if (typeof session?.expires_at === "number") {
          setExpiresAt(new Date(session.expires_at * 1000).toISOString());
        }

        // Check neufin-auth cookie (what middleware reads)
        const cookieEntries = Object.fromEntries(
          document.cookie
            .split(";")
            .map((cookie) => cookie.trim())
            .filter(Boolean)
            .map((cookie) => {
              const [key, ...value] = cookie.split("=");
              return [key, value.join("=")];
            }),
        );
        const cookieToken = cookieEntries["neufin-auth"] ?? null;
        setHasCookie(Boolean(cookieToken));
        setCookieTokenLength(cookieToken?.length ?? null);

        setTokensMatch(
          typeof cookieToken === "string" &&
            typeof sessionToken === "string" &&
            cookieToken === sessionToken,
        );
      })
      .catch(() => setTokensMatch(null));
  }, [token]); // re-read on every token change

  if (process.env.NODE_ENV !== "development") return null;

  const statusColor =
    !loading && user
      ? "text-green-400"
      : loading
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div
      style={{ zIndex: 99999 }}
      className="fixed bottom-4 right-4 bg-black/95 border border-shell-border text-white rounded-lg text-xs max-w-xs shadow-2xl"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-shell-border cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="font-bold text-shell-fg/90">🔐 Auth Debug</span>
        <span className={`font-mono ${statusColor}`}>
          {loading ? "⏳ loading" : user ? "✅ authed" : "❌ guest"}
        </span>
        <span className="text-shell-subtle ml-2">{expanded ? "▼" : "▲"}</span>
      </div>

      {expanded && (
        <div className="px-3 py-2 space-y-1 font-mono">
          <Row label="Path" value={pathname} />
          <Row label="User ID" value={user?.id ?? "null"} dim={!user?.id} />
          <Row label="Email" value={user?.email ?? "null"} dim={!user?.email} />
          <Row
            label="JWT token"
            value={token ? `${token.slice(0, 16)}…` : "missing"}
            dim={!token}
            ok={!!token}
          />
          <Row
            label="localStorage"
            value={sessionKey ? "✓ supabase session present" : "✗ missing"}
            ok={!!sessionKey}
            dim={!sessionKey}
          />
          <Row
            label="Cookie"
            value={
              hasCookie ? "✓ neufin-auth set" : "✗ missing (middleware blind!)"
            }
            ok={hasCookie}
            dim={!hasCookie}
          />
          <Row
            label="Cookie len"
            value={cookieTokenLength?.toString() ?? "missing"}
            ok={typeof cookieTokenLength === "number"}
            dim={typeof cookieTokenLength !== "number"}
          />
          <Row
            label="Storage len"
            value={localStorageTokenLength?.toString() ?? "missing"}
            ok={typeof localStorageTokenLength === "number"}
            dim={typeof localStorageTokenLength !== "number"}
          />
          <Row
            label="Tokens match"
            value={
              tokensMatch === null
                ? "unknown"
                : tokensMatch
                  ? "✓ equal"
                  : "✗ mismatch"
            }
            ok={tokensMatch === true}
            dim={tokensMatch === null}
          />
          {expiresAt && (
            <Row
              label="Expires"
              value={
                new Date(expiresAt) < new Date()
                  ? `⚠ EXPIRED ${expiresAt}`
                  : expiresAt
              }
              ok={new Date(expiresAt) >= new Date()}
            />
          )}

          <div className="pt-1 flex gap-2">
            <button
              onClick={() => {
                const supabase = createClient();
                void supabase.auth
                  .getSession()
                  .then(({ data: { session } }) => {
                    const cookieMap = Object.fromEntries(
                      document.cookie.split(";").map((c) => {
                        const [k, ...v] = c.trim().split("=");
                        return [k, v.join("=")];
                      }),
                    );
                    console.group("[AUTH DEBUG] Full state snapshot");
                    console.log("User:", user);
                    console.log("Token (first 40):", token?.slice(0, 40));
                    console.log("Session (supabase):", session);
                    console.log("Cookies:", cookieMap);
                    console.groupEnd();
                  });
              }}
              className="bg-primary hover:bg-primary px-2 py-1 rounded transition-colors"
            >
              Log State
            </button>
            <button
              onClick={() => {
                // Force re-sync the cookie from Supabase session
                const supabase = createClient();
                void supabase.auth
                  .getSession()
                  .then(({ data: { session } }) => {
                    if (session?.access_token) {
                      const maxAge = session.expires_in ?? 3600;
                      document.cookie = `neufin-auth=${session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
                      setHasCookie(true);
                      console.log("[AUTH DEBUG] Cookie manually synced ✓");
                    }
                  });
              }}
              className="bg-orange-600 hover:bg-orange-500 px-2 py-1 rounded transition-colors"
            >
              Sync Cookie
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  dim = false,
  ok,
}: {
  label: string;
  value: string;
  dim?: boolean;
  ok?: boolean;
}) {
  const valueColor =
    ok === true
      ? "text-green-400"
      : ok === false
        ? "text-red-400"
        : dim
          ? "text-shell-subtle"
          : "text-shell-fg/90";
  return (
    <div className="flex justify-between gap-2">
      <span className="text-shell-subtle shrink-0">{label}:</span>
      <span className={`${valueColor} truncate text-right`}>{value}</span>
    </div>
  );
}
