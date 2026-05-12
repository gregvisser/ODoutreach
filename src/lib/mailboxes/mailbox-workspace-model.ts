/**
 * Central operator-facing copy for the shared workspace mailbox model, kept
 * free of I/O for reuse in RSC, client components, and tests. Authoritative
 * product rules (signatures, unsubscribe) remain documented in
 * `src/config/production-platform-rules.ts`.
 */

export const WORKSPACE_MAILBOXES_HERO =
  "Shared client mailboxes: connected senders, daily limits, and per-mailbox identity. " +
  "Staff on this workspace can send and reply from any connected, eligible mailbox; " +
  "replies stay on the mailbox and thread that received the message.";

/** Short intro on the Mailboxes page (operator-facing). */
export const MAILBOXES_PAGE_INTRO =
  "Connect and manage the mailboxes used for this client's outreach.";

export const OUTREACH_HERO_ADDENDUM =
  "Outreach sends use the shared client mailbox pool. Capacity and sender identity are configured in Mailboxes.";

/**
 * Unsubscribe: the composed plain-text body must already include the
 * mailbox signature block before compliance layers append the footer. See
 * `ensureUnsubscribeLinkInPlainTextBody` in send pipelines.
 */
export const UNSUBSCRIBE_AFTER_SIGNATURE = true as const;
