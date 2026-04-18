import "server-only";

import { prisma } from "@/lib/db";

export async function getRecentInboundMailboxMessagesForClient(
  clientId: string,
  take = 50,
) {
  return prisma.inboundMailboxMessage.findMany({
    where: { clientId },
    orderBy: { receivedAt: "desc" },
    take,
    include: {
      mailbox: { select: { id: true, email: true, displayName: true } },
    },
  });
}
