import "server-only";

import pino from "pino";

/**
 * Structured application logger (BidlowAI Engineering Standard §1.7).
 *
 * Emits JSON to stdout so Azure / Log Analytics ingests it directly — no pretty
 * transport in production. Control verbosity with LOG_LEVEL (default: "info").
 */
export const logger = pino({
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
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Record a handled error with structured context.
 *
 * Once Sentry is wired (`npx @sentry/wizard@latest -i nextjs`), its Next.js
 * integration auto-captures *unhandled* errors; call this for errors you catch
 * and handle but still want visible in logs (and, if you add it, Sentry).
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error({ err, ...context }, message);
}
