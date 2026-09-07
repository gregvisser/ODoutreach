import { afterAll, beforeEach, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  resetIntegrationDatabase,
  closeIntegrationPool,
} from "@/test/integration/database";
import {
  getRepliesNeedingAPerson,
  parseRepliesCursor,
} from "./replies-needing-a-person";

const now = new Date("2026-09-07T12:00:00Z");
beforeEach(async () => {
  await resetIntegrationDatabase();
});
afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

it("keeps an unanswered reply after it crosses thirty days", async () => {
  const client = await prisma.client.create({
    data: { name: "Backlog", slug: "backlog" },
  });
  const reply = await prisma.inboundReply.create({
    data: {
      clientId: client.id,
      fromEmail: "waiting@example.test",
      receivedAt: new Date(now.getTime() - 29 * 86400000),
    },
  });
  const before = await getRepliesNeedingAPerson([client.id], "viewer", now);
  const after = await getRepliesNeedingAPerson(
    [client.id],
    "viewer",
    new Date(now.getTime() + 2 * 86400000),
  );
  expect(before.entries.map((r) => r.replyId)).toContain(reply.id);
  expect(after.entries.map((r) => r.replyId)).toContain(reply.id);
});

it("retains an old positive reply but excludes old handled and inaccessible replies", async () => {
  const client = await prisma.client.create({
    data: { name: "Backlog", slug: "backlog" },
  });
  const other = await prisma.client.create({
    data: { name: "Other", slug: "other" },
  });
  const receivedAt = new Date(now.getTime() - 45 * 86400000);
  const waiting = await prisma.inboundReply.create({
    data: {
      clientId: client.id,
      fromEmail: "positive@example.test",
      receivedAt,
      classification: "POSITIVE",
    },
  });
  await prisma.inboundReply.createMany({
    data: [
      {
        clientId: client.id,
        fromEmail: "handled@example.test",
        receivedAt,
        handledAt: now,
      },
      { clientId: other.id, fromEmail: "private@example.test", receivedAt },
    ],
  });
  const result = await getRepliesNeedingAPerson([client.id], "viewer", now);
  expect(result.entries.map((r) => r.replyId)).toEqual([waiting.id]);
  expect(result.wantToTalkCount).toBe(1);
});

it("reaches older waiting replies even when the first page has no actionable replies", async () => {
  const client = await prisma.client.create({
    data: { name: "Backlog", slug: "backlog" },
  });
  await prisma.inboundReply.createMany({
    data: Array.from({ length: 500 }, (_, i) => ({
      id: `finished-${String(i).padStart(4, "0")}`,
      clientId: client.id,
      fromEmail: "finished@example.test",
      receivedAt: now,
      classification: "NOT_INTERESTED" as const,
    })),
  });
  const old = await prisma.inboundReply.create({
    data: {
      clientId: client.id,
      fromEmail: "old@example.test",
      receivedAt: new Date("2026-01-01T00:00:00Z"),
    },
  });
  const first = await getRepliesNeedingAPerson([client.id], "viewer", now);
  expect(first.entries).toEqual([]);
  expect(first.truncated).toBe(true);
  const cursor = parseRepliesCursor(first.nextCursor);
  expect(cursor).not.toBeNull();
  const next = await getRepliesNeedingAPerson(
    [client.id],
    "viewer",
    now,
    cursor,
  );
  expect(next.entries.map((r) => r.replyId)).toEqual([old.id]);
  expect(next.nextCursor).toBeNull();
});

it("pages tied timestamps without losing replies when the boundary row is handled", async () => {
  const client = await prisma.client.create({
    data: { name: "Backlog", slug: "backlog" },
  });
  const ids = Array.from(
    { length: 501 },
    (_, i) => `waiting-${String(i).padStart(4, "0")}`,
  );
  await prisma.inboundReply.createMany({
    data: ids.map((id) => ({
      id,
      clientId: client.id,
      fromEmail: "waiting@example.test",
      receivedAt: now,
    })),
  });
  const first = await getRepliesNeedingAPerson([client.id], "viewer", now);
  expect(first.entries).toHaveLength(500);
  const cursor = parseRepliesCursor(first.nextCursor)!;
  await prisma.inboundReply.update({
    where: { id: cursor.id },
    data: { handledAt: now },
  });
  const next = await getRepliesNeedingAPerson(
    [client.id],
    "viewer",
    now,
    cursor,
  );
  expect(next.entries).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(
    new Set([...first.entries, ...next.entries].map((r) => r.replyId)),
  ).toEqual(new Set(ids));
  expect(
    (await getRepliesNeedingAPerson([], "viewer", now, cursor)).entries,
  ).toEqual([]);
});

it("does not advertise an older page when exactly five hundred candidates exist", async () => {
  const client = await prisma.client.create({
    data: { name: "Backlog", slug: "backlog" },
  });
  await prisma.inboundReply.createMany({
    data: Array.from({ length: 500 }, () => ({
      clientId: client.id,
      fromEmail: "waiting@example.test",
      receivedAt: now,
    })),
  });
  const result = await getRepliesNeedingAPerson([client.id], "viewer", now);
  expect(result.entries).toHaveLength(500);
  expect(result.nextCursor).toBeNull();
  expect(result.truncated).toBe(false);
});

it("rejects malformed paging input", () => {
  for (const value of [
    undefined,
    ["x"],
    "bad|id",
    "2026-01-01|id",
    "2026-01-01T00:00:00.000Z|x|extra",
    "2026-01-01T00:00:00.000Z|../other",
  ]) {
    expect(parseRepliesCursor(value)).toBeNull();
  }
});
