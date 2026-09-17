import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { prisma } from "@/lib/db";
import { integrationDatabaseUrl } from "@/test/integration/database";
import {
  claimReplyForStaff,
  loadVisibleReplyClaim,
  releaseReplyClaims,
} from "@/server/inbox/reply-claim";

/**
 * TWO PEOPLE, ONE REPLY, PROVEN AGAINST A REAL TABLE.
 *
 * The unit tests around this feature mock Prisma, so they assert the rules but
 * not that the rules ever reach a database. This repository's recorded failure
 * mode is precisely that gap: six things this week were built, wired, reported
 * success and never fired. So this file drives the real functions against real
 * Postgres, with two real staff rows, and checks what the SECOND person would
 * actually be shown.
 *
 * Nothing here sends email. `ReplyClaim` is advisory and no send gate reads it.
 *
 * Needs a database: `npm run test:integration`.
 */

const SUBJECT = {
  subjectType: "INBOUND_MESSAGE" as const,
  subjectId: "",
};

let clientId = "";
let otherClientId = "";
let sarahId = "";
let bobId = "";
const pool = new Pool({ connectionString: integrationDatabaseUrl(), max: 4 });

async function createMessage(ownerClientId: string) {
  const key = randomUUID();
  const mailbox = await prisma.clientMailboxIdentity.create({ data: {
    clientId: ownerClientId, provider: "MICROSOFT", email: `${key}@example.test`, emailNormalized: `${key}@example.test`,
  } });
  return prisma.inboundMailboxMessage.create({ data: {
    clientId: ownerClientId, mailboxIdentityId: mailbox.id, providerMessageId: key,
    fromEmail: "prospect@example.test", receivedAt: new Date(),
  } });
}

// Observe an actual PostgreSQL lock wait, rather than assuming a delay means
// that a competing request has reached the statement under test.
async function waitForBlockedQuery(table: string, blockerPid: number): Promise<number> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ pid: number }>(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE $1 AND $2 = ANY(pg_blocking_pids(pid))`, [`%${table}%`, blockerPid]);
    if (result.rows[0]) return result.rows[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No blocked ${table} query observed`);
}

beforeAll(async () => {
  const stamp = Date.now();

  const sarah = await prisma.staffUser.create({
    data: {
      entraObjectId: `claim-sarah-${stamp}`,
      email: `claim-sarah-${stamp}@example.test`,
      displayName: "Sarah Okafor",
    },
  });
  sarahId = sarah.id;

  const bob = await prisma.staffUser.create({
    data: {
      entraObjectId: `claim-bob-${stamp}`,
      email: `claim-bob-${stamp}@example.test`,
      displayName: "Bob Ellis",
    },
  });
  bobId = bob.id;

  const client = await prisma.client.create({
    data: { name: "Claim Integration Test", slug: `claim-integration-${stamp}` },
  });
  clientId = client.id;

  const other = await prisma.client.create({
    data: { name: "Other Workspace", slug: `claim-other-${stamp}` },
  });
  otherClientId = other.id;

  SUBJECT.subjectId = (await createMessage(clientId)).id;
});

afterAll(async () => {
  await prisma.replyClaim.deleteMany({
    where: { clientId: { in: [clientId, otherClientId] } },
  });
  await prisma.client.deleteMany({
    where: { id: { in: [clientId, otherClientId] } },
  });
  await prisma.staffUser.deleteMany({ where: { id: { in: [sarahId, bobId] } } });
  await prisma.$disconnect();
  await pool.end();
});

