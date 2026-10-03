import "server-only";

import { prisma } from "@/lib/db";
import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { effectiveDailyCap } from "@/lib/mailboxes/mailbox-warmup";
import { loadClientCalendarPlanningContext } from "@/server/mailbox/client-sending-calendar";

/**
 * Safe daily send cap of each connected sending mailbox in the client's
 * workspace pool, the same pool sequences send from. Warm-up aware via
 * `effectiveDailyCap`. Today's send counter is ignored on purpose: a top-up
 * sizes for the next few days, not for what is left today.
 */
export async function loadSequenceMailboxDailyCaps(clientId: string, now: Date): Promise<number[]> {
  const mailboxes = await prisma.clientMailboxIdentity.findMany({
    where: {
      clientId,
      isActive: true,
      connectionStatus: "CONNECTED",
      canSend: true,
      isSendingEnabled: true,
      workspaceRemovedAt: null,
    },
    select: {
      id: true,
      dailySendCap: true,
      connectedAt: true,
      createdAt: true,
      workspaceRemovedAt: true,
    },
  });
  const pool = mailboxes.filter((mailbox) => !isMailboxRemovedFromWorkspace(mailbox));
  if (pool.length === 0) return [];
  const { sendingDays } = await loadClientCalendarPlanningContext(
    clientId,
    pool.map((mailbox) => mailbox.id),
    now,
  );
  return pool.map((mailbox) => effectiveDailyCap(mailbox, sendingDays.get(mailbox.id) ?? 0));
}
