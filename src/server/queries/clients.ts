import "server-only";

import { prisma } from "@/lib/db";

export async function listClientsForStaff(accessibleClientIds: string[]) {
  if (accessibleClientIds.length === 0) {
    return [];
  }
  return prisma.client.findMany({
    where: { id: { in: accessibleClientIds } },
    orderBy: { name: "asc" },
    include: {
      onboarding: true,
      _count: {
        select: {
          contacts: true,
          campaigns: true,
        },
      },
    },
  });
}

export async function getClientByIdForStaff(
  clientId: string,
  accessibleClientIds: string[],
) {
  if (!accessibleClientIds.includes(clientId)) {
    return null;
  }
  return prisma.client.findUnique({
    where: { id: clientId },
    include: {
      onboarding: true,
      suppressionSources: true,
      briefTaxonomyLinks: { include: { term: true } },
      complianceAttachments: {
        select: {
          id: true,
          fileName: true,
          sizeBytes: true,
          mimeType: true,
          createdAt: true,
        },
      },
      mailboxIdentities: {
        orderBy: [{ isPrimary: "desc" }, { emailNormalized: "asc" }],
      },
      _count: {
        select: {
          contacts: true,
          suppressedEmails: true,
          suppressedDomains: true,
          campaigns: true,
        },
      },
    },
  });
}

/** Every query for tenant data must filter by clientId — use this in route handlers. */
export function assertClientScope<T extends { clientId: string }>(
  row: T | null,
  expectedClientId: string,
): T | null {
  if (!row) return null;
  if (row.clientId !== expectedClientId) {
    throw new Error("Tenant isolation violation");
  }
  return row;
}
