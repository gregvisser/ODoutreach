"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

export type ClearRepliesResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

/**
 * ADMIN-only. Permanently deletes ALL InboundReply rows for one client,
 * emptying the Replies section on the client's Activity page.
 *
 * Used to clear historical false-positive replies that were ingested before
 * the In-Reply-To gate was added to mailbox sync. The caller must type the
 * client's exact name to confirm — this is a destructive, non-reversible
 * operation.
 */
export async function clearClientReplies(input: {
  clientId: string;
  confirmation: string;
}): Promise<ClearRepliesResult> {
  const staff = await requireOpensDoorsStaff();
  if (staff.role !== "ADMIN") {
    return { ok: false, error: "Only administrators can clear replies." };
  }

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, name: true },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  if (input.confirmation.trim() !== client.name.trim()) {
    return {
      ok: false,
      error: `Confirmation text did not match. Type the client name exactly: "${client.name}".`,
    };
  }

  const result = await prisma.inboundReply.deleteMany({
    where: { clientId: client.id },
  });

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      clientId: client.id,
      action: "DELETE",
      entityType: "InboundReply",
      metadata: {
        kind: "clear_client_replies",
        deletedCount: result.count,
        triggeredBy: staff.email,
      },
    },
  });

  revalidatePath(`/clients/${client.id}/activity`);
  return { ok: true, deleted: result.count };
}
