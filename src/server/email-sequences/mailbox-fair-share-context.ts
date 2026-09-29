import "server-only";

import { prisma } from "@/lib/db";
import type { MailboxShareOwner } from "@/lib/mailboxes/mailbox-fair-share";

export type FairShareDispatchContext = {
  ownersByMailbox: ReadonlyMap<string, readonly MailboxShareOwner[]>;
  autoPickPeers: number;
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
 * Who is still waiting on each pinned mailbox, and how many auto-pick
 * sequences are waiting beside this launch. Read once per dispatch, before
 * the reservation transaction.
 */
export async function loadFairShareDispatchContext(input: {
  clientId: string;
  sequenceId: string;
  windowStart: Date;
}): Promise<FairShareDispatchContext> {
  const sequences = await prisma.clientEmailSequence.findMany({
    where: { clientId: input.clientId, status: "APPROVED" },
    select: { id: true, launchPreferredMailboxId: true },
  });
  if (sequences.length === 0) return { ownersByMailbox: new Map(), autoPickPeers: 0 };

  const readyGroups = await prisma.clientEmailSequenceStepSend.groupBy({
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

  const waiting = sequences.filter((sequence) => (readyBySequence.get(sequence.id) ?? 0) > 0);
  const autoPickPeers = waiting.filter(
    (sequence) => sequence.id !== input.sequenceId && !sequence.launchPreferredMailboxId,
  ).length;

  const pinned = waiting.flatMap((sequence) => {
    const mailboxId = sequence.launchPreferredMailboxId;
    return mailboxId ? [{ id: sequence.id, mailboxId }] : [];
  });
  const ownersByMailbox = new Map<string, MailboxShareOwner[]>();
  if (pinned.length === 0) return { ownersByMailbox, autoPickPeers };

  const mailboxIds = [...new Set(pinned.map((sequence) => sequence.mailboxId))];
  const sentRows = await prisma.outboundEmail.findMany({
    where: {
      clientId: input.clientId,
      mailboxIdentityId: { in: mailboxIds },
      queuedAt: { gte: input.windowStart },
      status: { in: [...SLOT_USING_STATUSES] },
    },
    select: { mailboxIdentityId: true, metadata: true },
  });
  const sentByKey = new Map<string, number>();
  for (const row of sentRows) {
    const sequenceId = sequenceIdFromMetadata(row.metadata);
    if (!sequenceId || !row.mailboxIdentityId) continue;
    const key = `${row.mailboxIdentityId}|${sequenceId}`;
    sentByKey.set(key, (sentByKey.get(key) ?? 0) + 1);
  }

  for (const sequence of pinned) {
    const list = ownersByMailbox.get(sequence.mailboxId) ?? [];
    list.push({
      sequenceId: sequence.id,
      sentToday: sentByKey.get(`${sequence.mailboxId}|${sequence.id}`) ?? 0,
    });
    ownersByMailbox.set(sequence.mailboxId, list);
  }
  return { ownersByMailbox, autoPickPeers };
}
