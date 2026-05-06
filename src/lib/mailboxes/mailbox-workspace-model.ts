/**
 * Central operator-facing copy for the shared workspace mailbox model, kept
 * free of I/O for reuse in RSC, client components, and tests. Authoritative
 * product rules (signatures, unsubscribe) remain documented in
 * `src/config/production-platform-rules.ts`.
 */

export const WORKSPACE_MAILBOXES_HERO =
  "Shared client mailboxes: connected sender accounts, daily capacity, and per-mailbox sender identity. " +
  "Any authorised operator on this workspace can send and reply from any connected, eligible mailbox; " +
  "replies stay on the mailbox and thread that received the message.";

/** Short intro on the Mailboxes page (operator-facing). */
export const MAILBOXES_PAGE_INTRO =
  "Clients do not need ODoutreach sign-in. Staff use Connect to start the mailbox connection; the mailbox owner " +
  "or their Microsoft/Google admin completes provider sign-in and MFA in the browser. " +
  "Tokens are stored for this client workspace, not the staff user personally. " +
  "Any authorised operator on this client can use connected mailboxes in the shared sending pool.";

export const OUTREACH_HERO_ADDENDUM =
  "Outreach sends use the shared client mailbox pool. Capacity and sender identity are configured in Mailboxes.";

/**
 * Unsubscribe: the composed plain-text body must already include the
 * mailbox signature block before compliance layers append the footer. See
 * `ensureUnsubscribeLinkInPlainTextBody` in send pipelines.
 */
export const UNSUBSCRIBE_AFTER_SIGNATURE = true as const;
