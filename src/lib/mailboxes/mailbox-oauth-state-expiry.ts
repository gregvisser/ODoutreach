/**
 * The lifetime of a mailbox OAuth `state` token, and the one check that enforces it.
 *
 * The bug this module exists to close: `prepareMailboxOAuthConnection` has always
 * written `oauthStateExpiresAt = now + 15 minutes` onto the mailbox row, and
 * neither callback ever read it. The column was written and never read, so a
 * state stayed valid until something else happened to clear it — a completed
 * callback, a disconnect, or a fresh Connect. An abandoned Connect therefore
 * left a live state in the database indefinitely.
 *
 * The exposure was narrow and it is worth being honest about why, because it
 * decided the size of the fix. The state is 256 bits of CSPRNG, it is unique-
 * indexed, and anyone replaying it must also hold a valid provider `code` for
 * the same flow — and even then the account-alignment guard refuses a sign-in
 * that is not the mailbox on the row. So the realistic harm was a stale-token
 * window, not an open door.
 *
 * That is why this is an expiry CHECK and not a periodic sweep of abandoned
 * states. Once the callback refuses an out-of-date state, a leftover row holds
 * an inert string that opens nothing; a scheduled job to delete it would be new
 * moving parts bought for no security gain. This repository's most expensive
 * recurring defect is machinery that is built, wired, reports success and never
 * fires — a cron for cosmetic tidying is exactly that shape.
 *
 * The TTL lives here rather than in the action so the value that is WRITTEN and
 * the value that is ENFORCED cannot drift apart. Drift between those two is the
 * whole of the original defect.
 *
 * Pure on purpose: the callbacks are route handlers over Prisma and the network,
 * so this is the layer that can be tested directly.
 */

/** How long a prepared `state` may be presented back to a callback. */
export const MAILBOX_OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

/** The expiry to persist beside a freshly generated `state`. */
export function mailboxOAuthStateExpiresAt(now: Date): Date {
  return new Date(now.getTime() + MAILBOX_OAUTH_STATE_TTL_MS);
}

/**
 * Fails CLOSED. A null expiry is treated as expired, not as "no limit": the only
 * writer of a non-null `oauthState` always writes an expiry beside it in the
 * same update, and both columns were added by the same migration, so a state
 * with no expiry is a row this codebase cannot produce. Refusing it costs a
 * working flow nothing and refuses a corrupted one.
 *
 * The boundary is inclusive — a state presented on the exact millisecond it
 * expires is still accepted — so a clock landing precisely on the edge does not
 * reject an otherwise-valid round trip.
 */
export function isMailboxOAuthStateExpired(
  expiresAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!expiresAt) return true;
  return now.getTime() > expiresAt.getTime();
}
