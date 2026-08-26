/**
 * Queue item 27, defect (3) — "/reporting is the landing page and the slowest
 * linked page" (2,464 ms TTFB cold, 6,027 ms to load, measured in Chrome on the
 * live site on 2026-08-26).
 *
 * The queue brief said to "profile the render, not the database", on the grounds
 * that `loadClientWorkspaceBundle` is a constant 19 round-trips. That reasoning
 * does not apply here: `/reporting` never calls `loadClientWorkspaceBundle`. It
 * calls `loadGlobalOutreachMetrics`, which fans 13 `count()` queries out PER
 * CLIENT. Production runs 17 clients. This file measures that instead of
 * assuming it, because a number nobody measured is how this repository keeps
 * shipping the wrong fix.
 *
 * The deliverable is the printed table. The assertions are a ratchet: the
 * round-trip count must not GROW with the number of clients. A count that is
 * flat from 1 client to 17 is a fixed cost; one that triples is an N+1, and no
 * amount of render profiling would have found it.
 *
 * Run it:
 *   docker run -d --name odoutreach-e2e-postgres \
 *     -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
 *     -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
 *   npm run db:migrate:e2e
 *   npm run test:integration -- outreach-metrics.perf
 */

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

type Recorded = { sql: string; ms: number };

const recorded: Recorded[] = [];
let capturing = false;

// Patch the DRIVER, not Prisma — same approach as
// client-workspace-bundle.perf.integration.test.ts, and for the same reason
// recorded there: `@prisma/adapter-pg` calls `query` on the POOL, so patching
// only `pg.Client.prototype` captures nothing and reports a triumphant zero.
const originalPoolQuery = pg.Pool.prototype.query;
const originalClientQuery = pg.Client.prototype.query;

function firstLine(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 120);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
function instrument(original: any) {
  return function patched(this: unknown, ...args: unknown[]) {
    const start = performance.now();
    const head = args[0];
    const sql =
      typeof head === "string"
        ? head
        : ((head as { text?: string } | undefined)?.text ?? "<non-text query>");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwarding to the real driver
    const result = (original as any).apply(this, args);

    if (result && typeof (result as Promise<unknown>).then === "function") {
      const done = () => {
        if (capturing) recorded.push({ sql, ms: performance.now() - start });
      };
      (result as Promise<unknown>).then(done, done);
    }
    return result;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
(pg.Pool.prototype as any).query = instrument(originalPoolQuery);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
(pg.Client.prototype as any).query = instrument(originalClientQuery);

afterAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore
  (pg.Pool.prototype as any).query = originalPoolQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore
  (pg.Client.prototype as any).query = originalClientQuery;
  await closeIntegrationPool();
});

beforeEach(async () => {
  await resetIntegrationDatabase();
});

/** Run `fn` with the driver recorder on, and hand back what it cost. */
async function measure<T>(fn: () => Promise<T>): Promise<{
  value: T;
  queries: number;
  dbMs: number;
  wallMs: number;
  statements: Recorded[];
}> {
  recorded.length = 0;
  capturing = true;
  const startedAt = performance.now();
  const value = await fn();
  const wallMs = performance.now() - startedAt;
  capturing = false;
  return {
    value,
    queries: recorded.length,
    dbMs: recorded.reduce((sum, r) => sum + r.ms, 0),
    wallMs,
    statements: [...recorded],
  };
}

