import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { classifyOptOutReply } from "@/lib/inbox/opt-out-detection";
import { normalizeEmail } from "@/lib/normalize";
import { suppressRecipientForHardBounce } from "@/server/email/bounce-suppression";

/**
 * H3 (production hardening) — suppress a prospect who replies demanding to stop.
 *
 * Called from the reply matcher once an inbound message has been matched to one
 * of our outbound sends (so the sender is a known contacted prospect). When the
 * reply text is a clear opt-out / complaint, suppress the sender via the
 * existing `suppressRecipientForHardBounce(reason:"complaint")` — append-only +
 * idempotent + seed-allowlist-aware.
 *
 * Enabled by default. `MAILBOX_COMPLAINT_DETECTION_ENABLED=false` is an explicit override; when off,
 * no classification or query runs, so reply processing is unchanged.
 */
export function isMailboxComplaintDetectionEnabled(): boolean {
  return (
    (process.env.MAILBOX_COMPLAINT_DETECTION_ENABLED ?? "")
      .trim()
      .toLowerCase() !== "false"
  );
}

export type ReplyOptOutResult = { suppressed: boolean; recipient?: string };

export async function suppressReplyOptOut(input: {
  clientId: string;
  /** The reply sender — the contacted prospect (we already matched their send). */
  fromEmail: string;
  subject: string | null;
  bodyText: string | null;
  contactId: string | null;
  outboundEmailId: string;
  receivedAt: Date;
}, transaction?: Prisma.TransactionClient): Promise<ReplyOptOutResult> {
  if (!isMailboxComplaintDetectionEnabled()) return { suppressed: false };

  const verdict = classifyOptOutReply({
    subject: input.subject,
    bodyText: input.bodyText,
  });
  if (!verdict.isOptOut) return { suppressed: false };

  const email = normalizeEmail(input.fromEmail);
  if (!email.includes("@")) return { suppressed: false };

  // The reply was already matched to an outbound we sent, so we know we
  // contacted this address — no extra "did we send to it" gate needed.
  const result = await suppressRecipientForHardBounce({
    clientId: input.clientId,
    email,
    contactId: input.contactId,
    outboundEmailId: input.outboundEmailId,
    bounceCategory: `opt_out:${verdict.evidence}`.slice(0, 200),
    providerEventType: "reply_opt_out",
    at: input.receivedAt,
    reason: "complaint",
  }, transaction);

  return { suppressed: result.suppressed, recipient: email };
}
