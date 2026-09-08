import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { loadScheduledOutreachPlan } from "./scheduled-outreach";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";
import { executeOutboundSend } from "@/server/email/outbound/execute-one";
import { syncActiveClientMailboxInboxes } from "./mailbox-inbox-sync";
vi.mock("@/server/email/outbound/execute-one", () => ({ executeOutboundSend: vi.fn(async () => ({ ok: true })) }));
beforeEach(async () => {
  vi.mocked(executeOutboundSend).mockClear();
  await resetIntegrationDatabase();
  for (const id of ["legacy", "local", "closed", "paused", "deleted"]) {
    await prisma.client.create({ data: { id, name: id, slug: id, status: id === "paused" ? "PAUSED" : "ACTIVE", deletedAt: id === "deleted" ? new Date() : null } });
    await prisma.clientMailboxIdentity.create({ data: { id, clientId: id, provider: "GOOGLE", email: `${id}@example.test`, emailNormalized: `${id}@example.test`, connectionStatus: "CONNECTED" } });
    if (id !== "legacy") await prisma.clientSendingCalendar.create({ data: { clientId: id, timeZone: "Asia/Kathmandu", weekdays: id === "closed" ? [1] : [6], startMinute: 540, endMinute: 1020, previousDayEndsAt: new Date("2020-01-01T00:00Z"), effectiveAt: new Date("2020-01-01T18:15Z"), createdByStaffUserId: "synthetic" } });
  }
});
afterEach(() => vi.useRealTimers());
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

it("selects only an open local calendar on Saturday, including its reply mailbox", async () => {
  expect(await loadScheduledOutreachPlan(new Date("2026-09-12T10:00Z"))).toEqual({ clientIds: ["local"], mailboxIds: ["local"] });
});
it.each([["2026-09-08T06:59Z", false], ["2026-09-08T07:00Z", true], ["2026-09-08T18:59Z", true], ["2026-09-08T19:00Z", false]] as const)("preserves the legacy schedule at %s", async (at, allowed) => {
  expect((await loadScheduledOutreachPlan(new Date(at))).clientIds.includes("legacy")).toBe(allowed);
});
it("does not schedule outreach during a pending timezone transition", async () => {
  await prisma.clientSendingCalendar.create({ data: { clientId: "legacy", timeZone: "Asia/Kathmandu", weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1020, previousDayEndsAt: new Date("2026-09-09T00:00Z"), effectiveAt: new Date("2026-09-09T18:15Z"), createdByStaffUserId: "synthetic" } });
  expect((await loadScheduledOutreachPlan(new Date("2026-09-09T12:00Z"))).clientIds).not.toContain("legacy");
});
it("claims only scoped queued rows and treats an empty scope as no permission", async () => {
  for (const clientId of ["legacy", "local", "paused", "deleted"]) await prisma.outboundEmail.create({ data: { id: clientId, clientId, toEmail: "recipient@example.test", subject: "Synthetic", bodySnapshot: "No transport", status: "QUEUED" } });
  expect((await processOutboundSendQueue({ limit: 25, clientIds: [] })).claimed).toBe(0);
  expect(executeOutboundSend).not.toHaveBeenCalled();
  expect((await processOutboundSendQueue({ limit: 25, clientIds: ["local", "paused", "deleted"] })).claimed).toBe(1);
  expect(executeOutboundSend).toHaveBeenCalledExactlyOnceWith("local");
  expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "legacy" } })).status).toBe("QUEUED");
  expect((await processOutboundSendQueue({ limit: 25 })).claimed).toBe(1);
  expect(executeOutboundSend).toHaveBeenLastCalledWith("legacy");
});
it("will not sync a mailbox outside the freshly selected client scope", async () => {
  const syncOne = vi.fn();
  expect((await syncActiveClientMailboxInboxes({ clientIds: ["local"], mailboxId: "legacy", syncOne })).processed).toBe(0);
  expect(syncOne).not.toHaveBeenCalled();
});
