import "server-only";

import pino, { type DestinationStream } from "pino";

/**
 * Matches an email address anywhere inside a string, not just a whole-string
 * field. Row 116 (docs/ops/2026-08-30-row116-production-logging.md): this
 * logger's stdout output became actually readable for the first time, so
 * whatever it has ever been handed is now a real disclosure, not a dead write.
 * A prospect's address is the concrete personal-data risk this app carries
 * (Sentry's equivalent policy is `sentry-data-collection.ts`), so it is scrubbed
 * regardless of which field it arrives in or how deep it is nested — including
 * inside a caught error's own `message`/`stack`.
 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const REDACTED_EMAIL = "[redacted-email]";

function scrubEmails(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === "string") return value.replace(EMAIL_PATTERN, REDACTED_EMAIL);
  // Left untouched deliberately: `formatters.log` runs on the merging object
  // BEFORE pino's own `err` serializer does (`node_modules/pino/lib/tools.js`
  // `_asJson`), so recursing into an Error here would replace it with `{}`
  // (Error's message/stack are non-enumerable) before `serializers.err` below
  // ever sees the real thing. The `err` key gets its own scrub, downstream.
  if (value instanceof Error) return value;
  if (Array.isArray(value)) return value.map((entry) => scrubEmails(entry, depth + 1));
  if (value && typeof value === "object") {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      scrubbed[key] = scrubEmails(entryValue, depth + 1);
    }
    return scrubbed;
  }
  return value;
}

function buildLogger(destination?: DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: "odoutreach" },
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.password",
          "*.token",
          "*.secret",
          "*.dsn",
        ],
        remove: true,
      },
      // Pino serializes `err` (via `serializers.err`, below) AFTER
      // `formatters.log` has already run — see `node_modules/pino/lib/tools.js`
      // `_asJson`. So the generic scrub here never sees a plain-object
      // Error, and the `err` field needs its own pass on the serialized result.
      formatters: {
        level: (label) => ({ level: label }),
        log: (object) => scrubEmails(object) as Record<string, unknown>,
      },
      serializers: {
        // `stdSerializers.err` handles non-Error-shaped values defensively;
        // the parameter type is narrower than what a `serializers.err` hook
        // can actually receive, since pino invokes it for anything at the
        // `err` key, not only real `Error` instances.
        err: (err: unknown) => scrubEmails(pino.stdSerializers.err(err as Error)),
      },
    },
    destination,
  );
}

/**
 * Structured application logger (BidlowAI Engineering Standard §1.7).
 *
 * Emits JSON to stdout so Azure / Log Analytics ingests it directly — no pretty
 * transport in production. Control verbosity with LOG_LEVEL (default: "info").
 */
export const logger = buildLogger();

/** Exposed for tests only, to point a logger built the same way at a stream they control. */
export const createLoggerForTesting = buildLogger;

/**
 * Record a handled error with structured context.
 *
 * Once Sentry is wired (`npx @sentry/wizard@latest -i nextjs`), its Next.js
 * integration auto-captures *unhandled* errors; call this for errors you catch
 * and handle but still want visible in logs (and, if you add it, Sentry).
 *
 * `targetLogger` defaults to the module singleton; tests pass one built by
 * `createLoggerForTesting` so the scrubbed output is actually capturable.
 */
export function reportError(
  err: unknown,
  context?: Record<string, unknown>,
  targetLogger: pino.Logger = logger,
): void {
  const rawMessage = err instanceof Error ? err.message : "Unknown error";
  // The log `msg` is a positional string pino carries separately from the
  // merging object (`node_modules/pino/lib/proto.js` `write`), so it reaches
  // the destination WITHOUT going through `formatters.log` — scrubbed here,
  // at the one call site in this codebase that builds a message dynamically
  // from data rather than a static string.
  targetLogger.error({ err, ...context }, scrubEmails(rawMessage) as string);
}
