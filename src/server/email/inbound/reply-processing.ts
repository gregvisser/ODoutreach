import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canApplyReplyMilestone } from "@/server/email/outbound/lifecycle";
import { stopFollowUpsForLinkedReply } from "@/server/email-sequences/stop-follow-ups-on-reply";
import { suppressReplyOptOut } from "@/server/mailbox/opt-out-detection";

/** Serialize both ingestion paths for an identity, including the first insert.
 * Existing data has no unique reply identity constraint. The transaction lock
 * prevents concurrent check-then-create duplicates without rewriting old rows.
 * ReadCommitted makes a waiter see the preceding transaction's committed reply.
 * Only database work belongs inside this transaction; classification stays out.
 */
export async function withReplyIdentityTransaction<T>(
  clientId: string,
  providerMessageId: string | null,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (providerMessageId) {
      const identity = JSON.stringify([clientId, providerMessageId]);
      // Select an integer, not PostgreSQL's void lock result, for Prisma.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(
        hashtext('odoutreach.inbound-reply'), hashtext(${identity}))`;
    }
    return operation(tx);
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 15_000 });
}

/** Replay the protective effects using the reply's original saved association.
 * Every write participates in the caller's transaction. Replaying an old reply
 * repairs partial processing; terminal bounce/failure and exclusion states stay
 * intact. An unlinked reply must never be rematched to a newer campaign.
 */
export async function applyLinkedReplyEffects(
  tx: Prisma.TransactionClient,
  input: {
    clientId: string;
    linkedOutboundEmailId: string | null;
    contactId: string | null;
    fromEmail: string;
    subject: string | null;
    bodyText: string | null;
    receivedAt: Date;
    detectOptOut: boolean;
  },
): Promise<void> {
  if (!input.linkedOutboundEmailId) return;
  const outbound = await tx.outboundEmail.findUnique({
    where: { id: input.linkedOutboundEmailId, clientId: input.clientId },
    select: { id: true, status: true },
  });
  if (!outbound) return;

  if (outbound.status !== "REPLIED" && canApplyReplyMilestone(outbound.status)) {
    await tx.outboundEmail.updateMany({
      where: { id: outbound.id, clientId: input.clientId, status: outbound.status },
      data: { status: "REPLIED" },
    });
  }
  await stopFollowUpsForLinkedReply({
    clientId: input.clientId,
    outboundEmailId: outbound.id,
  }, tx);
  if (input.detectOptOut) {
    await suppressReplyOptOut({
      clientId: input.clientId,
      fromEmail: input.fromEmail,
      subject: input.subject,
      bodyText: input.bodyText,
      contactId: input.contactId,
      outboundEmailId: outbound.id,
      receivedAt: input.receivedAt,
    }, tx);
  }
}
