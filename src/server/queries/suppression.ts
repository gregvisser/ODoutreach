import "server-only";

import { prisma } from "@/lib/db";
import { assertClientInAccessibleList, whereInAccessibleClients } from "@/server/tenant/access";

export async function listSuppressionSourcesForStaff(
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

  return prisma.suppressionSource.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { name: true, id: true } },
      _count: { select: { suppressedEmails: true, suppressedDomains: true } },
    },
  });
}

export async function listSuppressedEmailsForStaff(
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

  return prisma.suppressedEmail.findMany({
    where,
    orderBy: { syncedAt: "desc" },
    take: 200,
    include: { client: { select: { name: true } } },
  });
}

export async function listSuppressedDomainsForStaff(
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

  return prisma.suppressedDomain.findMany({
    where,
    orderBy: { syncedAt: "desc" },
    take: 200,
    include: { client: { select: { name: true } } },
  });
}
