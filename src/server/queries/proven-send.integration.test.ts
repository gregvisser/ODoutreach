/**
 * Blocker 2, proven against a real PostgreSQL — not against a mock.
 *
 * `proven-send.test.ts` mocks Prisma. That is the right place to compare the
 * two screens' predicates field for field, but a mocked test cannot tell you
 * the predicate is VALID SQL: a malformed `where` passes the mock and throws in
 * production. This repository's recurring defect is exactly that shape —
 * something built, wired, reporting success, and never actually firing — so the
 * fix gets executed here against a real database before it is called done.
 *
 * It also pins the BEFORE and the AFTER in one place. The same seeded row is
 * shown to be invisible to the old Overview source and visible to the new one,
 * so the defect cannot quietly return as "well, both look fine now".
 *
 * Run it:
 *   docker run -d --name odoutreach-e2e-postgres \
 *     -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
 *     -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
 *   npm run db:migrate:e2e
 *   npm run test:integration -- proven-send
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { buildLaunchReadinessRows } from "@/lib/client-launch-state";
import { getRecentGovernedSendsForClient } from "@/server/queries/governed-send-ledger";
import { getLatestProvenSendAt } from "@/server/queries/proven-send";
import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

const SENT_AT = new Date("2026-08-20T09:00:00.000Z");

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationPool();
  await prisma.$disconnect();
});

/** A live outreach send: what `sendSequenceStepBatch` writes. */
async function seedSequenceIntroSend(clientId: string) {
  return prisma.outboundEmail.create({
    data: {
      clientId,
      toEmail: "prospect@example.test",
      subject: "Hello",
      status: "SENT",
      sentAt: SENT_AT,
      providerMessageId: "graph-message-id",
      metadata: { kind: "sequenceIntroSend" },
    } as never,
  });
}

describe("a real sequence send is visible to the client Overview", () => {
  it("is found by the new source and missed by the old one", async () => {
    const client = await prisma.client.create({
      data: { name: "Proven Send", slug: "proven-send" },
    });
    await seedSequenceIntroSend(client.id);

    // BEFORE — what the Overview used to read. Blind to this send, because the
    // row's metadata.kind is not one of the three proof/pilot sentinels. This
    // assertion is the defect, pinned: if it ever starts returning the row,
    // the governed ledger has quietly changed meaning and the comment in
    // proven-send.ts about why it was left alone is no longer true.
    const governed = await getRecentGovernedSendsForClient(client.id, 25);
    expect(governed).toHaveLength(0);

    // AFTER — what it reads now. Real SQL, really executed.
    const latest = await getLatestProvenSendAt(client.id);
    expect(latest).toEqual(SENT_AT);
  });

  it("turns the Overview readiness row from Not started to Monitoring", async () => {
    const client = await prisma.client.create({
      data: { name: "Readiness Row", slug: "readiness-row" },
    });

    // The screen as it renders for a client that has genuinely never sent.
    const before = await getLatestProvenSendAt(client.id);
    expect(before).toBeNull();

    await seedSequenceIntroSend(client.id);

    const after = await getLatestProvenSendAt(client.id);
    expect(after).not.toBeNull();

    // Close the loop to the rendered row. This is the sentence the customer
    // actually read on the Overview, and it is now driven by the send above.
    const row = buildLaunchReadinessRows({
      clientId: client.id,
      brief: { status: "empty", percent: 0 } as never,
      connectedSendingCount: 0,
      recommendedMailboxCount: 5,
      suppressionSheetCount: 0,
      googleSheetsEnvReady: false,
      contactsTotal: 0,
      contactsEligible: 0,
      contactsSuppressedCount: 0,
      rocketReachEnvReady: false,
      outreachPilotRunnable: false,
      hasProductionLaunchableSequence: false,
      enrolledContactsCount: 0,
      suppressionLatestSyncAt: null,
      latestActivityLabel: after!.toISOString().slice(0, 16).replace("T", " "),
    }).find((r) => r.id === "activity");

    expect(row?.pillStatus).toBe("monitoring");
    expect(row?.pillStatus).not.toBe("not_started");
  });

  it("does not leak one workspace's sends into another's Overview", async () => {
    const mine = await prisma.client.create({
      data: { name: "Mine", slug: "mine" },
    });
    const theirs = await prisma.client.create({
      data: { name: "Theirs", slug: "theirs" },
    });
    await seedSequenceIntroSend(theirs.id);

    // Tenant isolation is what this system is sold on. A predicate that
    // widened the status set but lost its client scope would pass every other
    // test in this file.
    expect(await getLatestProvenSendAt(mine.id)).toBeNull();
    expect(await getLatestProvenSendAt(theirs.id)).toEqual(SENT_AT);
  });

  it("still counts a send proven only by its provider id, with no sentAt", async () => {
    const client = await prisma.client.create({
      data: { name: "No SentAt", slug: "no-sent-at" },
    });
    // Older Graph rows look like this. They are proof of a send and must not
    // read as "not started" — the fallback to createdAt exists for them.
    await prisma.outboundEmail.create({
      data: {
        clientId: client.id,
        toEmail: "legacy@example.test",
        status: "DELIVERED",
        sentAt: null,
        providerMessageId: "graph-legacy",
        metadata: { kind: "sequenceIntroSend" },
      } as never,
    });

    expect(await getLatestProvenSendAt(client.id)).not.toBeNull();
  });
});