describe("what the Reports landing page costs in database round-trips", () => {
  it("does not issue more queries as more clients are added", async () => {
    const { prisma } = await import("@/lib/db");
    const { loadGlobalOutreachMetrics } = await import(
      "@/server/queries/outreach-metrics"
    );

    // The internal-seed allowlist read is flag-gated and does NO query when
    // off, which would hide it from this measurement. Turn it on so the
    // per-client seed lookup is counted too — with an empty table it changes
    // no metric, only the query count.
    const previousFlag = process.env.INTERNAL_SEED_ALLOWLIST_ENABLED;
    process.env.INTERNAL_SEED_ALLOWLIST_ENABLED = "true";

    try {
      // Warm the pool and Prisma's first-use chatter so the first size is not
      // charged for connection setup.
      await loadGlobalOutreachMetrics([]);

      // 17 is what production actually runs (see the 2026-08-26 UX walk).
      const SIZES = [1, 5, 17];
      const results: {
        clients: number;
        queries: number;
        dbMs: number;
        wallMs: number;
      }[] = [];
      let lastStatements: Recorded[] = [];

      const ids: string[] = [];
      for (const size of SIZES) {
        while (ids.length < size) {
          const n = ids.length;
          const client = await prisma.client.create({
            data: { name: `Metrics ${n}`, slug: `metrics-perf-${n}` },
          });
          ids.push(client.id);
        }

        const run = await measure(() => loadGlobalOutreachMetrics([...ids]));
        expect(run.value.byClient).toHaveLength(size);

        results.push({
          clients: size,
          queries: run.queries,
          dbMs: run.dbMs,
          wallMs: run.wallMs,
        });
        lastStatements = run.statements;
      }

      const byStatement = new Map<string, number>();
      for (const row of lastStatements) {
        const key = firstLine(row.sql);
        byStatement.set(key, (byStatement.get(key) ?? 0) + 1);
      }

      const lines: string[] = [];
      lines.push("");
      lines.push("=".repeat(78));
      lines.push("THE REPORTS LANDING PAGE - cost of loadGlobalOutreachMetrics");
      lines.push("Local Postgres, EMPTY tables. The round-trip COUNT is the");
      lines.push("data-independent number; the milliseconds are local, not prod.");
      lines.push("=".repeat(78));
      lines.push("   clients | SQL round-trips | total DB ms | wall-clock ms");
      lines.push("   --------|-----------------|-------------|--------------");
      for (const r of results) {
        lines.push(
          `   ${String(r.clients).padStart(7)} | ${String(r.queries).padStart(15)} | ` +
            `${r.dbMs.toFixed(1).padStart(11)} | ${r.wallMs.toFixed(1).padStart(13)}`,
        );
      }
      lines.push("");
      lines.push(`Statements at ${String(SIZES[SIZES.length - 1])} clients:`);
      for (const [sql, n] of [...byStatement.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`   x${String(n).padStart(3)}  ${sql}`);
      }
      lines.push("=".repeat(78));
      // This printed table is the deliverable a human reads.
      console.log(lines.join("\n"));

      // FIRST: prove the probe saw anything at all. A zero here is a broken
      // instrument, never a fast page.
      for (const r of results) expect(r.queries).toBeGreaterThan(0);

      // THE POINT OF THIS TEST. Seventeen clients must not cost seventeen times
      // one client. Measured BEFORE the fix: 15 / 71 / 239.
      const [one, , seventeen] = results;
      expect(seventeen.queries).toBeLessThanOrEqual(one.queries);

      // Ratchet, set above the constant cost so a slow laptop cannot fail it
      // but a reintroduced fan-out can.
      for (const r of results) expect(r.queries).toBeLessThanOrEqual(20);
    } finally {
      if (previousFlag === undefined) {
        delete process.env.INTERNAL_SEED_ALLOWLIST_ENABLED;
      } else {
        process.env.INTERNAL_SEED_ALLOWLIST_ENABLED = previousFlag;
      }
    }
  });

  it("reports the same numbers per client, and never mixes two clients up", async () => {
    const { prisma } = await import("@/lib/db");
    const { loadClientOutreachMetrics, loadGlobalOutreachMetrics } = await import(
      "@/server/queries/outreach-metrics"
    );

    // --- the workspace under test ------------------------------------------
    // Seeded so that EVERY metric on the Reports card is non-zero and
    // distinct, which is what makes a wrong GROUP BY visible. A seed where
    // everything is 1 passes under almost any bug.
    const client = await prisma.client.create({
      data: { name: "Metrics Workspace", slug: "metrics-workspace" },
    });
    const other = await prisma.client.create({
      data: { name: "Other Workspace", slug: "other-workspace" },
    });

    const sentAt = new Date("2026-08-01T09:00:00.000Z");
    async function outbound(
      clientId: string,
      key: string,
      data: Record<string, unknown>,
    ) {
      return prisma.outboundEmail.create({
        data: {
          clientId,
          toEmail: `${key}@example.test`,
          ...data,
        } as never,
      });
    }

    // sentWithProof = 4 (SENT ×2, DELIVERED, BOUNCED — all with sentAt)
    const sent1 = await outbound(client.id, "s1", {
      status: "SENT",
      sentAt,
      openedAt: sentAt,
    });
    const sent2 = await outbound(client.id, "s2", { status: "SENT", sentAt });
    await outbound(client.id, "s3", {
      status: "DELIVERED",
      sentAt,
      deliveredAt: sentAt,
    });
    await outbound(client.id, "s4", {
      status: "BOUNCED",
      sentAt,
      bouncedAt: sentAt,
    });
    // Not sent: 1 failed, 2 still waiting on the sender.
    await outbound(client.id, "f1", { status: "FAILED" });
    await outbound(client.id, "q1", { status: "QUEUED" });
    await outbound(client.id, "q2", { status: "PROCESSING" });

    await prisma.outboundProviderEvent.create({
      data: {
        clientId: client.id,
        providerName: "mock",
        eventType: "delivered",
        dedupeHash: "metrics-perf-delivered-1",
      },
    });

    // 11 contacts: 8 sendable, 2 suppressed, 1 with no email.
    const contactIds: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      const c = await prisma.contact.create({
        data: {
          clientId: client.id,
          email: i === 10 ? null : `contact${String(i)}@example.test`,
          isSuppressed: i === 8 || i === 9,
        },
      });
      contactIds.push(c.id);
    }

    // Sequence chain, needed only because a step-send row cannot exist
    // without one. 8 SENT, 2 SUPPRESSED, 1 BLOCKED-for-cooldown.
    const list = await prisma.contactList.create({
      data: { clientId: client.id, name: "Metrics List" },
    });
    const template = await prisma.clientEmailTemplate.create({
      data: {
        clientId: client.id,
        name: "Intro",
        category: "INTRODUCTION",
        subject: "Hello",
        content: "Hi there.",
        status: "APPROVED",
      },
    });
    const sequence = await prisma.clientEmailSequence.create({
      data: {
        clientId: client.id,
        name: "Metrics Sequence",
        contactListId: list.id,
        status: "APPROVED",
      },
    });
    const step = await prisma.clientEmailSequenceStep.create({
      data: {
        sequenceId: sequence.id,
        position: 1,
        category: "INTRODUCTION",
        templateId: template.id,
        delayDays: 0,
        delayHours: 0,
      },
    });

    const stepStatuses: {
      status: "SENT" | "SUPPRESSED" | "BLOCKED";
      blockedReason?: string;
    }[] = [
      ...Array.from({ length: 8 }, () => ({ status: "SENT" as const })),
      // Every non-READY row the planner writes carries a reason (only the
      // READY path in sequence-send-policy.ts returns a null detail), so a
      // realistic seed sets one. It matters: the loader excludes cooldown
      // rows with a `NOT contains` predicate, and in SQL that predicate is
      // NULL — hence false — for a null reason, so a reason-less SUPPRESSED
      // row would silently vanish from the count. Not reachable today; noted
      // here so a future planner change that allows a null reason is caught
      // by the seed rather than by a client asking why a number dropped.
      { status: "SUPPRESSED" as const, blockedReason: "On the suppression list." },
      { status: "SUPPRESSED" as const, blockedReason: "On the suppression list." },
      {
        status: "BLOCKED" as const,
        // Cooldown deferrals are deliberately NOT counted as suppressed —
        // those contacts were already reached. Included here so the
        // exclusion is exercised, not assumed.
        blockedReason: "Outreach cooldown — contacted 3 days ago",
      },
    ];
    for (const [i, s] of stepStatuses.entries()) {
      const enrollment = await prisma.clientEmailSequenceEnrollment.create({
        data: {
          clientId: client.id,
          sequenceId: sequence.id,
          contactId: contactIds[i],
          contactListId: list.id,
          status: "PENDING",
        },
      });
      await prisma.clientEmailSequenceStepSend.create({
        data: {
          clientId: client.id,
          sequenceId: sequence.id,
          enrollmentId: enrollment.id,
          stepId: step.id,
          templateId: template.id,
          contactId: contactIds[i],
          contactListId: list.id,
          status: s.status,
          blockedReason: s.blockedReason ?? null,
          idempotencyKey: `metrics-perf-step-${String(i)}`,
        },
      });
    }

    // 2 linked replies count; the UNLINKED one must not.
    for (const [i, linked] of [sent1.id, sent2.id].entries()) {
      await prisma.inboundReply.create({
        data: {
          clientId: client.id,
          linkedOutboundEmailId: linked,
          matchMethod: "BY_OUTBOUND_PROVIDER_ID",
          fromEmail: `replier${String(i)}@example.test`,
          receivedAt: sentAt,
        },
      });
    }
    await prisma.inboundReply.create({
      data: {
        clientId: client.id,
        matchMethod: "UNLINKED",
        fromEmail: "stranger@example.test",
        receivedAt: sentAt,
      },
    });

    // 1 redeemed opt-out; the unredeemed token must not count.
    await prisma.unsubscribeToken.create({
      data: {
        clientId: client.id,
        tokenHash: "metrics-perf-used",
        email: "contact0@example.test",
        usedAt: sentAt,
      },
    });
    await prisma.unsubscribeToken.create({
      data: {
        clientId: client.id,
        tokenHash: "metrics-perf-unused",
        email: "contact1@example.test",
      },
    });

    // --- the neighbouring workspace, which must not bleed in ---------------
    for (let i = 0; i < 5; i += 1) {
      await outbound(other.id, `o${String(i)}`, { status: "SENT", sentAt });
    }

    // --- what the screen must show -----------------------------------------
    const m = await loadClientOutreachMetrics(client.id, [client.id, other.id]);

    expect(m.sent).toBe(4);
    expect(m.queued).toBe(2);
    expect(m.delivered).toBe(1);
    expect(m.deliveryTracked).toBe(true);
    expect(m.bounces).toBe(1);
    expect(m.failed).toBe(1);
    expect(m.opens).toBe(1);
    expect(m.replies).toBe(2);
    expect(m.unsubscribes).toBe(1);
    expect(m.suppressedOrSkipped).toBe(2);
    // 8 step-sends say SENT; only 4 have provider proof and 2 are still
    // queued, so 2 sends cannot be accounted for.
    expect(m.sendProofMissing).toBe(2);
    // failed 1 + bounces 1 + suppressed 2 + proof missing 2
    expect(m.notReached).toBe(6);
    expect(m.totalContacts).toBe(11);
    expect(m.emailSendable).toBe(8);
    expect(m.replyRate).toBe(50);
    expect(m.bounceRate).toBe(25);
    expect(m.unsubscribeRate).toBe(25);
    expect(m.deliveryRate).toBe(25);

    // --- and the same numbers via the global loader ------------------------
    const global = await loadGlobalOutreachMetrics([client.id, other.id]);
    const row = global.byClient.find((r) => r.clientId === client.id);
    expect(row?.metrics).toEqual(m);

    // Tenant isolation: the neighbour has 5 sends and nothing else.
    const otherRow = global.byClient.find((r) => r.clientId === other.id);
    expect(otherRow?.metrics.sent).toBe(5);
    expect(otherRow?.metrics.replies).toBe(0);
    expect(otherRow?.metrics.totalContacts).toBe(0);

    // Totals are the sum, not one client repeated.
    expect(global.global.sent).toBe(9);
    expect(global.global.replies).toBe(2);
  });
});
