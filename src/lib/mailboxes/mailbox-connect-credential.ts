/**
 * The credential-lifecycle rule for pressing Connect on a mailbox.
 *
 * Pure — no I/O, no Prisma — so the same rule can be asserted in tests, applied
 * by the server action that starts OAuth, and used by the read-only production
 * probe that looks for mailboxes this rule has already stranded.
 *
 * WHY THIS EXISTS
 * ---------------
 * `prepareMailboxOAuthConnection` used to open its transaction by deleting the
 * mailbox's stored refresh token and flipping the row to PENDING_CONNECTION,
 * *before* the browser was redirected to Microsoft or Google. Sending gates on
 * `connectionStatus === "CONNECTED"` (see `sending-policy.ts`), so one click on
 * Connect took a healthy mailbox off the air immediately, and it stayed off the
 * air unless somebody completed the whole sign-in. An operator who closed the
 * tab, picked the wrong account, or simply wandered off left a silent outage
 * behind, labelled only "Needs approval".
 *
 * Nothing needed the delete. Both OAuth callbacks write the new credential with
 * `mailboxIdentitySecret.upsert` on the unique `mailboxIdentityId`, so the
 * replacement is already atomic and there can never be two credentials for one
 * mailbox. The delete was destroying a working credential to make room that the
 * upsert did not need.
 */

export type MailboxConnectionStatusValue =
  | "DRAFT"
  | "PENDING_CONNECTION"
  | "CONNECTED"
  | "CONNECTION_ERROR"
  | "DISCONNECTED";

/** The only fields the credential-lifecycle rule reads. */
export type MailboxConnectCredentialRow = {
  connectionStatus: MailboxConnectionStatusValue;
  /** Whether a `MailboxIdentitySecret` row exists for this mailbox. */
  hasStoredCredential: boolean;
  isActive: boolean;
  workspaceRemovedAt: Date | null;
};

/**
 * Is this mailbox able to send right now?
 *
 * Both halves matter. A CONNECTED row with no secret cannot send (the send path
 * fails when it loads no credential), and a live secret on a non-CONNECTED row
 * is never reached, because `sending-policy.ts` refuses on the status first.
 */
export function isMailboxSendingCredentialLive(
  row: MailboxConnectCredentialRow,
): boolean {
  if (!row.isActive) return false;
  if (row.workspaceRemovedAt !== null) return false;
  return row.connectionStatus === "CONNECTED" && row.hasStoredCredential;
}

/**
 * Must starting an OAuth connect leave this mailbox exactly as it is?
 *
 * True only for a mailbox that can send today. For every other row — DRAFT,
 * DISCONNECTED, CONNECTION_ERROR, or a CONNECTED row whose secret has already
 * gone — there is nothing working to protect, so Connect still moves it to
 * PENDING_CONNECTION and the operator sees "Needs approval", which is honest.
 */
export function shouldPreserveMailboxCredentialOnConnect(
  row: MailboxConnectCredentialRow,
): boolean {
  return isMailboxSendingCredentialLive(row);
}

/**
 * Is this mailbox sitting in the state an abandoned Connect leaves behind?
 *
 * PENDING_CONNECTION with no credential: a sign-in was started and never
 * finished, and there is nothing left to send with. Used by the production
 * probe to answer "is this outage open right now?" rather than "could it
 * happen?". Removed and inactive rows are excluded — they are not expected to
 * send, so they are not an outage.
 */
export function isStrandedByAbandonedConnect(
  row: MailboxConnectCredentialRow,
): boolean {
  if (!row.isActive) return false;
  if (row.workspaceRemovedAt !== null) return false;
  return row.connectionStatus === "PENDING_CONNECTION" && !row.hasStoredCredential;
}
