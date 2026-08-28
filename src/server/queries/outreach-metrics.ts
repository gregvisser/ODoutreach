import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { createLimiter, type TaskGate } from "@/lib/concurrency";
import { prisma } from "@/lib/db";
import { listActiveInternalSeedEmails } from "@/server/internal-seed/seed-allowlist";
import { buildProvenSentWhere } from "@/server/queries/proven-send";
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
 * Max metric queries the Reports loaders keep in flight at once.
 *
 * The scope costs 13 aggregate queries regardless of how many clients are in
 * it (see `gatherRawCountsByClient`), which is still more than the smallest pg
 * pool the app runs with (`PG_POOL_MAX` defaults to 10 — see src/lib/db.ts).
 * Gating them keeps in-flight queries below that pool on a cold post-login
 * start, where an uncapped burst used to exhaust it and throw the page's error
 * boundary. Tunable via REPORT_QUERY_CONCURRENCY.
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
  const byClient = await gatherRawCountsByClient([clientId], run, window);
  return deriveOutreachMetrics(byClient.get(clientId) ?? emptyRawCounts());
}

/**
 * PR #132 — Global outreach metrics across all accessible clients.
 *
 * Produces both a global total and a per-client breakdown from a single
 * grouped pass over the scope — see `gatherRawCountsByClient`.
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

  const run = createLimiter(REPORT_QUERY_CONCURRENCY);
  const rawByClient = await gatherRawCountsByClient(
    clients.map((c) => c.id),
    run,
    window,
  );

  const perClient: ClientMetricsRow[] = [];
  for (const client of clients) {
    const raw = rawByClient.get(client.id) ?? emptyRawCounts();
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
    totals.repliedEmails += raw.repliedEmails;
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
    repliedEmails: 0,
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

/** One `GROUP BY "clientId"` result row. */
type GroupedCount = { clientId: string | null; _count: { _all: number } };

/**
 * Fold a grouped result into `clientId → count`. Clients with no matching rows
 * are simply absent, so every read goes through `countFor`, which defaults to 0.
 *
 * `OutboundProviderEvent.clientId` is nullable, so the group key is typed
 * `string | null` even though the `clientId: { in: [...] }` filter means a null
 * key can never come back. Dropped explicitly rather than cast away.
 */
function tallyByClient(rows: GroupedCount[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.clientId === null) continue;
    out.set(row.clientId, row._count._all);
  }
  return out;
}

function countFor(tally: Map<string, number>, clientId: string): number {
  return tally.get(clientId) ?? 0;
}

/**
 * Every raw count for a whole scope of clients, in a fixed number of queries.
 *
 * PERF (queue item 27, defect 3): this used to be 13 `count()` queries PER
 * CLIENT. On the 17-client production scope that made /reporting — the page
 * you land on after signing in — cost 239 round-trips, measured, and it was
 * the slowest linked screen in the app at 2,464 ms to first byte. The same 13
 * predicates now run once each as `GROUP BY "clientId"` aggregates over the
 * whole scope, so the cost is flat: 17 clients cost what 1 client costs.
 * `outreach-metrics.perf.integration.test.ts` measures this at 1, 5 and 17
 * clients and fails if the count ever grows with the scope again.
 *
 * The predicates themselves are deliberately unchanged — this is a change to
 * how many times the database is asked, never to what it is asked.
 */
