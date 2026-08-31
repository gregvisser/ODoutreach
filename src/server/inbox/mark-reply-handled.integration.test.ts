import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { claimReplyForStaff, loadDisplayClaimsForSubjects } from "@/server/inbox/reply-claim";
import { markInboundReplyHandled } from "@/server/inbox/mark-reply-handled";

/**
 * ROW 132 — CLAIMING, SEEING SOMEBODY ELSE HAS IT, AND RELEASING OR
 * COMPLETING IT — PROVEN AGAINST A REAL TABLE.
 *
 * Mirrors `reply-claim.integration.test.ts`'s reasoning: unit tests mock
 * Prisma, so they prove the rules but not that the rules ever reach a
 * database. This drives the real functions — `markInboundReplyHandled`,
 * `claimReplyForStaff`, `loadDisplayClaimsForSubjects` — against real
 * Postgres, with two real staff rows and a real `InboundReply`, and checks
 * what a SECOND person would actually be shown, and what sticks after a
 * process restart (nothing here is in memory).
 *
 * Needs a database: `npm run test:integration`.
 */

let clientId = "";
let sarahId = "";
let bobId = "";
let replyId = "";

const SUBJECT = { subjectType: "INBOUND_REPLY" as const, subjectId: "" };

beforeAll(async () => {
  const stamp = Date.now();

  const sarah = await prisma.staffUser.create({
    data: {
      entraObjectId: `row132-sarah-${stamp}`,
      email: `row132-sarah-${stamp}@example.test`,
      displayName: "Sarah Okafor",
    },
  });
  sarahId = sarah.id;

  const bob = await prisma.staffUser.create({
    data: {
      entraObjectId: `row132-bob-${stamp}`,
      email: `row132-bob-${stamp}@example.test`,
      displayName: "Bob Ellis",
    },
  });
  bobId = bob.id;

  const client = await prisma.client.create({
    data: { name: "Row 132 Integration Test", slug: `row132-integration-${stamp}` },
  });
  clientId = client.id;

  const reply = await prisma.inboundReply.create({
    data: {
      clientId,
      fromEmail: "prospect@corp.test",
      receivedAt: new Date(),
    },
  });
  replyId = reply.id;
  SUBJECT.subjectId = replyId;
});

afterAll(async () => {
  await prisma.replyClaim.deleteMany({ where: { clientId } });
  await prisma.inboundReply.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.staffUser.deleteMany({ where: { id: { in: [sarahId, bobId] } } });
  await prisma.$disconnect();
});

describe("row 132, end to end", () => {
  it("a fresh reply has no handled state at all", async () => {
    const row = await prisma.inboundReply.findUniqueOrThrow({ where: { id: replyId } });
    expect(row.handledAt).toBeNull();
    expect(row.handledByStaffUserId).toBeNull();
  });

  it("Sarah claims it, and Bob is shown that she has it — the sentence Greg asked for", async () => {
    await claimReplyForStaff({ clientId, subject: SUBJECT, staffUserId: sarahId });

    const claims = await loadDisplayClaimsForSubjects({
      clientId,
      subjects: [SUBJECT],
      viewerStaffUserId: bobId,
    });
    const bobSees = claims.get("INBOUND_REPLY:" + replyId);

    expect(bobSees?.name).toBe("Sarah Okafor");
    expect(bobSees?.isViewer).toBe(false);
  });

  it("Sarah herself is shown 'You', not her own name — an unclaimed reply is never defaulted to somebody else's view of self", async () => {
    const claims = await loadDisplayClaimsForSubjects({
      clientId,
      subjects: [SUBJECT],
      viewerStaffUserId: sarahId,
    });
    const sarahSees = claims.get("INBOUND_REPLY:" + replyId);

    expect(sarahSees?.name).toBe("You");
    expect(sarahSees?.isViewer).toBe(true);
  });

  it("Bob marks it handled, and it is durably his — first write wins", async () => {
    const result = await markInboundReplyHandled({
      staff: { id: bobId, role: "OPERATOR" },
      clientId,
      replyId,
      subjectType: "INBOUND_REPLY",
      subjectId: replyId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.handledByStaffUserId).toBe(bobId);

    const row = await prisma.inboundReply.findUniqueOrThrow({ where: { id: replyId } });
    expect(row.handledAt).not.toBeNull();
    expect(row.handledByStaffUserId).toBe(bobId);
  });

  it("marking it handled released every claim on it — Sarah's claim is gone too", async () => {
    const remaining = await prisma.replyClaim.count({
      where: { clientId, subjectType: "INBOUND_REPLY", subjectId: replyId },
    });
    expect(remaining).toBe(0);
  });

  it("marking it handled again does not steal it from Bob — Sarah cannot overwrite his ownership", async () => {
    const result = await markInboundReplyHandled({
      staff: { id: sarahId, role: "OPERATOR" },
      clientId,
      replyId,
      subjectType: "INBOUND_REPLY",
      subjectId: replyId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.handledByStaffUserId).toBe(bobId);
  });
});
