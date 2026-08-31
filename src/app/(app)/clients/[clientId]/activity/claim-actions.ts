"use server";

import { revalidatePath } from "next/cache";

import { claimReplyForStaff, releaseReplyClaims } from "@/server/inbox/reply-claim";
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
  /** Revalidated after claiming — set by an explicit "Claim" button so its
   * own screen updates; omitted by the passive auto-claim-on-mount notice. */
  revalidateReplyPath?: string;
}): Promise<{ ok: boolean }> {
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, input.clientId);

  await claimReplyForStaff({
    clientId: input.clientId,
    subject: { subjectType: input.subjectType, subjectId: input.subjectId },
    staffUserId: staff.id,
  });

  if (input.revalidateReplyPath) revalidatePath(input.revalidateReplyPath);

  return { ok: true };
}

/**
 * Row 132 — an explicit "release" so a person can hand a reply back without
 * waiting for the 30-minute auto-expiry or one of the other actions that
 * happen to clear it (replying, suppressing, marking handled). Advisory,
 * same as claiming: any staff member may release, not only the one who
 * claimed it — nothing here is a lock.
 */
export async function releaseReplyClaimAction(input: {
  clientId: string;
  subjectType: ReplyClaimSubjectType;
  subjectId: string;
  /** Revalidated after release so the badge updates without a manual refresh. */
  revalidateReplyPath?: string;
}): Promise<{ ok: boolean }> {
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, input.clientId);

  await releaseReplyClaims({
    clientId: input.clientId,
    subject: { subjectType: input.subjectType, subjectId: input.subjectId },
  });

  if (input.revalidateReplyPath) revalidatePath(input.revalidateReplyPath);

  return { ok: true };
}
