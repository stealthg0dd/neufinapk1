/**
 * Logs current auth state for debugging.
 * Checks both localStorage (Supabase SDK v2 format) and the neufin-auth HTTP cookie.
 */
import { logger } from "./logger";

export function debugAuth(location: string): void {
  if (typeof window === "undefined") {
    logger.debug(
      { location, source: "server", timestamp: new Date().toISOString() },
      "auth.debug",
    );
    return;
  }

  // Supabase JS v2 stores the session at '<storageKey>-auth-token'
  const sessionRaw = localStorage.getItem("neufin-auth-auth-token");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;
  try {
    session = sessionRaw ? JSON.parse(sessionRaw) : null;
  } catch {}

  const accessToken = session?.access_token ?? null;
  const user = session?.user ?? null;
  const expiresAt = session?.expires_at ?? null;

  const cookieNames = document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0]);
  const hasCookie = cookieNames.includes("neufin-auth");

  logger.debug(
    {
      location,
      hasToken: !!accessToken,
      hasCookie,
      hasUser: !!user,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      tokenPrefix: accessToken
        ? (accessToken as string).slice(0, 20) + "..."
        : null,
      expiresAt: expiresAt
        ? new Date((expiresAt as number) * 1000).toISOString()
        : null,
      isExpired: expiresAt ? Date.now() / 1000 > (expiresAt as number) : null,
      timestamp: new Date().toISOString(),
    },
    "auth.debug",
  );
}
