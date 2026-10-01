import "server-only";

import { prisma } from "@/lib/db";
import { shapeSendHealth, type SendHealthReport } from "@/lib/outbound/send-health-report";

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function countOf(value: { _all: number } | number | undefined): number {
  if (typeof value === "number") return value;
  return value?._all ?? 0;
}

/**
 * Read-only send health for every workspace. No queue claim, no sheet sync,
 * no campaign change. Prospect addresses in failure text are stripped.
 */
export async function loadOutboundSendHealth(now = new Date()): Promise<SendHealthReport> {
  const dayStart = utcDayStart(now);
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, status: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) {
    return shapeSendHealth({
      now,
      dayStart,
      clients: [],
      statusCounts: [],
      ages: [],
      sentToday: [],
      failedToday: [],
      held: [],
      mailboxes: [],
      mailboxClientIds: [],
      dueFollowUps: [],
    });
  }

  const [statusCounts, ages, sentToday, failedToday, held, mailboxes, booked, dueFollowUps] = await Promise.all([
    prisma.outboundEmail.groupBy({
      by: ["clientId", "status"],
      where: { clientId: { in: clientIds } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ clientId: string; oldestQueuedMinutes: number | null; oldestProcessingMinutes: number | null }[]>`
      SELECT "clientId" AS "clientId",
        FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - MIN(COALESCE("queuedAt", "createdAt")) FILTER (WHERE "status" = 'QUEUED'::"OutboundEmailStatus"))) / 60)::int AS "oldestQueuedMinutes",
        FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - MIN("claimedAt") FILTER (WHERE "status" = 'PROCESSING'::"OutboundEmailStatus"))) / 60)::int AS "oldestProcessingMinutes"
      FROM "OutboundEmail"
      WHERE "clientId" = ANY(${clientIds}::text[])
        AND "status" IN ('QUEUED'::"OutboundEmailStatus", 'PROCESSING'::"OutboundEmailStatus")
      GROUP BY "clientId"
    `,
    prisma.outboundEmail.groupBy({
      by: ["clientId"],
      where: { clientId: { in: clientIds }, status: "SENT", sentAt: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.outboundEmail.groupBy({
      by: ["clientId", "lastErrorMessage"],
      where: { clientId: { in: clientIds }, status: "FAILED", updatedAt: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.clientEmailSequenceStepSend.groupBy({
      by: ["clientId", "blockedReason"],
      where: { clientId: { in: clientIds }, status: "READY", blockedReason: { not: null } },
      _count: { _all: true },
    }),
    prisma.clientMailboxIdentity.findMany({
      where: { clientId: { in: clientIds }, isActive: true },
      select: {
        id: true,
        clientId: true,
        email: true,
        dailySendCap: true,
        isSendingEnabled: true,
        connectionStatus: true,
      },
    }),
    prisma.mailboxSendReservation.groupBy({
      by: ["mailboxIdentityId"],
      where: {
        clientId: { in: clientIds },
        createdAt: { gte: dayStart },
        status: { in: ["RESERVED", "CONSUMED"] },
      },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ clientId: string; due: number }[]>`
      SELECT ss."clientId" AS "clientId", COUNT(*)::int AS "due"
      FROM "ClientEmailSequenceStepSend" ss
      JOIN "ClientEmailSequenceStep" step ON step."id" = ss."stepId"
      JOIN "ClientEmailSequenceEnrollment" enr ON enr."id" = ss."enrollmentId"
      JOIN "ClientEmailSequenceStep" prev
        ON prev."sequenceId" = step."sequenceId" AND prev."position" = step."position" - 1
      JOIN "ClientEmailSequenceStepSend" prev_send
        ON prev_send."enrollmentId" = ss."enrollmentId"
       AND prev_send."stepId" = prev."id"
       AND prev_send."status" = 'SENT'::"ClientEmailSequenceStepSendStatus"
      LEFT JOIN "OutboundEmail" prev_mail ON prev_mail."id" = prev_send."outboundEmailId"
      WHERE ss."clientId" = ANY(${clientIds}::text[])
        AND ss."status" = 'READY'::"ClientEmailSequenceStepSendStatus"
        AND ss."outboundEmailId" IS NULL
        AND step."category" <> 'INTRODUCTION'::"ClientEmailTemplateCategory"
        AND enr."status" = 'PENDING'::"ClientEmailSequenceEnrollmentStatus"
        AND COALESCE(prev_mail."sentAt", prev_send."updatedAt")
            + make_interval(
                days => GREATEST(step."delayDays", 0)::int,
                hours => GREATEST(COALESCE(step."delayHours", 0), 0)::int
              ) <= ${now}::timestamptz
      GROUP BY ss."clientId"
    `,
  ]);

  const bookedByMailbox = new Map(booked.map((row) => [row.mailboxIdentityId, countOf(row._count)]));
  return shapeSendHealth({
    now,
    dayStart,
    clients,
    statusCounts: statusCounts.map((row) => ({
      clientId: row.clientId,
      status: row.status,
      count: countOf(row._count),
    })),
    ages: ages.map((row) => ({
      clientId: row.clientId,
      oldestQueuedMinutes: row.oldestQueuedMinutes === null ? null : Number(row.oldestQueuedMinutes),
      oldestProcessingMinutes: row.oldestProcessingMinutes === null ? null : Number(row.oldestProcessingMinutes),
    })),
    sentToday: sentToday.map((row) => ({ clientId: row.clientId, count: countOf(row._count) })),
    failedToday: failedToday.map((row) => ({
      clientId: row.clientId,
      reason: row.lastErrorMessage,
      count: countOf(row._count),
    })),
    held: held.map((row) => ({
      clientId: row.clientId,
      reason: row.blockedReason,
      count: countOf(row._count),
    })),
    mailboxClientIds: mailboxes.map((row) => row.clientId),
    mailboxes: mailboxes.map((row) => ({
      mailbox: row.email,
      cap: row.dailySendCap,
      bookedToday: bookedByMailbox.get(row.id) ?? 0,
      connected: row.connectionStatus === "CONNECTED",
      sendingEnabled: row.isSendingEnabled,
    })),
    dueFollowUps: dueFollowUps.map((row) => ({ clientId: row.clientId, count: Number(row.due) })),
  });
}
