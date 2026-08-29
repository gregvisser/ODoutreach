/**
 * What a FAILED mailbox OAuth attempt is allowed to write to the mailbox row.
 *
 * Pure — no I/O, no Prisma — so the rule can be asserted directly and applied
 * identically by both provider callbacks.
 *
 * WHY THIS EXISTS
 * ---------------
 * Cycle 73 stopped `prepareMailboxOAuthConnection` deleting a working
 * credential before sending the operator off to the provider: a mailbox that
 * can send today keeps its credential and its CONNECTED status for the whole
 * round trip (`shouldPreserveMailboxCredentialOnConnect`).
 *
 * That left the same defect one step downstream. Both callbacks answered every
 * failure — the operator pressed Deny, they approved as the wrong person, the
 * token exchange was refused — by writing `connectionStatus: CONNECTION_ERROR`.
 * `sending-policy.ts` gates on `connectionStatus === "CONNECTED"`, so a failed
 * SIGN-IN ATTEMPT took a mailbox off the air whose stored credential the
 * attempt never went near. Before cycle 73 this could not happen, because the
 * credential was already gone by the time the callback ran; now it can.
 *
 * THE RULE, AND WHY IT IS NOT THE CREDENTIAL CLASSIFIER
 * ----------------------------------------------------
 * `classifyMailboxCredentialFailure` is the right tool in the wrong place here.
 * It reads errors produced by USING a stored refresh token — the send path and
 * the reply-sync path — where `invalid_grant` really does mean "the stored
 * grant is dead". A callback's errors come from exchanging a fresh
 * AUTHORIZATION CODE, where `invalid_grant` means the code was expired, already
 * spent, or issued for a different redirect URI. That is a fact about the code,
 * not about the refresh token sitting in `MailboxIdentitySecret`. Passing it to
 * the classifier would return `reauth_required` and demote a healthy mailbox on
 * the strength of an error about an entirely different credential.
 *
 * So the question this module asks is not "what does this error say about the
 * stored credential" — the answer is always "nothing, it never touched it" —
 * but "does this row still hold a credential the send path is using". The send
 * and sync paths run every five and fifteen minutes and DO exercise that
 * credential; they are the only code with evidence, and deferring the status to
 * them is deferring it to the evidence.
 *
 * `lastError` is preserved for the same reason and one more. It describes the
 * credential the row holds, exactly as the status does, and
 * `mailboxRowOperatorStatus` reads it AHEAD of the status branches: an
 * `AADSTS500341` arriving in a provider's `error_description` would relabel a
 * live, sending mailbox "Cannot be reconnected". Not writing it also stops the
 * sync path's true diagnosis being clobbered by a note about a sign-in attempt.
 *
 * The operator is not left guessing: they are standing at the screen, and the
 * redirect banner names the failure. The audit row records it permanently.
 */

import {
  isMailboxSendingCredentialLive,
  type MailboxConnectCredentialRow,
} from "./mailbox-connect-credential";

/** The row fields the rule reads. Same shape the connect-time rule uses. */
export type MailboxOAuthFailedAttemptRow = MailboxConnectCredentialRow;

/**
 * The `data` a failed callback may write to `ClientMailboxIdentity`.
 *
 * `oauthState` and `oauthStateExpiresAt` are always cleared — the state was
 * spent on this attempt whether it succeeded or not, and leaving it live is the
 * abandoned-Connect hazard cycle 73 closed. The other two keys are ABSENT, not
 * null, when the credential is preserved: Prisma leaves an omitted column
 * untouched, and null would erase.
 */
export type MailboxOAuthFailedAttemptUpdate = {
  connectionStatus?: "CONNECTION_ERROR";
  lastError?: string;
  oauthState: null;
  oauthStateExpiresAt: null;
};

/** Longest `lastError` the column is given, matching the callers it replaces. */
const LAST_ERROR_MAX = 4000;

/**
 * Must a failed sign-in attempt leave this mailbox's connection state alone?
 *
 * True only for a mailbox that can send right now. For every other row —
 * DRAFT, PENDING_CONNECTION, DISCONNECTED, CONNECTION_ERROR, or a CONNECTED row
 * whose secret has already gone — there is no working credential to protect and
 * recording the failure is the honest thing to do.
 */
export function shouldPreserveMailboxOnFailedOAuthAttempt(
  row: MailboxOAuthFailedAttemptRow,
): boolean {
  return isMailboxSendingCredentialLive(row);
}

/**
 * Builds the update a failed callback writes. Both providers call this, so the
 * Google path and the Microsoft path cannot drift apart on the rule.
 */
export function mailboxOAuthFailedAttemptUpdate(
  row: MailboxOAuthFailedAttemptRow,
  lastError: string,
): MailboxOAuthFailedAttemptUpdate {
  if (shouldPreserveMailboxOnFailedOAuthAttempt(row)) {
    return { oauthState: null, oauthStateExpiresAt: null };
  }
  return {
    connectionStatus: "CONNECTION_ERROR",
    lastError: lastError.slice(0, LAST_ERROR_MAX),
    oauthState: null,
    oauthStateExpiresAt: null,
  };
}
