import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { appendReplyOutboundId, mergeHandlingIntoMetadata, readHandlingStateFromMetadata } from "@/lib/inbox/inbound-message-handling";

/** Refresh provider fields without replacing operator-owned handling history. */
export async function persistSyncedInboundMessage(
  args: Pick<Prisma.InboundMailboxMessageUpsertArgs, "where" | "create" | "update">,
  providerMetadata: Record<string, string | null | boolean>,
): Promise<void> {
  // Providers never own this key, including if a future mapper adds it.
  const metadata = { ...providerMetadata };
  delete metadata.handling;
  await prisma.$transaction(async (tx) => {
    const row = await tx.inboundMailboxMessage.upsert({
      ...args, create: { ...args.create, metadata }, update: { ...args.update, metadata: undefined }, select: { id: true },
    });
    // The upsert and patch hold the same row lock until commit. Merge against
    // the database value, not a snapshot read before an operator acted.
    await tx.$executeRaw`UPDATE "InboundMailboxMessage"
      SET metadata = (CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END)
        || ${JSON.stringify(metadata)}::jsonb
      WHERE id = ${row.id}`;
  });
}

/** Serialize manual handling and sent-reply bookkeeping on the stored message. */
export async function recordInboundMessageHandling(input: {
  clientId: string;
  inboundMessageId: string;
  staffUserId: string;
  outboundEmailId?: string;
  now?: Date;
}) {
  return prisma.$transaction(async (tx) => {
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
  });
}
