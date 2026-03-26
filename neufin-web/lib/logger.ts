/**
 * Centralised logger for the Neufin web frontend.
 *
 * Server-side (Node.js runtime):   uses pino for newline-delimited JSON.
 * Client-side (browser / Edge):    thin wrapper around console.* that
 *                                   emits structured objects so browser
 *                                   devtools show them cleanly.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info({ userId, page: 'dashboard' }, 'page.view')
 *   logger.error({ err }, 'swarm.fetch_failed')
 */

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  [key: string]: unknown;
}

// ── Isomorphic logger type ─────────────────────────────────────────────────────
interface Logger {
  trace(obj: LogEntry, msg: string): void;
  debug(obj: LogEntry, msg: string): void;
  info(obj: LogEntry, msg: string): void;
  warn(obj: LogEntry, msg: string): void;
  error(obj: LogEntry, msg: string): void;
  fatal(obj: LogEntry, msg: string): void;
  child(bindings: LogEntry): Logger;
}

// ── Browser / Edge implementation ──────────────────────────────────────────────
// pino cannot run in the browser.  This thin wrapper preserves the same API
// and emits objects that are easily searchable in browser devtools.
function makeConsoleLogger(bindings: LogEntry = {}): Logger {
  const emit =
    (level: LogLevel, consoleFn: (...a: unknown[]) => void) =>
    (obj: LogEntry, msg: string) => {
      consoleFn({ level, msg, ...bindings, ...obj, time: new Date().toISOString() });
    };

  return {
    trace: emit("trace", console.debug),
    debug: emit("debug", console.debug),
    info:  emit("info",  console.info),
    warn:  emit("warn",  console.warn),
    error: emit("error", console.error),
    fatal: emit("fatal", console.error),
    child: (extra) => makeConsoleLogger({ ...bindings, ...extra }),
  };
}

// ── Server-side pino instance ──────────────────────────────────────────────────
// Conditionally imported so the pino package is never bundled into the browser
// chunk (Next.js tree-shakes server-only code automatically).
function makeServerLogger(): Logger {
  // Lazy require so this path is only executed in Node.js environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino") as typeof import("pino");
  const isProd = process.env.NODE_ENV === "production";

  const instance = pino.default({
    level:      process.env.LOG_LEVEL ?? "info",
    // In production emit compact JSON; in dev use pino-pretty for readability.
    transport:  isProd
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
    base: {
      service: "neufin-web",
      env:     process.env.NEXT_PUBLIC_APP_ENV ?? "production",
    },
    redact: {
      // Never log raw auth tokens or PII fields
      paths:  ["req.headers.authorization", "*.token", "*.password", "*.secret"],
      censor: "[REDACTED]",
    },
  });

  return instance as unknown as Logger;
}

// ── Export singleton ───────────────────────────────────────────────────────────
export const logger: Logger =
  typeof window === "undefined" && typeof EdgeRuntime === "undefined"
    ? makeServerLogger()
    : makeConsoleLogger({ service: "neufin-web" });

declare const EdgeRuntime: unknown;
