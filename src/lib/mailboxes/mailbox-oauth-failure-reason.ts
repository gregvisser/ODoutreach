/**
 * The complete vocabulary of reasons a mailbox OAuth round-trip can come back
 * with, and the only strings the callback routes may put on a redirect.
 *
 * WHY THIS EXISTS. Until 2026-08-29 every exception raised anywhere inside the
 * callback — a rejected token exchange, an unconfigured client secret, a
 * mailbox the signed-in user has no rights over — was caught by one `catch` and
 * redirected as `callback_failed`. The operator was told something broke and
 * given no way to find out what. Greg hit exactly that on Train Hugger.
 *
 * The fix is not a longer message. It is that the site which KNOWS the cause
 * says so, by throwing a `MailboxOAuthFailure` carrying one of these codes, and
 * the callback passes it through instead of flattening it.
 *
 * Rules for adding one:
 * - A new code earns its place only if the operator's NEXT MOVE differs. Two
 *   codes that lead to the same instruction are one code with two names, and
 *   cycle 56 already paid for that lesson with `unknown_state`.
 * - Every code must have a sentence in `mailbox-oauth-banner-message.ts`. The
 *   test there sweeps this list, so a code without a sentence fails the build
 *   rather than silently rendering the generic fallback.
 * - Codes travel on a URL and are read by a browser. Keep them short, lower
 *   snake_case, and free of anything a person or a provider supplied.
 */

/**
 * The callback approved a sign-in that is not this mailbox and cannot act for
 * it. Distinct from a generic failure because the operator can actually fix it.
 */
export const MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON = "oauth_account_mismatch";

/**
 * The sign-in link was real, but it was issued more than fifteen minutes ago.
 *
 * Deliberately NOT folded into `unknown_state`. A link that timed out and a
 * link that was never issued are different facts: the first means "you took too
 * long, start again", the second can mean the row was disconnected underneath
 * you or the link was tampered with.
 */
export const MAILBOX_OAUTH_EXPIRED_STATE_REASON = "expired_state";

/**
 * The provider refused to trade the sign-in code for a token — expired code,
 * a reused callback URL, a redirect URI that does not match. Starting again
 * from Connect fixes nearly all of these.
 */
export const MAILBOX_OAUTH_TOKEN_EXCHANGE_REJECTED_REASON =
  "token_exchange_rejected";

/**
 * The exchange succeeded but returned no refresh token, so the connection would
 * die the moment the access token expired. Its own code because the remedy is
 * unusual and non-obvious: revoke the app's previous grant, then approve
 * offline access again.
 */
export const MAILBOX_OAUTH_NO_REFRESH_TOKEN_REASON = "no_refresh_token";

/**
 * The provider would not say who had just signed in, so the guard that stops a
 * stranger's mailbox being attached to a client could not run. Refusing here is
 * the fail-closed behaviour: no identity, no connection.
 */
export const MAILBOX_OAUTH_PROFILE_UNAVAILABLE_REASON =
  "provider_profile_unavailable";

/**
 * The sign-in itself worked, and it is not the wrong-person case either — the
 * account simply has no rights over the mailbox on the row. A mailbox
 * permissions job, not a sign-in job.
 */
export const MAILBOX_OAUTH_MAILBOX_ACCESS_DENIED_REASON =
  "mailbox_access_denied";

/**
 * Our own OAuth application is missing or wrong — an unset client id, an unset
 * secret. The only code here that the person pressing Connect CANNOT fix, so
 * its sentence must send them to an administrator rather than round the loop
 * again.
 */
export const MAILBOX_OAUTH_APP_MISCONFIGURED_REASON = "oauth_app_misconfigured";

/**
 * The floor. Anything not classified still lands somewhere, so an unanticipated
 * fault is never swallowed — it is reported as unclassified, which is honest,
 * rather than mislabelled as one of the codes above.
 */
export const MAILBOX_OAUTH_CALLBACK_FAILED_REASON = "callback_failed";

/** Reasons raised from inside the callback's try block, by a throw site. */
export const MAILBOX_OAUTH_THROWN_REASONS = [
  MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
  MAILBOX_OAUTH_TOKEN_EXCHANGE_REJECTED_REASON,
  MAILBOX_OAUTH_NO_REFRESH_TOKEN_REASON,
  MAILBOX_OAUTH_PROFILE_UNAVAILABLE_REASON,
  MAILBOX_OAUTH_MAILBOX_ACCESS_DENIED_REASON,
  MAILBOX_OAUTH_APP_MISCONFIGURED_REASON,
  MAILBOX_OAUTH_CALLBACK_FAILED_REASON,
] as const;

export type MailboxOAuthFailureReason =
  (typeof MAILBOX_OAUTH_THROWN_REASONS)[number];

/** Reasons decided before the try block, by a guard reading the request. */
export const MAILBOX_OAUTH_PRE_EXCHANGE_REASONS = [
  "missing_state",
  "unknown_state",
  MAILBOX_OAUTH_EXPIRED_STATE_REASON,
  "mailbox_removed",
  "provider_denied",
  "missing_code",
] as const;

/**
 * Every reason either route can redirect with. The banner test sweeps this, so
 * adding a code without adding its sentence is a failing build.
 */
export const MAILBOX_OAUTH_ALL_REASONS = [
  ...MAILBOX_OAUTH_PRE_EXCHANGE_REASONS,
  ...MAILBOX_OAUTH_THROWN_REASONS,
] as const;

/**
 * Reason codes that deliberately SHARE one sentence.
 *
 * The rule above says two codes leading to the same instruction are one code
 * with two names. `missing_state` and `unknown_state` are the exception that
 * proves it: they are different facts on the wire — no state parameter at all,
 * versus a state nothing in the database matches — and the first cannot even
 * name a mailbox, so the routes must keep them apart. But the operator's next
 * move is identical in both cases: that link is no good, press Connect again.
 * Inventing a distinction in the banner to satisfy a test would be writing
 * fiction for the reader.
 *
 * Declared here so the sweep in the test can allow exactly this pair and still
 * fail on any NEW code that quietly renders someone else's sentence.
 */
export const MAILBOX_OAUTH_ALIASED_REASON_GROUPS = [
  ["missing_state", "unknown_state"],
] as const;

export function isMailboxOAuthFailureReason(
  value: unknown,
): value is MailboxOAuthFailureReason {
  return (
    typeof value === "string" &&
    (MAILBOX_OAUTH_THROWN_REASONS as readonly string[]).includes(value)
  );
}
