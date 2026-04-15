# Auth Flow Issues

> Last reviewed: 2026-04-03 — Validation Pass 2

## High severity

1. Middleware token source does not match Supabase persistence model

- Evidence:
  - `lib/supabase.ts` stores session in localStorage (`storageKey: 'neufin-auth'`), not cookies.
  - `middleware.ts` reads only cookies (`neufin-auth`, `sb-access-token`) or Authorization header.
- Impact:
  - Protected routes can redirect to `/auth` even when client has a valid localStorage session.
  - Explains repeated "asked to login again" behavior.
- **Status: ✅ FIXED** — `lib/sync-auth-cookie.ts` bridges the gap: `AuthProvider` calls
  `syncAuthCookie(session)` on `SIGNED_IN`, `TOKEN_REFRESHED`, and initial load, writing
  the access token to the `neufin-auth` cookie so middleware can read it.

2. Middleware treats cookie value as bearer token without structural validation

- Evidence:
  - `middleware.ts` forwards cookie value directly in `Authorization: Bearer ...`.
- Impact:
  - If cookie carries non-JWT serialized payload, backend auth probe fails and redirects.
- **Status: ✅ FIXED** — `isJwtExpired()` guard added in middleware; token is validated
  structurally before the Supabase probe is called.

## Medium severity

3. Duplicate auth enforcement on several routes (middleware + client guards)

- Routes: `/dashboard`, `/vault`, `/onboarding`, `/advisor/*`
- Evidence:
  - Middleware matcher protects prefixes.
  - Pages also run client checks (`router.replace('/auth?...')`) or fallback sign-in UI.
- Impact:
  - Possible flicker/race and harder debugging of redirect source.

4. Mixed auth route naming (`/login` vs `/auth`) existed in advisor pages

- Evidence:
  - Advisor pages used `/login` while canonical route is `/auth`.
- Impact:
  - Broken/inconsistent re-auth entrypoint.
- **Status: ✅ FIXED** — Updated to `/auth?next=/advisor/dashboard` and `/auth?next=/advisor/settings`.

## Low severity / design risks

5. Callback default destination `/vault` can still be bounced by middleware if token is not cookie-visible

- Evidence:
  - `app/auth/callback/page.tsx` defaults `next` to `/dashboard` (updated from `/vault`).
- Impact:
  - `syncAuthCookie` is called before redirect, so the cookie is set before middleware evaluates the next route.
- **Status: ✅ MITIGATED** — `syncAuthCookie(session)` called immediately after `exchangeCodeForSession`,
  then `window.location.href = next` triggers a full navigation with the cookie already set.

6. Middleware allows protected routes when auth probe is unreachable

- Evidence:
  - `middleware.ts` `hasValidSupabaseSession` catch block previously fell through.
- Impact:
  - Availability-over-security tradeoff; page-level guards become final enforcement.
- **Status: ✅ FIXED** — Catch block now returns `false` (fail-closed), causing redirect to `/auth`.

## Redirect loop check

- No deterministic A->B->A infinite loop found in static routing code.
- Observed repeated login symptom is most consistent with server/client token visibility mismatch, not static loop.

## Missing auth checks check

- Middleware protects all intended prefixes: `/dashboard`, `/vault`, `/swarm`, `/onboarding`, `/advisor`.
- `/dashboard/cos` and `/dashboard/agent-os` rely on middleware only (no page-level guard), which is acceptable if intentional.

## Token set/clear behavior check

- Token set paths:
  - Supabase persists session in localStorage (`persistSession: true`).
  - `AuthProvider` hydrates and updates token via `getSession()` and `onAuthStateChange`.
- Token clear paths:
  - `signOut()` via Supabase.
  - Middleware clears cookies when backend reports invalid token.

## Instrumentation added in this pass

- New helper: `lib/auth-debug.ts`
- Added debug logging in:
  - `middleware.ts`
  - `lib/supabase.ts` (`attachSupabaseAuthDebug`)
  - `lib/auth-context.tsx`
  - `app/auth/callback/page.tsx`
  - protected page mounts: dashboard, swarm, vault, onboarding, advisor dashboard/settings
  - root app boot: `app/components/AuthDebugBoot.tsx` included in `app/layout.tsx`
