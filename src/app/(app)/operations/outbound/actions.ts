"use server";

import { revalidatePath } from "next/cache";

import {
  operatorRequeueFailedSend,
  releaseStaleProcessingClaimsForScope,
} from "@/server/email/outbound/operator-recovery";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { prisma } from "@/lib/db";
import { getAccessibleClientIds, requireClientAccess } from "@/server/tenant/access";

export async function releaseStaleProcessingAction(): Promise<{ released: number }> {
  const staff = await requireOpensDoorsStaff();
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
  const staff = await requireOpensDoorsStaff();
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
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, clientId);

  await prisma.client.update({
    where: { id: clientId },
    data: { senderIdentityStatus: "VERIFIED_READY" },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/operations/outbound");
}
