import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { whereInAccessibleClients } from "@/server/tenant/access";

type SnapshotWithClient = Prisma.ReportingDailySnapshotGetPayload<{
  include: { client: { select: { name: true; id: true } } };
}>;

type OutboundWithClient = Prisma.OutboundEmailGetPayload<{
  include: { client: { select: { name: true } }; contact: true };
}>;

type InboundWithClient = Prisma.InboundReplyGetPayload<{
  include: { client: { select: { name: true } } };
}>;

function emptySummary() {
  return {
    clientCount: 0,
    sentTotal: 0,
    replyTotal: 0,
    replyRate: 0,
    recentOutbound: [] as OutboundWithClient[],
    recentReplies: [] as InboundWithClient[],
    snapshots: [] as SnapshotWithClient[],
    campaignsActive: 0,
  };
}

export async function getDashboardSummaryForStaff(accessibleClientIds: string[]) {
  if (accessibleClientIds.length === 0) {
    return emptySummary();
  }

  const scope = whereInAccessibleClients(accessibleClientIds);
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 14);

  const [
    clientCount,
    sentTotal,
    replyTotal,
    recentOutbound,
    recentReplies,
    snapshots,
    campaignsActive,
  ] = await Promise.all([
    prisma.client.count({
      where: {
        id: { in: accessibleClientIds },
        status: "ACTIVE",
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "SENT",
        sentAt: { gte: from },
      },
    }),
    prisma.inboundReply.count({
      where: {
        ...scope,
        receivedAt: { gte: from },
      },
    }),
    prisma.outboundEmail.findMany({
      where: scope,
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: { client: { select: { name: true } }, contact: true },
    }),
    prisma.inboundReply.findMany({
      where: scope,
      orderBy: { receivedAt: "desc" },
      take: 6,
      include: { client: { select: { name: true } } },
    }),
    prisma.reportingDailySnapshot.findMany({
      where: {
        ...scope,
        date: { gte: from },
      },
      orderBy: { date: "asc" },
      include: { client: { select: { name: true, id: true } } },
    }),
    prisma.campaign.count({
      where: {
        ...scope,
        status: "ACTIVE",
      },
    }),
  ]);

  const replyRate =
    sentTotal + replyTotal > 0
      ? Math.round((replyTotal / Math.max(sentTotal, 1)) * 1000) / 10
      : 0;

  return {
    clientCount,
    sentTotal,
    replyTotal,
    replyRate,
    recentOutbound,
    recentReplies,
    snapshots,
    campaignsActive,
  };
}
