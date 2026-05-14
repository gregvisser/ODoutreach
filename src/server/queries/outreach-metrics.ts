import "server-only";

import { prisma } from "@/lib/db";
import {
  deriveOutreachMetrics,
  type ClientMetricsRow,
  type OutreachMetrics,
  type RawMetricsCounts,
} from "@/lib/reports/outreach-metrics";
import {
  assertClientInAccessibleList,
  whereInAccessibleClients,
} from "@/server/tenant/access";

/**
 * PR #132 — Per-client outreach metrics.
 *
 * Scoped strictly by clientId. Read-only.
 *
 * Counts "sent with proof" as OutboundEmail rows where sentAt OR
 * providerMessageId exists and status is in a provider-confirmed set.
 * Step-send SENT without a linked OutboundEmail is "send proof missing".
 */
export async function loadClientOutreachMetrics(
  clientId: string,
  accessibleClientIds: string[],
): Promise<OutreachMetrics> {
  assertClientInAccessibleList(clientId, accessibleClientIds);

  const raw = await gatherRawCounts({ clientId });
  return deriveOutreachMetrics(raw);
}

/**
 * PR #132 — Global outreach metrics across all accessible clients.
 *
 * Each client's counts are computed individually and then aggregated
 * to produce both a global total and a per-client breakdown.
 */
export async function loadGlobalOutreachMetrics(
  accessibleClientIds: string[],
): Promise<{
  global: OutreachMetrics;
  byClient: ClientMetricsRow[];
}> {
  if (accessibleClientIds.length === 0) {
    const empty = deriveOutreachMetrics(emptyRawCounts());
    return { global: empty, byClient: [] };
  }

  const clients = await prisma.client.findMany({
    where: { id: { in: accessibleClientIds } },
    select: { id: true, name: true },
  });

  const perClient: ClientMetricsRow[] = [];
  const totals = emptyRawCounts();

  for (const client of clients) {
    const raw = await gatherRawCounts({ clientId: client.id });
    perClient.push({
      clientId: client.id,
      clientName: client.name,
      metrics: deriveOutreachMetrics(raw),
    });
    totals.sentWithProof += raw.sentWithProof;
    totals.sentProofMissing += raw.sentProofMissing;
    totals.delivered += raw.delivered;
    totals.opens += raw.opens;
    totals.replies += raw.replies;
    totals.unsubscribes += raw.unsubscribes;
    totals.bounces += raw.bounces;
    totals.failed += raw.failed;
    totals.suppressedOrSkipped += raw.suppressedOrSkipped;
    totals.totalContacts += raw.totalContacts;
    totals.emailSendable += raw.emailSendable;
  }

  totals.deliveryTracked = true;
  totals.opensTracked = false;

  return {
    global: deriveOutreachMetrics(totals),
    byClient: perClient.sort((a, b) => b.metrics.sent - a.metrics.sent),
  };
}

function emptyRawCounts(): RawMetricsCounts {
  return {
    sentWithProof: 0,
    sentProofMissing: 0,
    delivered: 0,
    deliveryTracked: true,
    opens: 0,
    opensTracked: false,
    replies: 0,
    unsubscribes: 0,
    bounces: 0,
    failed: 0,
    suppressedOrSkipped: 0,
    totalContacts: 0,
    emailSendable: 0,
  };
}

async function gatherRawCounts(
  scope: { clientId: string } | ReturnType<typeof whereInAccessibleClients>,
): Promise<RawMetricsCounts> {
  const [
    sentWithProof,
    allStepSendsSent,
    delivered,
    bounces,
    failed,
    suppressedOrSkipped,
    replies,
    unsubscribes,
    totalContacts,
    emailSendable,
  ] = await Promise.all([
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: { in: ["SENT", "DELIVERED", "REPLIED", "BOUNCED"] },
        OR: [
          { sentAt: { not: null } },
          { providerMessageId: { not: null } },
        ],
      },
    }),
    prisma.clientEmailSequenceStepSend.count({
      where: { ...scope, status: "SENT" },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "DELIVERED",
        deliveredAt: { not: null },
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "BOUNCED",
      },
    }),
    prisma.outboundEmail.count({
      where: {
        ...scope,
        status: "FAILED",
      },
    }),
    prisma.clientEmailSequenceStepSend.count({
      where: {
        ...scope,
        status: { in: ["SUPPRESSED", "SKIPPED", "BLOCKED"] },
      },
    }),
    prisma.inboundReply.count({
      where: {
        ...scope,
        matchMethod: { not: "UNLINKED" },
        linkedOutboundEmailId: { not: null },
      },
    }),
    prisma.unsubscribeToken.count({
      where: {
        ...scope,
        usedAt: { not: null },
      },
    }),
    prisma.contact.count({ where: scope }),
    prisma.contact.count({
      where: {
        ...scope,
        email: { not: null },
        isSuppressed: false,
      },
    }),
  ]);

  const sentProofMissing = Math.max(0, allStepSendsSent - sentWithProof);

  return {
    sentWithProof,
    sentProofMissing,
    delivered,
    deliveryTracked: true,
    opens: 0,
    opensTracked: false,
    replies,
    unsubscribes,
    bounces,
    failed,
    suppressedOrSkipped,
    totalContacts,
    emailSendable,
  };
}
