import "server-only";

import { prisma } from "@/lib/db";
import { startOfUtcDay } from "@/lib/sending-window";
import {
  assemblePlatformOrganisationOverviews,
  type PlatformOrganisationOverview,
} from "@/lib/tenant/platform-dashboard";

function countOf(value: { _all: number } | number | undefined): number {
  if (typeof value === "number") return value;
  return value?._all ?? 0;
}

/**
 * One row per organisation for the platform dashboard.
 * Read-only. Does not enter an organisation and does not write the audit log.
 */
export async function loadPlatformOrganisationOverviews(
  now = new Date(),
): Promise<PlatformOrganisationOverview[]> {
  const dayStart = startOfUtcDay(now);
  const [organisations, clients, aiGroups] = await Promise.all([
    prisma.organisation.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        rocketReachCreditsUsed: true,
        rocketReachCreditAllowance: true,
        aiSpendCapMicroUsd: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, organisationId: true },
    }),
    prisma.aiUsageEvent.groupBy({
      by: ["organisationId"],
      where: { status: "OK" },
      _sum: { costMicroUsd: true },
    }),
  ]);

  const clientIds = clients.map((client) => client.id);
  const mailboxRows: { clientId: string; connectionStatus: string; count: number }[] = [];
  const sentRows: { clientId: string; count: number }[] = [];
  const failedRows: { clientId: string; count: number }[] = [];

  if (clientIds.length > 0) {
    const [mailboxGroups, sentGroups, failedGroups] = await Promise.all([
      prisma.clientMailboxIdentity.groupBy({
        by: ["clientId", "connectionStatus"],
        where: { clientId: { in: clientIds }, isActive: true, workspaceRemovedAt: null },
        _count: { _all: true },
      }),
      prisma.outboundEmail.groupBy({
        by: ["clientId"],
        where: { clientId: { in: clientIds }, sentAt: { gte: dayStart } },
        _count: { _all: true },
      }),
      prisma.outboundEmail.groupBy({
        by: ["clientId"],
        where: { clientId: { in: clientIds }, status: "FAILED", updatedAt: { gte: dayStart } },
        _count: { _all: true },
      }),
    ]);
    for (const row of mailboxGroups) {
      mailboxRows.push({
        clientId: row.clientId,
        connectionStatus: row.connectionStatus,
        count: countOf(row._count),
      });
    }
    for (const row of sentGroups) {
      sentRows.push({ clientId: row.clientId, count: countOf(row._count) });
    }
    for (const row of failedGroups) {
      failedRows.push({ clientId: row.clientId, count: countOf(row._count) });
    }
  }

  return assemblePlatformOrganisationOverviews({
    organisations: organisations.map((organisation) => ({
      id: organisation.id,
      name: organisation.name,
      slug: organisation.slug,
      status: organisation.status,
      memberCount: organisation._count.members,
      rocketReachCreditsUsed: organisation.rocketReachCreditsUsed,
      rocketReachCreditAllowance: organisation.rocketReachCreditAllowance,
      aiSpendCapMicroUsd: organisation.aiSpendCapMicroUsd,
    })),
    clients,
    mailboxes: mailboxRows,
    sendsToday: sentRows,
    failedSendsToday: failedRows,
    aiSpendMicroUsd: aiGroups.flatMap((row) =>
      row.organisationId
        ? [{ organisationId: row.organisationId, costMicroUsd: row._sum.costMicroUsd ?? 0 }]
        : [],
    ),
  });
}
