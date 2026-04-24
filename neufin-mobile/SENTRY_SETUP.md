# Sentry Setup — neufin-mobile

## Sentry Project

| Field | Value |
|-------|-------|
| Project name | `neufin-mobile` |
| Platform | React Native / Expo |
| DSN env var | `EXPO_PUBLIC_SENTRY_DSN` |
| SDK package | `@sentry/react-native ~7.2.0` |

## Configuration

Sentry is initialised in `App.tsx` **before `NavigationContainer` renders** so
that native crash reports, ANR events, and OOM kills are captured from the
moment the app starts.

```tsx
// Top of App.tsx (before React import)
import * as Sentry from '@sentry/react-native'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableNative: true,
  enableNativeCrashHandling: true,
  ...
})
```

### Native Crash Reporting

`enableNativeCrashHandling: true` enables the native crash handler for:
- Hard crashes (SIGSEGV, SIGABRT)
- Android ANR (Application Not Responding)
- OOM kills (Low Memory Killer)

### User Context

`App.tsx` sets user context via `Sentry.setUser()` inside the
`supabase.auth.onAuthStateChange` handler so every event after sign-in is
associated with the user's id and email.

### Custom Tags

```
service = neufin-mobile
company = neufin
```

### Sampling

| Environment | `tracesSampleRate` |
|-------------|-------------------|
| `production` | `0.2` (20 %) |
| `development` / staging | `1.0` (100 %) |

## Environment Variables

Set via `eas secret` (EAS Build) or in `app.config.js` extra:

```bash
# EAS Secrets (not committed)
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN \
  --value "https://<key>@o<org>.ingest.sentry.io/<project>"

# app.json / eas.json extra
EXPO_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
EXPO_PUBLIC_ENVIRONMENT=production
EXPO_PUBLIC_APP_VERSION=<semver>   # e.g. 1.0.0
```

## Upload Debug Symbols

After each EAS build, upload source maps and dSYMs for symbolicated stack traces:

```bash
npx sentry-expo-upload-sourcemaps dist/
```

Or add to `eas.json` postBuild hook:
```json
"postBuild": "npx sentry-expo-upload-sourcemaps dist/"
```

## Release Format

```
<app-version>+<build-number>   # e.g. 1.2.0+42
```

## Recommended Alert Rules (create in Sentry UI)

1. **New crash** — any new `fatal` issue → PagerDuty + Slack #mobile-crashes
2. **Crash-free rate drop** — `< 99.5 %` over 1 h → Slack #mobile-crashes
3. **ANR spike** — `> 3 ANR events` in 10 min → email
4. **New issue on release** — on new app version → Slack #mobile-releases
5. **Error spike** — `> 20 errors/min` → Slack #alerts
