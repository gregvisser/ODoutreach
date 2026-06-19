/**
 * Central operator-facing copy for the shared workspace mailbox model, kept
 * free of I/O for reuse in RSC, client components, and tests. Authoritative
 * product rules (signatures, unsubscribe) remain documented in
 * `src/config/production-platform-rules.ts`.
 */

export const WORKSPACE_MAILBOXES_HERO =
  "Connected sending mailboxes: senders, daily limits, and per-mailbox identity. " +
  "Staff on this workspace can send and reply from any connected, eligible mailbox; " +
  "replies stay on the mailbox and thread that received the message.";

/** Short intro on the Mailboxes page (operator-facing). */
export const MAILBOXES_PAGE_INTRO =
  "These are the inboxes ODoutreach can send from and monitor for replies on this client.";

/** Subtitle for the Mailboxes page, shown directly under the heading. */
export const MAILBOXES_PAGE_SUBTITLE = "Connected sending mailboxes" as const;

/**
 * Explainer card shown when an operator first lands on Mailboxes. Plain-English,
 * no developer jargon. Matches the actual product behaviour:
 *   - Connect is a one-time provider sign-in.
 *   - Opening this page does not send anything.
 *   - Replies sync back into Activity from connected mailboxes.
 */
export const MAILBOXES_WHAT_HAPPENS_BULLETS: readonly string[] = [
  "Connect opens a Microsoft 365 or Google sign-in window for that mailbox. " +
    "No email is sent and no contacts are touched when you connect.",
  "Once a mailbox is connected, ODoutreach can send outreach from it and read replies " +
    "back into Activity for this client.",
  "Each mailbox has its own daily send limit. The pool total at the top of the table " +
    "is the sum of every connected mailbox's daily limit.",
  "Any staff member can Connect, Reconnect, Disconnect or Remove a mailbox here — none of these delete past send history.",
];

export const OUTREACH_HERO_ADDENDUM =
  "Outreach sends use the connected mailboxes on this client. Capacity and sender identity are configured in Mailboxes.";

/**
 * Unsubscribe: the composed plain-text body must already include the
 * mailbox signature block before compliance layers append the footer. See
 * `ensureUnsubscribeLinkInPlainTextBody` in send pipelines.
 */
export const UNSUBSCRIBE_AFTER_SIGNATURE = true as const;
