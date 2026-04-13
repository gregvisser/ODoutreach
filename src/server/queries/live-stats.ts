import "server-only";

import { prisma } from "@/lib/db";
import {
  assertClientInAccessibleList,
  whereInAccessibleClients,
} from "@/server/tenant/access";

/** Rolling-window operational counts from live tables (not snapshot rollups). */
export async function getLiveSendReplyStats(
  accessibleClientIds: string[],
  from: Date,
  filterClientId?: string,
) {
  if (accessibleClientIds.length === 0) {
    return {
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
      blocked: 0,
      pipeline: 0,
      replied: 0,
      replies: 0,
    };
  }

  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const scope = filterClientId
    ? { clientId: filterClientId }
    : whereInAccessibleClients(accessibleClientIds);

  const [
    sent,
    delivered,
    bounced,
    failed,
    blocked,
    pipeline,
    replied,
    replies,
  ] = await Promise.all([
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "SENT",
        sentAt: { gte: from },
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "DELIVERED",
        deliveredAt: { gte: from },
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "BOUNCED",
        bouncedAt: { gte: from },
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "FAILED",
        updatedAt: { gte: from },
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "BLOCKED_SUPPRESSION",
        createdAt: { gte: from },
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: {
          in: ["QUEUED", "PROCESSING", "REQUESTED", "PREPARING"],
        },
        updatedAt: { gte: from },
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "REPLIED",
        updatedAt: { gte: from },
      },
    }),
    prisma.inboundReply.count({
      where: {
        ...scope,
        receivedAt: { gte: from },
      },
    }),
  ]);

  return {
    sent,
    delivered,
    bounced,
    failed,
    blocked,
    pipeline,
    replied,
    replies,
  };
}
