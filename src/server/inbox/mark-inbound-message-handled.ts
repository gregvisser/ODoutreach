import "server-only";

import { prisma } from "@/lib/db";
import {
  mergeHandlingIntoMetadata,
  readHandlingStateFromMetadata,
} from "@/lib/inbox/inbound-message-handling";
import { requireClientAccess } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";

export type MarkInboundMessageHandledResult =
  | { ok: true; handledAt: string; handledByStaffUserId: string }
  | { ok: false; error: string; errorCode: string };

/**
 * Operator marks an inbound message as "handled" without necessarily
 * sending a reply (e.g. handled out-of-band). Idempotent — if already
 * handled by someone else, the existing value is preserved.
 */
export async function markInboundMailboxMessageHandled(input: {
  staff: StaffUser;
  clientId: string;
  inboundMessageId: string;
}): Promise<MarkInboundMessageHandledResult> {
  const { staff, clientId, inboundMessageId } = input;
  await requireClientAccess(staff, clientId);

  const row = await prisma.inboundMailboxMessage.findFirst({
    where: { id: inboundMessageId, clientId },
    select: { id: true, metadata: true },
  });
  if (!row) {
    return {
      ok: false,
      errorCode: "INBOUND_NOT_FOUND",
      error: "That inbound message is not part of this workspace.",
    };
  }

  const current = readHandlingStateFromMetadata(row.metadata);
  const now = new Date().toISOString();
  const handledAt = current.handledAt ?? now;
  const handledByStaffUserId =
    current.handledByStaffUserId ?? staff.id;

  const nextMetadata = mergeHandlingIntoMetadata(row.metadata, {
    handledAt,
    handledByStaffUserId,
  });

  await prisma.inboundMailboxMessage.update({
    where: { id: row.id },
    data: { metadata: nextMetadata as object },
  });

  return { ok: true, handledAt, handledByStaffUserId };
}
