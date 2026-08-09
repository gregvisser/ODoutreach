import "server-only";

/**
 * Refuses to dispatch a prospect-bound send that has no connected mailbox.
 *
 * ## The defect this closes
 *
 * `executeOutboundSend` routes on `row.mailboxIdentityId`: rows that have one go
 * out through Microsoft Graph or Gmail via `sendViaConnectedMailboxOrFail`, which
 * has no ESP fallback. Rows that do NOT have one fall through to the legacy
 * pluggable provider stack — `getOutboundEmailProvider()` — which returns
 * `MockEmailProvider` whenever `EMAIL_PROVIDER` is unset. It is unset in
 * production.
 *
 * `MockEmailProvider.send()` returns `{ ok: true, providerMessageId: "mock_…" }`:
 * a synthetic success. So a prospect-bound row that reached that branch would be
 * marked SENT, its contact marked contacted, and its follow-ups would later fire
 * referencing an introduction the recipient never received — while no email ever
 * left the system.
 *
 * This has never happened in production (an audit on 2026-08-06 found zero rows
 * carrying a `mock_` provider id). The branch was simply never gated. This module
 * gates it, because "never claim a real-world action the software did not
 * perform" is not a probabilistic rule.
 *
 * ## Why this is NOT behind a feature flag
 *
 * Send-path changes in this codebase normally ship behind a flag that defaults to
 * off, so a deploy is inert until the flag is set deliberately (see
 * `dispatch-recheck.ts`). This one deliberately does not, and the reason is
 * specific rather than an exception for convenience:
 *
 * **This guard cannot reduce real delivery.** By construction it only ever
 * intercepts a row that was about to be handed to the legacy ESP stack. In
 * production that stack is the mock, which delivers nothing. Blocking it converts
 * a silent fake success into a visible, diagnosable failure; it cannot turn a real
 * send into a non-send. A flag defaulting to off would leave the defect live and
 * would only postpone the fix.
 *
 * If `EMAIL_PROVIDER=resend` were ever set, this guard matters more, not less: a
 * prospect row leaving via a general-purpose ESP would carry the customer's
 * `From:` domain on IPs their SPF record does not authorise — a hard SPF failure
 * on every message, which looks exactly like spoofing. That is the leading
 * suspected cause of the 2026 quarantine incident.
 *
 * ## Why `contactId` is the discriminator
 *
 * A row addressed to a real prospect always carries `contactId` — the link to the
 * `Contact` record in the client's universe. Legacy and platform mail (system
 * notifications, older non-mailbox rows) has no contact, so it is untouched and
 * continues to use the pluggable provider stack exactly as before.
 */

/** The only fields of an `OutboundEmail` this decision depends on. */
export type ProspectSendTransportRow = {
  /** Set when the row is addressed to a prospect in the client's universe. */
  contactId: string | null;
  /** Set when a governed connected mailbox has been chosen for the send. */
  mailboxIdentityId: string | null;
};

export type ProspectSendTransportDecision =
  | { block: false }
  | { block: true; code: "NO_SENDING_MAILBOX"; reason: string };

/**
 * Pure decision — no database and no environment reads, so it is fully testable
 * and cannot behave differently between dev and production.
 *
 * Fails closed: anything addressed to a prospect without a connected mailbox is
 * blocked. It deliberately does not consult `EMAIL_PROVIDER`, because "the mock
 * happens not to be configured today" is not a safety property worth depending on.
 */
export function evaluateProspectSendTransport(
  row: ProspectSendTransportRow,
): ProspectSendTransportDecision {
  if (row.contactId && !row.mailboxIdentityId) {
    return {
      block: true,
      code: "NO_SENDING_MAILBOX",
      reason:
        "Refusing to send: this message is addressed to a prospect contact but no connected sending mailbox was chosen for it. Client outreach must leave through the client's own Microsoft 365 or Google mailbox. Nothing was sent, and the message has not been marked as delivered.",
    };
  }

  return { block: false };
}
