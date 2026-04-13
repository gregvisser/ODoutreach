import "server-only";

import { prisma } from "@/lib/db";
import { assertClientInAccessibleList, whereInAccessibleClients } from "@/server/tenant/access";

export async function listOutboundForStaff(
  accessibleClientIds: string[],
  filterClientId?: string,
) {
  if (accessibleClientIds.length === 0) {
    return [];
  }
  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const where = filterClientId
    ? { clientId: filterClientId }
    : whereInAccessibleClients(accessibleClientIds);

  return prisma.outboundEmail.findMany({
    where,
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take: 150,
    include: {
      client: { select: { name: true } },
      contact: { select: { email: true, firstName: true, lastName: true } },
      campaign: { select: { name: true } },
    },
  });
}

export async function listInboundForStaff(
  accessibleClientIds: string[],
  filterClientId?: string,
) {
  if (accessibleClientIds.length === 0) {
    return [];
  }
  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const where = filterClientId
    ? { clientId: filterClientId }
    : whereInAccessibleClients(accessibleClientIds);

  return prisma.inboundReply.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 150,
    include: {
      client: { select: { name: true } },
      contact: { select: { email: true } },
      linkedOutbound: {
        select: { id: true, subject: true, providerMessageId: true },
      },
    },
  });
}
