import "server-only";

import { prisma } from "@/lib/db";
import { assertClientInAccessibleList } from "@/server/tenant/access";

export async function listContactsForStaff(
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
    : { clientId: { in: accessibleClientIds } };

  return prisma.contact.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { id: true, name: true, slug: true } },
      importBatch: {
        select: { fileName: true, status: true, summary: true },
      },
    },
    take: 500,
  });
}