describe("reply claiming, end to end", () => {
  it("shows Bob that Sarah opened it, and shows Sarah nothing", async () => {
    await claimReplyForStaff({
      clientId,
      subject: SUBJECT,
      staffUserId: sarahId,
    });

    // The row is really there.
    const stored = await prisma.replyClaim.findMany({
      where: { clientId, subjectId: SUBJECT.subjectId },
    });
    expect(stored).toHaveLength(1);

    // This is the sentence Greg asked for.
    const bobSees = await loadVisibleReplyClaim({
      clientId,
      subject: SUBJECT,
      viewerStaffUserId: bobId,
    });
    expect(bobSees?.name).toBe("Sarah Okafor");
    expect(bobSees?.agoLabel).toBe("just now");

    // And nobody needs telling they opened the thing they are looking at.
    const sarahSees = await loadVisibleReplyClaim({
      clientId,
      subject: SUBJECT,
      viewerStaffUserId: sarahId,
    });
    expect(sarahSees).toBeNull();
  });

  it("refreshes rather than stacking up rows when Sarah re-opens it", async () => {
    await claimReplyForStaff({
      clientId,
      subject: SUBJECT,
      staffUserId: sarahId,
    });

    const stored = await prisma.replyClaim.findMany({
      where: { clientId, subjectId: SUBJECT.subjectId },
    });
    expect(stored).toHaveLength(1);
  });

  it("stops showing a claim once it is 30 minutes old", async () => {
    // Back-date Sarah's real row rather than faking a clock, so the query's
    // own time filter is what gets exercised.
    await prisma.replyClaim.updateMany({
      where: { clientId, subjectId: SUBJECT.subjectId, staffUserId: sarahId },
      data: { claimedAt: new Date(Date.now() - 31 * 60_000) },
    });

    const bobSees = await loadVisibleReplyClaim({
      clientId,
      subject: SUBJECT,
      viewerStaffUserId: bobId,
    });
    expect(bobSees).toBeNull();

    // Still on disk — stale, not deleted. Nothing depends on a sweeper job.
    const stored = await prisma.replyClaim.findMany({
      where: { clientId, subjectId: SUBJECT.subjectId },
    });
    expect(stored).toHaveLength(1);
  });

  it("clears every claim the moment somebody acts", async () => {
    await claimReplyForStaff({
      clientId,
      subject: SUBJECT,
      staffUserId: sarahId,
    });
    await claimReplyForStaff({
      clientId,
      subject: SUBJECT,
      staffUserId: bobId,
    });
    expect(
      await prisma.replyClaim.count({
        where: { clientId, subjectId: SUBJECT.subjectId },
      }),
    ).toBe(2);

    // Bob replies / suppresses / marks handled.
    await releaseReplyClaims({ clientId, subject: SUBJECT });

    // Sarah's claim goes too — the thing is dealt with, so nobody should
    // still be told "Sarah is handling this".
    expect(
      await prisma.replyClaim.count({
        where: { clientId, subjectId: SUBJECT.subjectId },
      }),
    ).toBe(0);
  });

  it("does not leak a claim across workspaces", async () => {
    await claimReplyForStaff({
      clientId,
      subject: SUBJECT,
      staffUserId: sarahId,
    });

    // Same subject id, different tenant. Reads are scoped by clientId, so the
    // other workspace must see nothing.
    const leaked = await loadVisibleReplyClaim({
      clientId: otherClientId,
      subject: SUBJECT,
      viewerStaffUserId: bobId,
    });
    expect(leaked).toBeNull();

    await claimReplyForStaff({ clientId: otherClientId, subject: SUBJECT, staffUserId: bobId });
    expect(await prisma.replyClaim.count({ where: { clientId: otherClientId, subjectId: SUBJECT.subjectId } })).toBe(0);

    // And a release in the other workspace must not clear ours.
    await releaseReplyClaims({ clientId: otherClientId, subject: SUBJECT });
    expect(
      await prisma.replyClaim.count({
        where: { clientId, subjectId: SUBJECT.subjectId },
      }),
    ).toBe(1);
  });

  it("goes when the workspace does", async () => {
    const stamp = Date.now();
    const doomed = await prisma.client.create({
      data: { name: "Doomed", slug: `claim-doomed-${stamp}` },
    });
    await claimReplyForStaff({
      clientId: doomed.id,
      subject: { subjectType: "INBOUND_MESSAGE", subjectId: (await createMessage(doomed.id)).id },
      staffUserId: sarahId,
    });
    expect(
      await prisma.replyClaim.count({ where: { clientId: doomed.id } }),
    ).toBe(1);

    await prisma.client.delete({ where: { id: doomed.id } });

    expect(
      await prisma.replyClaim.count({ where: { clientId: doomed.id } }),
    ).toBe(0);
  });

  it("does not create a claim for a missing raw message", async () => {
    const subject = { subjectType: "INBOUND_MESSAGE" as const, subjectId: randomUUID() };
    await claimReplyForStaff({ clientId, subject, staffUserId: sarahId });
    expect(await prisma.replyClaim.count({ where: { clientId, subjectId: subject.subjectId } })).toBe(0);
  });

  it("makes cleanup wait for an earlier claim and observe it before deciding eligibility", async () => {
    const message = await createMessage(clientId);
    const subject = { subjectType: "INBOUND_MESSAGE" as const, subjectId: message.id };
    const tableBlocker = await pool.connect();
    const cleanup = await pool.connect();
    let pendingClaim: Promise<void> | undefined;
    let pendingCleanup: Promise<number> | undefined;
    try {
      await tableBlocker.query("BEGIN");
      const { rows: [{ pid }] } = await tableBlocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      await tableBlocker.query('LOCK TABLE "ReplyClaim" IN SHARE MODE');
      pendingClaim = claimReplyForStaff({ clientId, subject, staffUserId: sarahId });
      const claimPid = await waitForBlockedQuery("ReplyClaim", pid);

      await cleanup.query("BEGIN");
      pendingCleanup = (async () => {
        await cleanup.query('SELECT id FROM "InboundMailboxMessage" WHERE id=$1 AND "clientId"=$2 FOR UPDATE', [message.id, clientId]);
        const result = await cleanup.query<{ count: number }>(
          'SELECT COUNT(*)::int AS count FROM "ReplyClaim" WHERE "clientId"=$1 AND "subjectType"=\'INBOUND_MESSAGE\' AND "subjectId"=$2', [clientId, message.id]);
        // A cleanup must recheck after locking and retain any row with staff state.
        if (result.rows[0].count === 0) await cleanup.query('DELETE FROM "InboundMailboxMessage" WHERE id=$1 AND "clientId"=$2', [message.id, clientId]);
        return result.rows[0].count;
      })();
      await waitForBlockedQuery("InboundMailboxMessage", claimPid);
      await tableBlocker.query("COMMIT");
      await pendingClaim;
      expect(await pendingCleanup).toBe(1);
      await cleanup.query("COMMIT");
      expect(await prisma.inboundMailboxMessage.findUnique({ where: { id: message.id } })).not.toBeNull();
      expect(await prisma.replyClaim.count({ where: { clientId, subjectId: message.id } })).toBe(1);
    } finally {
      await tableBlocker.query("ROLLBACK");
      await Promise.allSettled([pendingClaim, pendingCleanup]);
      await cleanup.query("ROLLBACK");
      tableBlocker.release();
      cleanup.release();
    }
  });

  it("rejects a waiting claim and later stale-page claims when cleanup deletes first", async () => {
    const message = await createMessage(clientId);
    const subject = { subjectType: "INBOUND_MESSAGE" as const, subjectId: message.id };
    const cleanup = await pool.connect();
    let pendingClaim: Promise<void> | undefined;
    try {
      await cleanup.query("BEGIN");
      const { rows: [{ pid }] } = await cleanup.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      await cleanup.query('SELECT id FROM "InboundMailboxMessage" WHERE id=$1 AND "clientId"=$2 FOR UPDATE', [message.id, clientId]);
      await cleanup.query('DELETE FROM "InboundMailboxMessage" WHERE id=$1 AND "clientId"=$2', [message.id, clientId]);
      pendingClaim = claimReplyForStaff({ clientId, subject, staffUserId: sarahId });
      await waitForBlockedQuery("InboundMailboxMessage", pid);
      await cleanup.query("COMMIT");
      await pendingClaim;
      await claimReplyForStaff({ clientId, subject, staffUserId: bobId });
      expect(await prisma.replyClaim.count({ where: { clientId, subjectId: message.id } })).toBe(0);
      expect(await prisma.inboundMailboxMessage.findUnique({ where: { id: message.id } })).toBeNull();
    } finally {
      await cleanup.query("ROLLBACK");
      await pendingClaim;
      cleanup.release();
    }
  });
});
