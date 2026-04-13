import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Authenticated queue depth + integration flags for cron/monitoring (Bearer PROCESS_QUEUE_SECRET).
 * Does not return row contents — counts only.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Queue processor not configured" }, { status: 503 });
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [
    queued,
    processing,
    failedTotal,
    failedRecent,
    stuckQueuedApprox,
    recentProviderEvents,
  ] = await Promise.all([
    prisma.outboundEmail.count({ where: { status: "QUEUED" } }),
    prisma.outboundEmail.count({ where: { status: "PROCESSING" } }),
    prisma.outboundEmail.count({ where: { status: "FAILED" } }),
    prisma.outboundEmail.count({
      where: { status: "FAILED", updatedAt: { gte: hourAgo } },
    }),
    prisma.outboundEmail.count({
      where: {
        status: "QUEUED",
        OR: [
          { queuedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
          { queuedAt: null, createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } },
        ],
      },
    }),
    prisma.outboundProviderEvent.count({
      where: { receivedAt: { gte: hourAgo } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    outbound: {
      queued,
      processing,
      failedTotal,
      failedLastHour: failedRecent,
      queuedOlderThan30mApprox: stuckQueuedApprox,
    },
    observability: {
      outboundProviderEventsLastHour: recentProviderEvents,
    },
    integrations: {
      emailProvider: (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase(),
      resendWebhookSecretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      autoprocessOutboundQueue: process.env.AUTOPROCESS_OUTBOUND_QUEUE === "true",
    },
  });
}
