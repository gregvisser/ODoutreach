import "server-only";

/**
 * H1/H2 — feature flag for send preflight de-duplication.
 *
 * The governed (Gmail / Microsoft Graph) send paths carry no provider-side
 * idempotency key, so a row requeued after a crash in the "provider accepted /
 * DB write lost" window can be re-sent (a duplicate to a real prospect). When
 * this flag is ON, a retry (`sendAttempt > 1`) first asks the provider whether
 * the message already landed and reconciles to SENT instead of re-sending.
 *
 * Default OFF: when unset/false the send path behaves exactly as before, so
 * deploying this change is inert until the flag is deliberately enabled.
 */
export function isSendPreflightDedupEnabled(): boolean {
  return (process.env.SEND_PREFLIGHT_DEDUP_ENABLED ?? "").trim().toLowerCase() === "true";
}
