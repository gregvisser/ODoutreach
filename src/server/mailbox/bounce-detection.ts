import "server-only";

import { prisma } from "@/lib/db";
import { classifyInboundBounce } from "@/lib/inbox/bounce-detection";
import { normalizeEmail } from "@/lib/normalize";
import { suppressRecipientForHardBounce } from "@/server/email/bounce-suppression";
import { recordOutboundBounce } from "@/server/email/outbound/record-bounce";

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
  /**
   * True when this call also wrote `status = BOUNCED` onto the outbound row.
   *
   * Suppression alone was never enough: the bounce rate Reports shows counts
   * `OutboundEmail.status == "BOUNCED"`, so an NDR that only suppressed left the
   * reported rate at 0% forever. False here is not necessarily a failure — a
   * REPLIED row deliberately keeps its milestone (see `record-bounce.ts`).
   */
  statusStamped: boolean;
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
  if (!isMailboxBounceDetectionEnabled()) return { suppressed: false, statusStamped: false };

  const verdict = classifyInboundBounce({
    fromEmail: input.fromEmail,
    subject: input.subject,
    bodyText: input.bodyText,
  });
  if (!verdict.isBounce || !verdict.isHardBounce || !verdict.failedRecipient) {
    return { suppressed: false, statusStamped: false };
  }

  const failed = normalizeEmail(verdict.failedRecipient);
  if (!failed.includes("@")) return { suppressed: false, statusStamped: false };

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
    select: {
      id: true,
      contactId: true,
      // Needed by the shared bounce recorder's lifecycle plan.
      status: true,
      lastProviderEventAt: true,
    },
  });
  if (!outbound) return { suppressed: false, statusStamped: false };

  const bounceCategory = `ndr:${verdict.evidence}`.slice(0, 200);

  // Stamp the row FIRST, through the same function the ESP webhook uses, so the
  // bounce the client is judged on is recorded identically whichever channel
  // saw it. Without this the address was suppressed (safe) but the reported
  // bounce rate could never leave 0% (untrustworthy).
  const stamp = await recordOutboundBounce({
    outbound: {
      id: outbound.id,
      status: outbound.status,
      lastProviderEventAt: outbound.lastProviderEventAt,
    },
    at: input.receivedAt,
    bounceCategory,
    providerEventType: "mailbox_sync_ndr",
  });

  // Suppression is independent of the status stamp: a REPLIED row keeps its
  // milestone, but the address that hard-bounced is still dead and must not be
  // contacted again.
  const result = await suppressRecipientForHardBounce({
    clientId: input.clientId,
    email: failed,
    contactId: outbound.contactId,
    outboundEmailId: outbound.id,
    bounceCategory,
    providerEventType: "mailbox_sync_ndr",
    at: input.receivedAt,
    reason: "hard_bounce",
  });

  return {
    suppressed: result.suppressed,
    recipient: failed,
    statusStamped: stamp.statusStamped,
  };
}
