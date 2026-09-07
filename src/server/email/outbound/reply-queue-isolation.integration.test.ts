import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { operatorRequeueFailedSend, releaseStaleProcessingClaimsForScope } from "./operator-recovery";
import { processOutboundSendQueue } from "./queue-processor";
import { executeOutboundSend } from "./execute-one";

// Exercise real recovery updates and queue selection, but never dispatch mail.
vi.mock("./execute-one", () => ({ executeOutboundSend: vi.fn(async () => ({ ok: true })) }));
const metadata = { kind: "inboundMailboxReply", inboundMessageId: "original", replyRequestId: "14c120e2-a746-435b-9d99-cae2a16a23bc" };
beforeEach(async () => {
  vi.mocked(executeOutboundSend).mockClear();
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "client", name: "Reply queue isolation", slug: "reply-queue-isolation" } });
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
async function create(id: string, status: "FAILED" | "PROCESSING" | "QUEUED", meta: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = metadata) {
  return prisma.outboundEmail.create({ data: {
    id, clientId: "client", toEmail: "recipient@example.test", subject: "Synthetic reply", bodySnapshot: "Must not dispatch a reply through the generic queue",
    status, metadata: meta, queuedAt: new Date("2025-01-01"), claimExpiresAt: new Date("2025-01-01"),
  } });
}
const read = (id: string) => prisma.outboundEmail.findUniqueOrThrow({ where: { id } });

it("refuses to requeue a failed inline reply and preserves its saved request identity", async () => {
  const before = await create("reply", "FAILED");
  expect(await operatorRequeueFailedSend("reply", "client")).toEqual({ count: 0 });
  expect(await read("reply")).toEqual(before);
});
it("does not release an expired processing claim belonging to an inline reply", async () => {
  const before = await create("reply", "PROCESSING");
  expect(await releaseStaleProcessingClaimsForScope(["client"])).toEqual({ count: 0 });
  expect(await read("reply")).toEqual(before);
});
it("does not claim or dispatch a previously queued inline reply", async () => {
  const before = await create("reply", "QUEUED");
  expect(await processOutboundSendQueue({ limit: 10 })).toEqual({ claimed: 0, completed: 0, errors: [] });
  expect(executeOutboundSend).not.toHaveBeenCalled();
  expect(await read("reply")).toEqual(before);
});

it.each([Prisma.DbNull, Prisma.JsonNull, {}, { kind: null }, { kind: "campaign" }, [], "legacy"])('preserves generic retries for ordinary metadata: %j', async (meta) => {
  await create("ordinary", "FAILED", meta);
  expect(await operatorRequeueFailedSend("ordinary", "client")).toEqual({ count: 1 });
  expect((await read("ordinary")).status).toBe("QUEUED");
});
it("continues claiming ordinary queued sends when an older inline reply is present", async () => {
  const before = await create("reply", "QUEUED");
  await create("ordinary", "QUEUED", Prisma.DbNull);
  expect(await processOutboundSendQueue({ limit: 10 })).toEqual({ claimed: 1, completed: 1, errors: [] });
  expect(executeOutboundSend).toHaveBeenCalledExactlyOnceWith("ordinary");
  expect(await read("reply")).toEqual(before);
});
it("releases only ordinary stale claims and preserves workspace isolation", async () => {
  const before = await create("reply", "PROCESSING");
  await create("ordinary", "PROCESSING", {});
  expect(await releaseStaleProcessingClaimsForScope(["other"])).toEqual({ count: 0 });
  expect(await releaseStaleProcessingClaimsForScope(["client"])).toEqual({ count: 1 });
  expect(await read("reply")).toEqual(before);
  expect((await read("ordinary")).status).toBe("QUEUED");
});
it("does not requeue another workspace's failed send or an accepted send", async () => {
  await create("ordinary", "FAILED", {});
  expect(await operatorRequeueFailedSend("ordinary", "other")).toEqual({ count: 0 });
  await prisma.outboundEmail.update({ where: { id: "ordinary" }, data: { providerMessageId: "synthetic-accepted" } });
  expect(await operatorRequeueFailedSend("ordinary", "client")).toEqual({ count: 0 });
});
