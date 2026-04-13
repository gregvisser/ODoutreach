import "server-only";

import { prisma } from "@/lib/db";
import {
  assertClientInAccessibleList,
  whereInAccessibleClients,
} from "@/server/tenant/access";

const STUCK_QUEUE_MINUTES = 30;

export async function getOutboundOperationsSnapshot(
  accessibleClientIds: string[],
  filterClientId?: string,
) {
  if (accessibleClientIds.length === 0) {
    return {
      stuckQueued: [],
      staleProcessing: [],
      failedNoProvider: [],
      bounced: [],
      recentEvents: [],
    };
  }

  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const scope = filterClientId
    ? { clientId: filterClientId }
    : whereInAccessibleClients(accessibleClientIds);

  const stuckBefore = new Date(Date.now() - STUCK_QUEUE_MINUTES * 60 * 1000);
  const now = new Date();

  const [stuckQueued, staleProcessing, failedNoProvider, bounced, recentEvents] =
    await Promise.all([
      prisma.outboundEmail.findMany({
        where: {
          ...scope,
          status: "QUEUED",
          OR: [
            { queuedAt: { lt: stuckBefore } },
            { queuedAt: null, createdAt: { lt: stuckBefore } },
          ],
        },
        orderBy: { queuedAt: "asc" },
        take: 50,
        include: {
          client: { select: { name: true } },
          contact: { select: { email: true } },
        },
      }),
      prisma.outboundEmail.findMany({
        where: {
          ...scope,
          status: "PROCESSING",
          providerMessageId: null,
          claimExpiresAt: { lt: now },
        },
        orderBy: { claimedAt: "asc" },
        take: 50,
        include: {
          client: { select: { name: true } },
          contact: { select: { email: true } },
        },
      }),
      prisma.outboundEmail.findMany({
        where: {
          ...scope,
          status: "FAILED",
          providerMessageId: null,
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          client: { select: { name: true } },
          contact: { select: { email: true } },
        },
      }),
      prisma.outboundEmail.findMany({
        where: {
          ...scope,
          status: "BOUNCED",
        },
        orderBy: { bouncedAt: "desc" },
        take: 30,
        include: {
          client: { select: { name: true } },
          contact: { select: { email: true } },
        },
      }),
      prisma.outboundProviderEvent.findMany({
        where: filterClientId
          ? { clientId: filterClientId }
          : {
              OR: [
                { clientId: { in: accessibleClientIds } },
                { clientId: null },
              ],
            },
        orderBy: { receivedAt: "desc" },
        take: 40,
        select: {
          id: true,
          eventType: true,
          receivedAt: true,
          replayDuplicate: true,
          stateMutated: true,
          dedupeHash: true,
          providerMessageId: true,
          processingNote: true,
          outbound: { select: { id: true, toEmail: true, status: true } },
          client: { select: { name: true } },
        },
      }),
    ]);

  return {
    stuckQueued,
    staleProcessing,
    failedNoProvider,
    bounced,
    recentEvents,
  };
}
