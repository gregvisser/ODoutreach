import "server-only";

import { prisma } from "@/lib/db";
import { fairShareSentKey } from "@/lib/mailboxes/mailbox-fair-share";

export type FairShareDispatchContext = {
  /** Sequences that still have READY recipients, including the one launching. */
  readySequenceIds: readonly string[];
  /** Key `${mailboxId}|${sequenceId}` → sends booked in this sending window. */
  sentTodayByMailboxSequence: ReadonlyMap<string, number>;
};

const SLOT_USING_STATUSES = [
  "PREPARING",
  "REQUESTED",
  "QUEUED",
  "PROCESSING",
  "SENT",
  "BOUNCED",
  "DELIVERED",
  "REPLIED",
] as const;

function sequenceIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as { sequenceId?: unknown }).sequenceId;
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200
    ? value
    : null;
}

/**
 * Who still has READY work, and how many sends each sequence has booked on
 * each mailbox in this window. Read once per dispatch, before the reservation
 * transaction. Counts are per mailbox: mailbox A's sends are not stored
 * against mailbox B.
 */
export async function loadFairShareDispatchContext(input: {
  clientId: string;
  sequenceId: string;
  windowStart: Date;
}): Promise<FairShareDispatchContext> {
  const sequences = await prisma.clientEmailSequence.findMany({
    where: { clientId: input.clientId, status: "APPROVED" },
    select: { id: true },
  });
  const readyGroups = sequences.length === 0
    ? []
    : await prisma.clientEmailSequenceStepSend.groupBy({
        by: ["sequenceId"],
        where: {
          clientId: input.clientId,
          status: "READY",
          sequenceId: { in: sequences.map((sequence) => sequence.id) },
        },
        _count: { _all: true },
      });
  const readyBySequence = new Map(
    readyGroups.map((group) => [group.sequenceId, group._count._all]),
  );
  const readySequenceIds = [
    ...new Set([
      ...sequences
        .filter((sequence) => (readyBySequence.get(sequence.id) ?? 0) > 0)
        .map((sequence) => sequence.id),
      input.sequenceId,
    ]),
  ];
  const readySet = new Set(readySequenceIds);
  const sentTodayByMailboxSequence = new Map<string, number>();
  if (readySequenceIds.length === 0) {
    return { readySequenceIds, sentTodayByMailboxSequence };
  }

  const sentRows = await prisma.outboundEmail.findMany({
    where: {
      clientId: input.clientId,
      queuedAt: { gte: input.windowStart },
      status: { in: [...SLOT_USING_STATUSES] },
    },
    select: { mailboxIdentityId: true, metadata: true },
  });
  for (const row of sentRows) {
    const sequenceId = sequenceIdFromMetadata(row.metadata);
    if (!sequenceId || !row.mailboxIdentityId || !readySet.has(sequenceId)) continue;
    const key = fairShareSentKey(row.mailboxIdentityId, sequenceId);
    sentTodayByMailboxSequence.set(key, (sentTodayByMailboxSequence.get(key) ?? 0) + 1);
  }
  return { readySequenceIds, sentTodayByMailboxSequence };
}
