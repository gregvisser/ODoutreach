import "server-only";

import { prisma } from "@/lib/db";
import { classifyInboundBounce } from "@/lib/inbox/bounce-detection";
import { normalizeEmail } from "@/lib/normalize";
import { suppressRecipientForHardBounce } from "@/server/email/bounce-suppression";

/**
 * H2 (production hardening) — wire NDR/DSN bounce detection into mailbox inbox
 * sync. When a synced message is a CLEAR hard bounce for an address we actually
 * sent to from this mailbox, suppress it via the existing
 * `suppressRecipientForHardBounce` (append-only, idempotent).
 *
 * Flag-gated by `MAILBOX_BOUNCE_DETECTION_ENABLED` (DEFAULT OFF): when off this
 * is a no-op with no query, so inbox sync behaves exactly as before.
 */
export function isMailboxBounceDetectionEnabled(): boolean {
  return (
    (process.env.MAILBOX_BOUNCE_DETECTION_ENABLED ?? "").trim().toLowerCase() ===
    "true"
  );
}

export type BounceProcessResult = {
  suppressed: boolean;
  /** The failed recipient that was suppressed (when suppressed). */
  recipient?: string;
};

export async function processSyncedMessageForBounce(input: {
  clientId: string;
  mailboxIdentityId: string;
  providerMessageId: string;
  fromEmail: string;
  subject: string | null;
  /** Best available body text: full body when fetched, else preview/snippet. */
  bodyText: string | null;
  receivedAt: Date;
}): Promise<BounceProcessResult> {
  if (!isMailboxBounceDetectionEnabled()) return { suppressed: false };

  const verdict = classifyInboundBounce({
    fromEmail: input.fromEmail,
    subject: input.subject,
    bodyText: input.bodyText,
  });
  if (!verdict.isBounce || !verdict.isHardBounce || !verdict.failedRecipient) {
    return { suppressed: false };
  }

  const failed = normalizeEmail(verdict.failedRecipient);
  if (!failed.includes("@")) return { suppressed: false };

  // SAFETY GATE — only suppress an address THIS workspace actually sent to from
  // THIS mailbox. A spoofed/spam "bounce" naming an arbitrary address therefore
  // cannot suppress it (and a fuzzy recipient mis-extraction is harmless).
  const outbound = await prisma.outboundEmail.findFirst({
    where: {
      clientId: input.clientId,
      mailboxIdentityId: input.mailboxIdentityId,
      toEmail: failed,
      sentAt: { not: null },
    },
    orderBy: { sentAt: "desc" },
    select: { id: true, contactId: true },
  });
  if (!outbound) return { suppressed: false };

  const result = await suppressRecipientForHardBounce({
    clientId: input.clientId,
    email: failed,
    contactId: outbound.contactId,
    outboundEmailId: outbound.id,
    bounceCategory: `ndr:${verdict.evidence}`.slice(0, 200),
    providerEventType: "mailbox_sync_ndr",
    at: input.receivedAt,
    reason: "hard_bounce",
  });

  return { suppressed: result.suppressed, recipient: failed };
}
