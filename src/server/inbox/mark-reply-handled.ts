import "server-only";

import { prisma } from "@/lib/db";
import type { ReplyClaimSubjectType } from "@/lib/inbox/reply-claim";
import { releaseReplyClaims } from "@/server/inbox/reply-claim";
import { requireClientAccess, type StaffIdentity } from "@/server/tenant/access";

export type MarkInboundReplyHandledResult =
  | { ok: true; handledAt: Date; handledByStaffUserId: string }
  | { ok: false; reason: string };

/**
 * Row 132 — the durable "somebody dealt with this" state, owned by the
 * reply itself. Mirrors `markInboundMailboxMessageHandled`, but that older
 * function only covers replies correlated to a synced mailbox message; this
 * one works for every `InboundReply`, including webhook-ingested ones that
 * have no correlated mailbox message at all.
 *
 * Idempotent — first write wins. If Sarah already marked it handled, Bob
 * marking it again does not overwrite her name or timestamp.
 */
export async function markInboundReplyHandled(input: {
  staff: StaffIdentity;
  clientId: string;
  replyId: string;
  /** The claim subject to release, if the caller already resolved one
   * (e.g. correlated to a synced mailbox message). Falls back to the
   * reply's own id, matching `resolveReplyClaimSubject`'s fallback. */
  subjectType?: ReplyClaimSubjectType;
  subjectId?: string;
  now?: Date;
}): Promise<MarkInboundReplyHandledResult> {
  const { staff, clientId, replyId } = input;
  await requireClientAccess(staff, clientId);

  const row = await prisma.inboundReply.findFirst({
    where: { id: replyId, clientId },
    select: { id: true, handledAt: true, handledByStaffUserId: true },
  });
  if (!row) {
    return { ok: false, reason: "That reply is not part of this workspace." };
  }

  const now = input.now ?? new Date();

  if (row.handledAt && row.handledByStaffUserId) {
    // Already handled — nothing to write, and the original owner stands.
    return {
      ok: true,
      handledAt: row.handledAt,
      handledByStaffUserId: row.handledByStaffUserId,
    };
  }

  await prisma.inboundReply.update({
    where: { id: row.id },
    data: { handledAt: now, handledByStaffUserId: staff.id },
  });

  // Somebody acted — the advisory "X has this open" marker has served its
  // purpose and goes. Who handled it is recorded permanently above.
  await releaseReplyClaims({
    clientId,
    subject: {
      subjectType: input.subjectType ?? "INBOUND_REPLY",
      subjectId: input.subjectId ?? replyId,
    },
  });

  return { ok: true, handledAt: now, handledByStaffUserId: staff.id };
}
