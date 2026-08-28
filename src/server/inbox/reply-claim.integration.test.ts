import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
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

  SUBJECT.subjectId = `msg-${stamp}`;
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
      subject: SUBJECT,
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
});
