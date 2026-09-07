import "server-only";

import { recordInboundMessageHandling } from "./persist-inbound-message";
import { releaseReplyClaims } from "@/server/inbox/reply-claim";
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

  const handling = await recordInboundMessageHandling({ clientId, inboundMessageId, staffUserId: staff.id });
  if (!handling) {
    return {
      ok: false,
      errorCode: "INBOUND_NOT_FOUND",
      error: "That inbound message is not part of this workspace.",
    };
  }

  // Somebody acted — the advisory "X is looking at this" marker has served
  // its purpose and goes. Who handled it is recorded permanently above.
  await releaseReplyClaims({
    clientId,
    subject: { subjectType: "INBOUND_MESSAGE", subjectId: inboundMessageId },
  });

  return { ok: true, ...handling };
}
