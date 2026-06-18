"use server";

import { revalidatePath } from "next/cache";

import {
  operatorRequeueFailedSend,
  releaseStaleProcessingClaimsForScope,
} from "@/server/email/outbound/operator-recovery";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { requireOpensDoorsStaff, requireSuperAdmin } from "@/server/auth/staff";
import { prisma } from "@/lib/db";
import { getAccessibleClientIds, requireClientAccess } from "@/server/tenant/access";

export type QueueStatusResult = {
  queued: number;
  processing: number;
  failedTotal: number;
  staleQueued: number;
};

export async function getQueueStatusAction(): Promise<QueueStatusResult> {
  await requireSuperAdmin();

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  const [queued, processing, failedTotal, staleQueued] = await Promise.all([
    prisma.outboundEmail.count({ where: { status: "QUEUED" } }),
    prisma.outboundEmail.count({ where: { status: "PROCESSING" } }),
    prisma.outboundEmail.count({ where: { status: "FAILED" } }),
    prisma.outboundEmail.count({
      where: {
        status: "QUEUED",
        OR: [
          { queuedAt: { lt: thirtyMinAgo } },
          { queuedAt: null, createdAt: { lt: thirtyMinAgo } },
        ],
      },
    }),
  ]);

  return { queued, processing, failedTotal, staleQueued };
}

export type ProcessQueueActionResult = {
  ok: boolean;
  claimed: number;
  completed: number;
  errors: string[];
};

export async function processQueueAction(input: {
  limit: number;
}): Promise<ProcessQueueActionResult> {
  await requireSuperAdmin();

  const limit = Math.min(Math.max(input.limit, 1), 50);
  const result = await processOutboundSendQueue({ limit });

  revalidatePath("/operations/outbound");
  revalidatePath("/reporting");

  return { ok: true, ...result };
}

export async function releaseStaleProcessingAction(): Promise<{ released: number }> {
  // PR #140 (G9): admin-only — releasing claims affects the queue state
  // for every client in scope and is a support-only operation.
  const staff = await requireSuperAdmin();
  const accessible = await getAccessibleClientIds(staff);
  const r = await releaseStaleProcessingClaimsForScope(accessible);
  revalidatePath("/operations/outbound");
  revalidatePath("/activity");
  return { released: r.count };
}

export async function operatorRequeueFailedAction(input: {
  outboundEmailId: string;
  clientId: string;
}): Promise<{ ok: boolean; error?: string }> {
  // PR #140 (G9): admin-only — requeueing failed sends bypasses the
  // normal staff send path and is a support-only operation.
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) {
    return { ok: false, error: "Forbidden" };
  }
  await requireClientAccess(staff, input.clientId);

  const r = await operatorRequeueFailedSend(input.outboundEmailId, input.clientId);
  if (r.count === 0) {
    return {
      ok: false,
      error:
        "Could not requeue — only FAILED rows without a provider message id can be safely retried this way.",
    };
  }

  revalidatePath("/operations/outbound");
  revalidatePath("/activity");
  revalidatePath(`/activity/outbound/${input.outboundEmailId}`);
  return { ok: true };
}

export async function verifySenderIdentityReadyAction(clientId: string): Promise<void> {
  // PR #140 (G9): admin-only — flipping a client's sender identity to
  // VERIFIED_READY is a manual sign-off step after DNS/domain checks
  // pass in the Resend dashboard. Non-admin staff must not flip it.
  const staff = await requireSuperAdmin();
  await requireClientAccess(staff, clientId);

  await prisma.client.update({
    where: { id: clientId },
    data: { senderIdentityStatus: "VERIFIED_READY" },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/operations/outbound");
}
