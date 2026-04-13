import "server-only";

import { prisma } from "@/lib/db";
import { assertClientInAccessibleList, whereInAccessibleClients } from "@/server/tenant/access";

export async function getReportingSnapshotsForStaff(
  accessibleClientIds: string[],
  filterClientId: string | undefined,
  from: Date,
) {
  if (accessibleClientIds.length === 0) {
    return [];
  }
  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const where = filterClientId
    ? { clientId: filterClientId, date: { gte: from } }
    : { ...whereInAccessibleClients(accessibleClientIds), date: { gte: from } };

  return prisma.reportingDailySnapshot.findMany({
    where,
    orderBy: { date: "asc" },
    include: { client: { select: { name: true, id: true } } },
  });
}
