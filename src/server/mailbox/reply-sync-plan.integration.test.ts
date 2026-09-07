import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { listReplySyncMailboxIds, syncActiveMailboxRepliesBatch } from "./mailbox-inbox-sync";

beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("External HTTP forbidden"); }));
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "client", name: "Sync plan", slug: "sync-plan", status: "ACTIVE" } });
  await prisma.clientMailboxIdentity.createMany({ data: ["a", "b", "c", "disconnected", "removed", "inactive", "no-receive"].map((id) => ({
    id, clientId: "client", provider: "GOOGLE", email: `${id}@example.test`, emailNormalized: `${id}@example.test`,
    connectionStatus: id === "disconnected" ? "DISCONNECTED" : "CONNECTED",
    workspaceRemovedAt: id === "removed" ? new Date() : null,
    isActive: id !== "inactive", canReceive: id !== "no-receive",
    lastSyncAt: id === "a" ? null : new Date("2026-09-01T00:00:00Z"),
  })) });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

it("plans only eligible mailboxes, including a never-synced one", async () => {
  expect(await listReplySyncMailboxIds()).toEqual(["a", "b", "c"]);
});

it("finishes the snapshot despite a thrown mailbox error and changing sync timestamps", async () => {
  const plan = await listReplySyncMailboxIds();
  const visited: string[] = [];
  const syncOne = vi.fn(async ({ mailboxIdentityId }: { mailboxIdentityId: string }) => {
    visited.push(mailboxIdentityId);
    if (mailboxIdentityId === "b") throw new Error("simulated mailbox failure");
    await prisma.clientMailboxIdentity.update({ where: { id: mailboxIdentityId }, data: { lastSyncAt: new Date() } });
    return { ok: true as const, ingested: 1, totalSeen: 1, repliesLinked: 0 };
  });
  const results = [];
  for (const mailboxId of plan) results.push(await syncActiveMailboxRepliesBatch({ mailboxId, maxMailboxes: 1, perMailboxTop: 10, syncOne }));
  expect(visited).toEqual(["a", "b", "c"]);
  expect(results.map((row) => [row.processed, row.succeeded, row.failed])).toEqual([[1, 1, 0], [1, 0, 1], [1, 1, 0]]);
  expect(results[1].errors).toEqual(["b@example.test: simulated mailbox failure"]);
  // The next sweep still retries the failed mailbox instead of losing it.
  expect(await listReplySyncMailboxIds()).toEqual(["a", "b", "c"]);
});

it("rechecks eligibility after planning without substituting another mailbox", async () => {
  expect(await listReplySyncMailboxIds()).toContain("b");
  await prisma.clientMailboxIdentity.update({ where: { id: "b" }, data: { connectionStatus: "DISCONNECTED" } });
  const syncOne = vi.fn();
  expect(await syncActiveMailboxRepliesBatch({ mailboxId: "b", maxMailboxes: 1, syncOne })).toMatchObject({ processed: 0, succeeded: 0, failed: 0 });
  expect(syncOne).not.toHaveBeenCalled();
});
