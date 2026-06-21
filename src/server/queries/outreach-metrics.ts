import "server-only";

import { createLimiter, type TaskGate } from "@/lib/concurrency";
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
/**
 * Optional reporting window (inclusive lower / exclusive upper bound,
 * UTC). When set, EVENT metrics are filtered to the window: sends by
 * sentAt, replies by receivedAt, opt-outs by usedAt, opens by openedAt,
 * bounces by bouncedAt (falling back to the send time when the webhook
 * didn't stamp one), failures by createdAt. STATE metrics — queued now,
 * suppressed/skipped, contact counts — have no historical form and stay
 * live values regardless of the window; the Reports page labels them.
 */
export type MetricsWindow = { gte: Date; lt: Date };

/**
 * Max metric COUNT queries the Reports loaders keep in flight at once.
 *
 * Each client contributes 13 counts and the global view fans out across
 * every accessible client, so the uncapped burst is `13 × clients` — enough
 * to exhaust the pg pool on a cold start right after login. The page then
 * throws its error boundary; a refresh against the now-warm pool succeeds.
 * Gating the counts keeps in-flight queries below the smallest pool the app
 * runs with (`PG_POOL_MAX` defaults to 10 — see src/lib/db.ts), so the fix
 * holds even if that env var is unset. Tunable via REPORT_QUERY_CONCURRENCY.
 */
const REPORT_QUERY_CONCURRENCY = (() => {
  const n = Number.parseInt(process.env.REPORT_QUERY_CONCURRENCY ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 8;
})();

export async function loadClientOutreachMetrics(
  clientId: string,
  accessibleClientIds: string[],
  window?: MetricsWindow,
): Promise<OutreachMetrics> {
  assertClientInAccessibleList(clientId, accessibleClientIds);

  const run = createLimiter(REPORT_QUERY_CONCURRENCY);
  const raw = await gatherRawCounts({ clientId }, run, window);
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
  window?: MetricsWindow,
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

  const totals = emptyRawCounts();
  // Until at least one client in scope has a delivery event, leave
  // deliveryTracked=false. As soon as we observe any delivery proof, the
  // global aggregate flips to true.
  totals.deliveryTracked = false;

  // PERF / STABILITY: this is the post-login landing page (→ /reporting).
  // The per-client counts must not run sequentially (login latency would
  // grow linearly with client count) nor all at once (13 × clients queries
  // in one burst exhausts the pg pool on a cold post-login start, so the
  // page throws its error boundary). One shared limiter runs every client's
  // counts concurrently while capping total in-flight queries — see
  // REPORT_QUERY_CONCURRENCY.
  const run = createLimiter(REPORT_QUERY_CONCURRENCY);
  const rawByClient = await Promise.all(
    clients.map(async (client) => ({
      client,
      raw: await gatherRawCounts({ clientId: client.id }, run, window),
    })),
  );

  const perClient: ClientMetricsRow[] = [];
  for (const { client, raw } of rawByClient) {
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

async function gatherRawCounts(
  scope: {
    clientId: string;
  },
  run: TaskGate,
  window?: MetricsWindow,
): Promise<RawMetricsCounts> {
  const { clientId } = scope;
  // Inclusive-from / exclusive-to bound applied to the relevant event
  // timestamp of each windowed metric. Undefined → all-time (unchanged
  // behaviour).
  const w = window ? { gte: window.gte, lt: window.lt } : undefined;
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
    run(() => prisma.outboundEmail.count({
      where: {
        clientId,
        status: { in: ["SENT", "DELIVERED", "REPLIED", "BOUNCED"] },
        // Windowed: a sentAt inside the window is itself the send proof.
        // All-time: sentAt OR providerMessageId proves the send.
        ...(w
          ? { sentAt: w }
          : {
              OR: [
                { sentAt: { not: null } },
                { providerMessageId: { not: null } },
              ],
            }),
      },
    })),
    run(() => prisma.clientEmailSequenceStepSend.count({
      // Step-send rows flip to SENT at dispatch, so updatedAt is the send
      // moment for windowing purposes.
      where: { clientId, status: "SENT", ...(w ? { updatedAt: w } : {}) },
    })),
    run(() => prisma.outboundEmail.count({
      where: {
        clientId,
        // Include the full pre-send lifecycle so staff understand exactly
        // how much is still waiting on the sender, not just the QUEUED slice.
        // Deliberately NOT windowed — "waiting right now" has no history.
        status: { in: ["REQUESTED", "PREPARING", "QUEUED", "PROCESSING"] },
      },
    })),
    run(() => prisma.outboundEmail.count({
      where: {
        clientId,
        status: "DELIVERED",
        deliveredAt: w ?? { not: null },
      },
    })),
    run(() => prisma.outboundEmail.count({
      where: {
        clientId,
        status: "BOUNCED",
        // Window on when the bounce happened; webhooks that didn't stamp
        // bouncedAt fall back to the send time so the row isn't lost.
        ...(w
          ? { OR: [{ bouncedAt: w }, { bouncedAt: null, sentAt: w }] }
          : {}),
      },
    })),
    run(() => prisma.outboundEmail.count({
      where: {
        clientId,
        status: "FAILED",
        ...(w ? { createdAt: w } : {}),
      },
    })),
    run(() => prisma.clientEmailSequenceStepSend.count({
      where: {
        clientId,
        // Deliberately NOT windowed — planning state, not an event.
        status: { in: ["SUPPRESSED", "SKIPPED", "BLOCKED"] },
        // Exclude 10-day outreach-cooldown deferrals. Those contacts were
        // ALREADY emailed (that's why they're in cooldown) — they're
        // counted under "Sent" via their original send. Counting them
        // again as suppressed/skipped would wrongly inflate "Not reached"
        // for people who were, in fact, reached.
        NOT: { blockedReason: { contains: "cooldown", mode: "insensitive" } },
      },
    })),
    run(() => prisma.inboundReply.count({
      where: {
        clientId,
        matchMethod: { not: "UNLINKED" },
        linkedOutboundEmailId: { not: null },
        ...(w ? { receivedAt: w } : {}),
      },
    })),
    run(() => prisma.unsubscribeToken.count({
      where: {
        clientId,
        usedAt: w ?? { not: null },
      },
    })),
    run(() => prisma.contact.count({ where: { clientId } })),
    run(() => prisma.contact.count({
      where: {
        clientId,
        email: { not: null },
        isSuppressed: false,
      },
    })),
    run(() => prisma.outboundProviderEvent.count({
      where: {
        clientId,
        eventType: { contains: DELIVERY_EVENT_TYPE_FRAGMENT, mode: "insensitive" },
      },
    })),
    // Opens: distinct outbound emails whose tracking pixel has loaded at
    // least once (openedAt set by /api/track/open). See open-pixel.ts.
    run(() => prisma.outboundEmail.count({
      where: { clientId, openedAt: w ?? { not: null } },
    })),
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
