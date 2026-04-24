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

export const OUTREACH_HERO_ADDENDUM =
  "Template and sequence sends use the shared client mailbox pool. Capacity, governance, and sender identity are all configured in Mailboxes.";

/**
 * Unsubscribe: the composed plain-text body must already include the
 * mailbox/brief signature before compliance layers append the footer. See
 * `ensureUnsubscribeLinkInPlainTextBody` in send pipelines.
 */
export const UNSUBSCRIBE_AFTER_SIGNATURE = true as const;
