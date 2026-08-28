import "server-only";

import { prisma } from "@/lib/db";

export async function listClientsForStaff(accessibleClientIds: string[]) {
  if (accessibleClientIds.length === 0) {
    return [];
  }
  return prisma.client.findMany({
    // F2 — never surface a soft-deleted workspace in normal lists. `accessibleClientIds`
    // already excludes them, but we filter here too so this query is correct in isolation.
    where: { id: { in: accessibleClientIds }, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      onboarding: true,
      mailboxIdentities: {
        select: {
          email: true,
          isActive: true,
          connectionStatus: true,
          canSend: true,
          isSendingEnabled: true,
        },
      },
      _count: {
        // `campaigns` counted the `Campaign` table, which nothing in this
        // product writes — outreach hangs off `ClientEmailSequence`. It read 0
        // for every client on the front door. Count the real thing.
        select: {
          contacts: true,
          emailSequences: true,
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
  return prisma.client.findFirst({
    // F2 — `findFirst` (not `findUnique`) so we can require `deletedAt: null`;
    // a soft-deleted workspace must not be loadable through the normal path.
    where: { id: clientId, deletedAt: null },
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
      // Who last set the account grade — rendered as the signature on the
      // account card. Name and email only; never the staff user id.
      accountGradeSetBy: { select: { displayName: true, email: true } },
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

/**
 * F2 — the super-admin recovery view: the ONLY query that returns soft-deleted
 * workspaces. Caller must be a super-admin (gate with `requireSuperAdmin`).
 * Ordered most-recently-deleted first so the recovery window is easy to read.
 */
export async function listSoftDeletedClients() {
  return prisma.client.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      deletedAt: true,
      deletedByStaffUserId: true,
      // Same correction as `listClientsForStaff` — `Campaign` is never written.
      _count: { select: { contacts: true, emailSequences: true } },
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
