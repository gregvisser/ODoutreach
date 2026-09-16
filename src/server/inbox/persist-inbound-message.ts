import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { GraphMessageIdentityConflictError, lockGraphMessageIdentity, type GraphMessageIdentity } from "@/server/mailbox/graph-message-identity";
import { appendReplyOutboundId, mergeHandlingIntoMetadata, readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";

/** Refresh provider fields without replacing operator-owned handling history. */
export async function persistSyncedInboundMessage(
  args: Pick<Prisma.InboundMailboxMessageUpsertArgs, "where" | "create" | "update">,
  providerMetadata: Record<string, string | null | boolean>,
  graphIdentity?: GraphMessageIdentity,
): Promise<{ providerMessageId: string }> {
  // Providers never own this key, including if a future mapper adds it.
  const metadata = { ...providerMetadata };
  delete metadata.handling;
  return prisma.$transaction(async (tx) => {
    let canonicalArgs = args;
    if (graphIdentity) {
      await lockGraphMessageIdentity(tx, graphIdentity);
      const matches = await tx.inboundMailboxMessage.findMany({ where: {
        clientId: graphIdentity.clientId, mailboxIdentityId: graphIdentity.mailboxIdentityId,
        ingestionSource: "MICROSOFT_GRAPH", fromEmail: graphIdentity.fromEmail,
        receivedAt: new Date(graphIdentity.receivedAt),
        metadata: { path: ["internetMessageId"], equals: graphIdentity.internetMessageId },
      }, select: { id: true, providerMessageId: true }, take: 2 });
      if (matches.length > 1) throw new GraphMessageIdentityConflictError("Microsoft message identity is ambiguous; administrator review required.");
      if (matches[0]) {
        const exact = await tx.inboundMailboxMessage.findUnique({ where: args.where, select: { id: true } });
        if (exact && exact.id !== matches[0].id) throw new GraphMessageIdentityConflictError("Microsoft message identity conflicts with an existing message.");
        canonicalArgs = { ...args, where: { id: matches[0].id } };
      }
    }
    const row = await tx.inboundMailboxMessage.upsert({
      ...canonicalArgs, create: { ...args.create, metadata }, update: { ...args.update, metadata: undefined }, select: { id: true, providerMessageId: true },
    });
    // The upsert and patch hold the same row lock until commit. Merge against
    // the database value, not a snapshot read before an operator acted.
    await tx.$executeRaw`UPDATE "InboundMailboxMessage"
      SET metadata = (CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END)
        || ${JSON.stringify(metadata)}::jsonb
      WHERE id = ${row.id}`;
    return { providerMessageId: row.providerMessageId };
  }, { isolationLevel: "ReadCommitted" });
}

/** Serialize manual handling and sent-reply bookkeeping on the stored message. */
type RecordHandlingInput = {
  clientId: string;
  inboundMessageId: string;
  staffUserId: string;
  outboundEmailId?: string;
  now?: Date;
};

export async function recordInboundMessageHandling(input: RecordHandlingInput) {
  return prisma.$transaction((tx) => recordInboundMessageHandlingInTransaction(tx, input));
}

/** Also used by reply finalisation so SENT, the ledger and handling commit together. */
export async function recordInboundMessageHandlingInTransaction(tx: Prisma.TransactionClient, input: RecordHandlingInput) {
  const rows = await tx.$queryRaw<{ metadata: Prisma.JsonValue }[]>`
    SELECT metadata FROM "InboundMailboxMessage"
    WHERE id = ${input.inboundMessageId} AND "clientId" = ${input.clientId} FOR UPDATE`;
  if (!rows[0]) return null;
  const current = readHandlingStateFromMetadata(rows[0].metadata);
  const iso = (input.now ?? new Date()).toISOString();
  const handledAt = current.handledAt ?? iso;
  const handledByStaffUserId = current.handledByStaffUserId ?? input.staffUserId;
  const next = mergeHandlingIntoMetadata(rows[0].metadata, {
    handledAt, handledByStaffUserId,
    ...(input.outboundEmailId ? {
      lastRepliedAt: current.lastRepliedAt && current.lastRepliedAt > iso ? current.lastRepliedAt : iso,
      replyOutboundEmailIds: appendReplyOutboundId(current, input.outboundEmailId).replyOutboundEmailIds,
    } : {}),
  });
  await tx.inboundMailboxMessage.update({
    where: { id: input.inboundMessageId, clientId: input.clientId }, data: { metadata: next as Prisma.InputJsonObject },
  });
  return { handledAt, handledByStaffUserId };
}
