/**
 * Feature B (production hardening) — the single outreach-email renderer used by
 * the pre-send preview.
 *
 * It is NOT a parallel renderer: it composes the message from the exact same
 * primitives the live send path uses, in the same order, with the same
 * DB-truncation limits, so the preview is byte-identical to what a recipient
 * receives. Parity is pinned by render-outreach-email.test.ts.
 *
 * Pipeline (mirrors the live send):
 *   Stage A — src/server/email-sequences/send-introduction.ts dispatch tx:
 *     composeSequenceEmail (merge-field resolution) → truncate(subject) →
 *     ensureUnsubscribeLinkInPlainTextBody → truncate(body) ⇒ the stored
 *     `OutboundEmail.bodySnapshot`.
 *   Stage B — src/server/email/outbound/execute-one.ts at dispatch:
 *     buildMailboxGovernedEmailBodies(bodySnapshotPlain, mailbox,
 *     hostedUnsubscribeUrl) ⇒ the final { text, html } (signature + footer).
 *
 * Pure (no Prisma / no I/O) so it is trivially testable and safe to import on
 * the client boundary's server actions.
 */

import {
  composeSequenceEmail,
  type SequenceCompositionContact,
  type SequenceCompositionSender,
} from "@/lib/email-sequences/sequence-email-composition";
import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";
import { buildMailboxGovernedEmailBodies } from "@/lib/unsubscribe/outreach-mailbox-bodies";
import type { SenderSignatureMailbox } from "@/lib/mailboxes/sender-signature";

/**
 * MUST mirror SUBJECT_DB_MAX / BODY_DB_MAX in
 * src/server/email-sequences/send-introduction.ts — the limits applied to the
 * subject and bodySnapshot the worker actually persists and renders. Keeping
 * them in lock-step is what makes the preview byte-identical to the send.
 */
export const PREVIEW_SUBJECT_DB_MAX = 300;
export const PREVIEW_BODY_DB_MAX = 50_000;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)) + "…";
}

export type RenderOutreachEmailInput = {
  /** Template subject (with `{{ snake_case }}` merge tokens). */
  subject: string;
  /** Template content (with merge tokens). */
  content: string;
  /** Merge data for the selected / sample contact. */
  contact: SequenceCompositionContact;
  /** Resolved sender identity (built the same way the send path does). */
  sender: SequenceCompositionSender;
  /** Sending mailbox — supplies the real branded signature for this identity. */
  mailbox: SenderSignatureMailbox;
  /** Unsubscribe URL woven into the plain-text body (hosted or placeholder). */
  unsubscribeUrl: string;
  /** Hosted http(s) unsubscribe URL for the governed HTML footer, or null. */
  hostedUnsubscribeUrl: string | null;
};

export type RenderedOutreachEmail = {
  subject: string;
  bodyText: string;
  html: string;
};

export function renderOutreachEmail(
  input: RenderOutreachEmailInput,
): RenderedOutreachEmail {
  // Stage A — merge-field resolution + plain-text body snapshot.
  const composition = composeSequenceEmail({
    subject: input.subject,
    content: input.content,
    contact: input.contact,
    sender: input.sender,
  });
  const subject = truncate(composition.subject, PREVIEW_SUBJECT_DB_MAX);
  const bodyWithFooter = ensureUnsubscribeLinkInPlainTextBody(
    composition.body,
    input.unsubscribeUrl,
  );
  const bodySnapshot = truncate(bodyWithFooter, PREVIEW_BODY_DB_MAX);

  // Stage B — signature injection for the selected identity + final HTML.
  const bodies = buildMailboxGovernedEmailBodies({
    bodySnapshotPlain: bodySnapshot,
    mailbox: input.mailbox,
    hostedUnsubscribeUrl: input.hostedUnsubscribeUrl,
  });

  return { subject, bodyText: bodies.text, html: bodies.html };
}
