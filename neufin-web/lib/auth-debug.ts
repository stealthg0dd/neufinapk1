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
  let session: unknown = null;
  try {
    session = sessionRaw ? JSON.parse(sessionRaw) : null;
  } catch {
    session = null;
  }

  const sessObj =
    typeof session === "object" && session !== null
      ? (session as Record<string, unknown>)
      : null;
  const accessToken =
    typeof sessObj?.access_token === "string" ? sessObj.access_token : null;
  const userRaw = sessObj?.user;
  const userRec =
    typeof userRaw === "object" && userRaw !== null
      ? (userRaw as Record<string, unknown>)
      : null;
  const userId = typeof userRec?.id === "string" ? userRec.id : null;
  const userEmail = typeof userRec?.email === "string" ? userRec.email : null;
  const expiresAt = sessObj?.expires_at ?? null;

  const cookieNames = document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0]);
  const hasCookie = cookieNames.includes("neufin-auth");

  logger.debug(
    {
      location,
      hasToken: !!accessToken,
      hasCookie,
      hasUser: !!userRec,
      userId,
      userEmail,
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