async function gatherRawCountsByClient(
  clientIds: string[],
  run: TaskGate,
  window?: MetricsWindow,
): Promise<Map<string, RawMetricsCounts>> {
  if (clientIds.length === 0) return new Map();
  const clientScope = { in: clientIds };
  // Inclusive-from / exclusive-to bound applied to the relevant event
  // timestamp of each windowed metric. Undefined → all-time (unchanged
  // behaviour).
  const w = window ? { gte: window.gte, lt: window.lt } : undefined;
  // Feature A — exclude internal seed/allowlist addresses from the
  // reputation-sensitive OutboundEmail metrics (sent / delivered / bounced /
  // opened / failed) so internal test sends never skew real campaign analytics.
  // Flag-gated: `listActiveInternalSeedEmails` returns `[]` (no query) when the
  // feature is off, so `seedExclusion` is `{}` and the counts are unchanged.
  //
  // Read ONCE for the whole scope. It used to be read per client, which with
  // the flag on cost one extra query per client on the landing page.
  const seedEmails = await listActiveInternalSeedEmails();
  const seedExclusion =
    seedEmails.length > 0 ? { toEmail: { notIn: seedEmails } } : {};
  // The definition of "an email we can prove we sent". Declared ONCE — in
  // `proven-send.ts` — because it is the denominator of every rate on the
  // Reports page, the base of the replied-emails numerator, AND the client
  // Overview's activity signal.
  //
  // It used to be this literal. Two consequences of that, both real defects:
  // if the denominator and the numerator drifted apart the reply rate could
  // exceed 100% again; and the Overview, which had no access to this literal,
  // answered the activity question with a metadata filter instead and told a
  // paying customer "Activity — not started" about a client that had sent.
  // `proven-send.test.ts` compares the two call sites and fails on any drift.
  const sentWithProofWhere: Prisma.OutboundEmailWhereInput =
    buildProvenSentWhere({ clientId: clientScope, seedEmails, window });
  const [
    sentWithProofBy,
    allStepSendsSentBy,
    queuedOrProcessingBy,
    deliveredBy,
    bouncesBy,
    failedBy,
    suppressedOrSkippedBy,
    repliesBy,
    repliedEmailsBy,
    unsubscribesBy,
    totalContactsBy,
    emailSendableBy,
    deliveryEventCountBy,
    opensBy,
  ] = (await Promise.all([
    run(() => prisma.outboundEmail.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: sentWithProofWhere,
    })),
    run(() => prisma.clientEmailSequenceStepSend.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      // Step-send rows flip to SENT at dispatch, so updatedAt is the send
      // moment for windowing purposes.
      where: {
        clientId: clientScope,
        status: "SENT",
        ...(w ? { updatedAt: w } : {}),
      },
    })),
    run(() => prisma.outboundEmail.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        // Include the full pre-send lifecycle so staff understand exactly
        // how much is still waiting on the sender, not just the QUEUED slice.
        // Deliberately NOT windowed — "waiting right now" has no history.
        status: { in: ["REQUESTED", "PREPARING", "QUEUED", "PROCESSING"] },
      },
    })),
    run(() => prisma.outboundEmail.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        ...seedExclusion,
        status: "DELIVERED",
        deliveredAt: w ?? { not: null },
      },
    })),
    run(() => prisma.outboundEmail.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        ...seedExclusion,
        status: "BOUNCED",
        // Window on when the bounce happened; webhooks that didn't stamp
        // bouncedAt fall back to the send time so the row isn't lost.
        ...(w
          ? { OR: [{ bouncedAt: w }, { bouncedAt: null, sentAt: w }] }
          : {}),
      },
    })),
    run(() => prisma.outboundEmail.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        ...seedExclusion,
        status: "FAILED",
        ...(w ? { createdAt: w } : {}),
      },
    })),
    run(() => prisma.clientEmailSequenceStepSend.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
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
    run(() => prisma.inboundReply.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        matchMethod: { not: "UNLINKED" },
        linkedOutboundEmailId: { not: null },
        ...(w ? { receivedAt: w } : {}),
      },
    })),
    // Queue item 27, defect (8) — the NUMERATOR of the reply rate: how many
    // of the emails above drew at least one reply. Counted on OutboundEmail
    // with `sentWithProofWhere` verbatim, so the result is a strict subset of
    // `sentWithProofBy` and the rate is arithmetically incapable of exceeding
    // 100%. Counting InboundReply rows instead — which is what shipped — made
    // BidlowAI report 133.3%, because one prospect replying twice to one
    // email is two messages but still only one email that got a reply.
    //
    // Windowed on the SEND, not on the reply: "of the emails sent in this
    // period, how many were replied to". Windowing the reply instead would
    // drop replies that arrived after the window closed and silently
    // understate the cohort.
    run(() => prisma.outboundEmail.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        ...sentWithProofWhere,
        inboundReplies: { some: { matchMethod: { not: "UNLINKED" } } },
      },
    })),
    run(() => prisma.unsubscribeToken.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        usedAt: w ?? { not: null },
      },
    })),
    run(() => prisma.contact.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: { clientId: clientScope },
    })),
    run(() => prisma.contact.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        email: { not: null },
        isSuppressed: false,
      },
    })),
    run(() => prisma.outboundProviderEvent.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        eventType: { contains: DELIVERY_EVENT_TYPE_FRAGMENT, mode: "insensitive" },
      },
    })),
    // Opens: distinct outbound emails whose tracking pixel has loaded at
    // least once (openedAt set by /api/track/open). See open-pixel.ts.
    run(() => prisma.outboundEmail.groupBy({
      by: ["clientId"],
      _count: { _all: true },
      where: {
        clientId: clientScope,
        ...seedExclusion,
        openedAt: w ?? { not: null },
      },
    })),
  ])).map(tallyByClient);

  const out = new Map<string, RawMetricsCounts>();
  for (const clientId of clientIds) {
    const sentWithProof = countFor(sentWithProofBy, clientId);
    const queuedOrProcessing = countFor(queuedOrProcessingBy, clientId);
    const delivered = countFor(deliveredBy, clientId);
    const sentProofMissing = Math.max(
      0,
      countFor(allStepSendsSentBy, clientId) - sentWithProof - queuedOrProcessing,
    );

    out.set(clientId, {
      sentWithProof,
      queued: queuedOrProcessing,
      sentProofMissing,
      delivered,
      // Evidence-based tracking: either we successfully transitioned a row to
      // DELIVERED, or we received any delivery webhook for this client.
      deliveryTracked:
        delivered > 0 || countFor(deliveryEventCountBy, clientId) > 0,
      opens: countFor(opensBy, clientId),
      // Open tracking is live (pixel injected into outgoing HTML). Approximate
      // by nature — Apple MPP inflates, image-blocking clients suppress.
      opensTracked: true,
      replies: countFor(repliesBy, clientId),
      repliedEmails: countFor(repliedEmailsBy, clientId),
      unsubscribes: countFor(unsubscribesBy, clientId),
      bounces: countFor(bouncesBy, clientId),
      failed: countFor(failedBy, clientId),
      suppressedOrSkipped: countFor(suppressedOrSkippedBy, clientId),
      totalContacts: countFor(totalContactsBy, clientId),
      emailSendable: countFor(emailSendableBy, clientId),
    });
  }
  return out;
}
