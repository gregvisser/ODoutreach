import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/**
 * Primary mailbox must be {@link MailboxConnectionStatus.CONNECTED}. When any mailbox with
 * `isPrimary` becomes non-connected, clear primary from all mailboxes in the workspace and,
 * if possible, promote the first eligible connected sender (alphabetically by email).
 */
export async function reconcilePrimaryMailboxForClient(
  tx: Prisma.TransactionClient,
  clientId: string,
): Promise<void> {
  const invalidPrimary = await tx.clientMailboxIdentity.findFirst({
    where: {
      clientId,
      isPrimary: true,
      workspaceRemovedAt: null,
      connectionStatus: { not: "CONNECTED" },
    },
  });

  if (!invalidPrimary) return;

  await tx.clientMailboxIdentity.updateMany({
    where: { clientId, isPrimary: true },
    data: { isPrimary: false },
  });

  const nextPrimary = await tx.clientMailboxIdentity.findFirst({
    where: {
      clientId,
      workspaceRemovedAt: null,
      isActive: true,
      connectionStatus: "CONNECTED",
      canSend: true,
      isSendingEnabled: true,
    },
    orderBy: { emailNormalized: "asc" },
  });

  if (nextPrimary) {
    await tx.clientMailboxIdentity.update({
      where: { id: nextPrimary.id },
      data: { isPrimary: true },
    });
  }
}
