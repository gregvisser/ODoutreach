import "server-only";

import { prisma } from "@/lib/db";
import {
  deriveOutreachMetrics,
  type ClientMetricsRow,
  type OutreachMetrics,
  type RawMetricsCounts,
} from "@/lib/reports/outreach-metrics";
import { assertClientInAccessibleList } from "@/server/tenant/access";

/**
 * PR #132 / PR #136 — Per-client outreach metrics.
 *
 * Scoped strictly by clientId. Read-only.
 *
 * Counts "sent with proof" as OutboundEmail rows where sentAt OR
 * providerMessageId exists and status is in a provider-confirmed set.
 * Step-send SENT without a linked OutboundEmail is "send proof missing".
 *
 * PR #136 — delivery tracking is no longer hardcoded to `true`. We mark a
 * scope as delivery-tracked only when there is evidence: either an
 * OutboundEmail with status=DELIVERED, or an OutboundProviderEvent with a
 * delivery event type. Providers like Microsoft Graph send do not emit
 * delivery webhooks; for those clients the rate would otherwise sit at 0%
 * forever and mislead staff. See `docs/ops/SYSTEM_HANDOVER_GAPS.md` G1.
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
  // Until at least one client in scope has a delivery event, leave
  // deliveryTracked=false. As soon as we observe any delivery proof, the
  // global aggregate flips to true.
  totals.deliveryTracked = false;

  for (const client of clients) {
    const raw = await gatherRawCounts({ clientId: client.id });
    perClient.push({
      clientId: client.id,
      clientName: client.name,
      metrics: deriveOutreachMetrics(raw),
    });
    totals.sentWithProof += raw.sentWithProof;
    totals.queued += raw.queued;
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
    if (raw.deliveryTracked) {
      totals.deliveryTracked = true;
    }
    if (raw.opensTracked) {
      totals.opensTracked = true;
    }
  }

  return {
    global: deriveOutreachMetrics(totals),
    byClient: perClient.sort((a, b) => b.metrics.sent - a.metrics.sent),
  };
}

function emptyRawCounts(): RawMetricsCounts {
  return {
    sentWithProof: 0,
    queued: 0,
    sentProofMissing: 0,
    delivered: 0,
    deliveryTracked: false,
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

/**
 * Lifecycle event names provider webhooks normalise to "delivered". The
 * webhook handler in `src/server/email/providers/*` lowercases inbound
 * event types before storage, so we match case-insensitively. Substring
 * match keeps us resilient to provider-specific suffixes (e.g.
 * `delivered.smtp` or `email.delivered`).
 */
const DELIVERY_EVENT_TYPE_FRAGMENT = "delivered";

async function gatherRawCounts(scope: {
  clientId: string;
}): Promise<RawMetricsCounts> {
  const [
    sentWithProof,
    allStepSendsSent,
    queuedOrProcessing,
    delivered,
    bounces,
    failed,
    suppressedOrSkipped,
    replies,
    unsubscribes,
    totalContacts,
    emailSendable,
    deliveryEventCount,
    opens,
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
        // Include the full pre-send lifecycle so staff understand exactly
        // how much is still waiting on the sender, not just the QUEUED slice.
        status: { in: ["REQUESTED", "PREPARING", "QUEUED", "PROCESSING"] },
      },
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
    prisma.outboundProviderEvent.count({
      where: {
        ...scope,
        eventType: { contains: DELIVERY_EVENT_TYPE_FRAGMENT, mode: "insensitive" },
      },
    }),
    // Opens: distinct outbound emails whose tracking pixel has loaded at
    // least once (openedAt set by /api/track/open). See open-pixel.ts.
    prisma.outboundEmail.count({
      where: { ...scope, openedAt: { not: null } },
    }),
  ]);

  const sentProofMissing = Math.max(
    0,
    allStepSendsSent - sentWithProof - queuedOrProcessing,
  );
  // Evidence-based tracking: either we successfully transitioned a row to
  // DELIVERED, or we received any delivery webhook in this scope.
  const deliveryTracked = delivered > 0 || deliveryEventCount > 0;

  return {
    sentWithProof,
    queued: queuedOrProcessing,
    sentProofMissing,
    delivered,
    deliveryTracked,
    opens,
    // Open tracking is live (pixel injected into outgoing HTML). Approximate
    // by nature — Apple MPP inflates, image-blocking clients suppress.
    opensTracked: true,
    replies,
    unsubscribes,
    bounces,
    failed,
    suppressedOrSkipped,
    totalContacts,
    emailSendable,
  };
}
