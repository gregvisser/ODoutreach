"use server";

import { claimReplyForStaff } from "@/server/inbox/reply-claim";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";
import type { ReplyClaimSubjectType } from "@/lib/inbox/reply-claim";

/**
 * Records that this operator has opened a reply, so the next person to open
 * it is told. ADVISORY ONLY — nothing is locked and no email moves.
 *
 * Called from a client component on mount rather than during the page render
 * so that a Next.js link prefetch does not write a claim for a reply nobody
 * actually opened.
 *
 * Staff and tenant are re-verified here, like every other mutation: the
 * subject id arrives from the browser and is never trusted on its own.
 */
export async function claimReplyAction(input: {
  clientId: string;
  subjectType: ReplyClaimSubjectType;
  subjectId: string;
}): Promise<{ ok: boolean }> {
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, input.clientId);

  await claimReplyForStaff({
    clientId: input.clientId,
    subject: { subjectType: input.subjectType, subjectId: input.subjectId },
    staffUserId: staff.id,
  });

  return { ok: true };
}
