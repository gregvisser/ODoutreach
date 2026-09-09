import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { approveHeldEmail, heldEmailReviewToken, loadHeldEmailsForStaff, STAFF_REVIEWED_SEND_ORIGIN } from "./staff-review";
import { executeOutboundSend } from "./execute-one";
import { CROSS_CLIENT_REVIEW, hasCurrentCrossClientApproval, loadCrossClientContacts } from "./cross-client-review";
import { evaluateOutboundDispatchRecheck } from "./dispatch-recheck";
import { triggerOutboundQueueDrain } from "./trigger-queue";
vi.mock("./trigger-queue", () => ({ triggerOutboundQueueDrain: vi.fn(async () => {}) }));
vi.mock("node:dns", () => ({ promises: { resolveMx: async () => { throw Error("DNS BLOCKED"); }, resolve4: async () => [], resolve6: async () => [] } }));

beforeEach(async () => {
  vi.mocked(triggerOutboundQueueDrain).mockReset();
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "example.test");
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "false");
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "staff-entra", email: "staff@example.test", role: "OPERATOR", isActive: true } });
  await prisma.client.create({ data: { id: "client", name: "Review fixture", slug: "review-fixture", status: "ACTIVE", autonomousSendEnabled: false } });
  await prisma.clientMailboxIdentity.create({ data: { id: "mailbox", clientId: "client", provider: "GOOGLE", email: "sender@example.test", emailNormalized: "sender@example.test", isActive: true, connectionStatus: "CONNECTED", canSend: true, isSendingEnabled: true, dailySendCap: 2 } });
  await prisma.outboundEmail.create({ data: { id: "held", clientId: "client", mailboxIdentityId: "mailbox", toEmail: "recipient@example.test", fromAddress: "sender@example.test", subject: "Please review", bodySnapshot: "Synthetic saved email", status: "FAILED", lastErrorCode: "AUTOMATED_SEND_DISABLED", metadata: { sendOrigin: "AUTOMATED_SEQUENCE" }, sendAttempt: 1 } });
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_staff_review_audit ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_staff_review_audit()');
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });
async function crossContact(id = "recent", clientId = "other") {
  await prisma.client.upsert({ where: { id: clientId }, create: { id: clientId, name: "Other reviewed client", slug: clientId }, update: {} });
  await prisma.outboundEmail.create({ data: { id, clientId, toEmail: "recipient@example.test", subject: "Earlier contact", bodySnapshot: "Synthetic", status: "SENT", sentAt: new Date() } });
}
it("shows other-client contact and binds staff approval to the email and that history", async () => {
  vi.stubEnv("SEND_DISPATCH_RECHECK_ENABLED", "true");
  await crossContact();
  await prisma.outboundEmail.update({ where: { id: "held" }, data: { lastErrorCode: CROSS_CLIENT_REVIEW } });
  const page = await loadHeldEmailsForStaff("client", 0);
  expect(page.emails[0].recentContacts[0].clientName).toBe("Other reviewed client");
  expect(await approveHeldEmail({ ...(await input()), reviewToken: page.emails[0].reviewToken })).toMatchObject({ ok: true });
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } });
  const history = await loadCrossClientContacts("client", row.toEmail, new Date());
  expect(hasCurrentCrossClientApproval(row, history)).toBe(true);
  expect(hasCurrentCrossClientApproval({ ...row, subject: "Changed" }, history)).toBe(false);
  await crossContact("newer");
  expect(hasCurrentCrossClientApproval(row, await loadCrossClientContacts("client", row.toEmail, new Date()))).toBe(false);
});
it("refuses stale recent-contact history before reserving or queueing", async () => {
  vi.stubEnv("SEND_DISPATCH_RECHECK_ENABLED", "true");
  await crossContact();
  const page = await loadHeldEmailsForStaff("client", 0);
  await crossContact("newer");
  expect(await approveHeldEmail({ ...(await input()), reviewToken: page.emails[0].reviewToken })).toMatchObject({ ok: false });
  expect(await prisma.mailboxSendReservation.count()).toBe(0);
});
it("keeps same-client waiting and cross-client bounce blocks while releasing the cross-client timer", async () => {
  await crossContact();
  const check = () => evaluateOutboundDispatchRecheck({ outboundEmailId: "held", clientId: "client", toEmail: "recipient@example.test", now: new Date() });
  expect(await check()).toEqual({ block: false });
  await prisma.outboundEmail.update({ where: { id: "recent" }, data: { status: "BOUNCED" } });
  expect(await check()).toMatchObject({ block: true, kind: "recent_bounce" });
  await prisma.outboundEmail.update({ where: { id: "recent" }, data: { status: "SENT", clientId: "client" } });
  expect(await check()).toMatchObject({ block: true, kind: "cooldown" });
});
it("holds a newly contacted recipient at real dispatch after an earlier staff approval", async () => {
  vi.stubEnv("SEND_DISPATCH_RECHECK_ENABLED", "true");
  expect(await approveHeldEmail(await input())).toMatchObject({ ok: true });
  await crossContact();
  await prisma.outboundEmail.update({ where: { id: "held" }, data: { status: "PROCESSING", claimedAt: new Date(), claimExpiresAt: new Date(Date.now() + 60000), sendAttempt: 2 } });
  await executeOutboundSend("held");
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } });
  expect(row).toMatchObject({ status: "FAILED", lastErrorCode: CROSS_CLIENT_REVIEW, providerMessageId: null, dispatchStartedAt: null });
  expect((await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId: "held" } })).status).toBe("RELEASED");
});
async function input() {
  return { clientId: "client", outboundEmailId: "held", staffUserId: "staff", reviewToken: heldEmailReviewToken(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } })) };
}
it("lets ordinary staff approve exactly one saved email and keeps automatic sending off", async () => {
  const data = await loadHeldEmailsForStaff("client", 0);
  expect(data.emails[0]).toMatchObject({ subject: "Please review", body: "Synthetic saved email" });
  expect(await approveHeldEmail(await input())).toMatchObject({ ok: true });
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } })).toMatchObject({ status: "QUEUED", staffUserId: "staff", metadata: { sendOrigin: STAFF_REVIEWED_SEND_ORIGIN } });
  expect(await prisma.mailboxSendReservation.count({ where: { outboundEmailId: "held", status: "RESERVED" } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { entityId: "held", staffUserId: "staff" } })).toBe(1);
  expect((await prisma.client.findUniqueOrThrow({ where: { id: "client" } })).autonomousSendEnabled).toBe(false);
});
it("queues once under concurrent approvals", async () => {
  const request = await input();
  const results = await Promise.all([approveHeldEmail(request), approveHeldEmail(request)]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await prisma.auditLog.count({ where: { entityId: "held" } })).toBe(1);
  expect(await prisma.mailboxSendReservation.count({ where: { outboundEmailId: "held" } })).toBe(1);
});

it("wakes only the approved email after its database commit", async () => {
  vi.mocked(triggerOutboundQueueDrain).mockImplementation(async scope => {
    expect(scope).toEqual({ clientId: "client", outboundEmailIds: ["held"] });
    expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } })).status).toBe("QUEUED");
    expect(await prisma.auditLog.count({ where: { entityId: "held" } })).toBe(1);
  });
  expect(await approveHeldEmail(await input())).toMatchObject({ ok: true });
  expect(triggerOutboundQueueDrain).toHaveBeenCalledTimes(1);
  expect(await approveHeldEmail({ ...(await input()), reviewToken: "stale" })).toMatchObject({ ok: false });
  expect(triggerOutboundQueueDrain).toHaveBeenCalledTimes(1);
});
it("paginates held emails without exposing another client's rows", async () => {
  await prisma.client.create({ data: { id: "other", name: "Other fixture", slug: "other-review-fixture", status: "ACTIVE" } });
  await prisma.outboundEmail.createMany({ data: Array.from({ length: 13 }, (_, index) => ({
    id: `page-${index}`, clientId: index === 12 ? "other" : "client", toEmail: `page${index}@example.test`,
    subject: "Saved review", bodySnapshot: "Synthetic", status: "FAILED" as const,
    lastErrorCode: "AUTOMATED_SEND_DISABLED", metadata: { sendOrigin: "AUTOMATED_SEQUENCE" },
  })) });
  const first = await loadHeldEmailsForStaff("client", 0);
  const second = await loadHeldEmailsForStaff("client", 1);
  expect(first.emails).toHaveLength(10); expect(first.hasNext).toBe(true);
  expect(second.emails).toHaveLength(3); expect(second.hasNext).toBe(false);
  const ids = [...first.emails, ...second.emails].map(row => row.id);
  expect(new Set(ids).size).toBe(13); expect(ids).not.toContain("page-12");
});
it.each(["subject", "bodySnapshot", "toEmail"])("refuses changed %s until reviewed again", async field => {
  const request = await input();
  await prisma.outboundEmail.update({ where: { id: "held" }, data: { [field]: "changed@example.test" } });
  expect(await approveHeldEmail(request)).toMatchObject({ ok: false });
  expect(await prisma.mailboxSendReservation.count()).toBe(0);
});
it.each(["inactive", "wrong-domain", "missing"])("refuses %s staff", async mode => {
  const request = await input();
  if (mode === "missing") request.staffUserId = "absent";
  else await prisma.staffUser.update({ where: { id: "staff" }, data: mode === "inactive" ? { isActive: false } : { email: "staff@other.test" } });
  expect(await approveHeldEmail(request)).toMatchObject({ ok: false });
  expect(await prisma.mailboxSendReservation.count()).toBe(0);
});
it.each(["wrong-client", "deleted", "paused", "provider", "fence", "different-hold", "missing-origin"])("refuses %s without releasing or requeuing", async mode => {
  const request = await input();
  if (mode === "wrong-client") request.clientId = "other";
  if (mode === "deleted") await prisma.client.update({ where: { id: "client" }, data: { deletedAt: new Date() } });
  if (mode === "paused") await prisma.client.update({ where: { id: "client" }, data: { status: "PAUSED" } });
  if (mode === "provider") await prisma.outboundEmail.update({ where: { id: "held" }, data: { providerMessageId: "accepted" } });
  if (mode === "fence") await prisma.outboundEmail.update({ where: { id: "held" }, data: { dispatchStartedAt: new Date() } });
  if (mode === "different-hold") await prisma.outboundEmail.update({ where: { id: "held" }, data: { lastErrorCode: "COMPANY_REVIEW" } });
  if (mode === "missing-origin") await prisma.outboundEmail.update({ where: { id: "held" }, data: { metadata: {} } });
  expect(await approveHeldEmail(request)).toMatchObject({ ok: false });
  expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } })).status).toBe("FAILED");
  expect(await prisma.mailboxSendReservation.count()).toBe(0);
});
it("rolls back queue, actor and allowance together if the audit fails, then recovers", async () => {
  const request = await input();
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_staff_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_staff_review_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_staff_review_audit()');
  expect(await approveHeldEmail(request)).toMatchObject({ ok: false, uncertain: true });
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } })).toMatchObject({ status: "FAILED", staffUserId: null, metadata: { sendOrigin: "AUTOMATED_SEQUENCE" } });
  expect(await prisma.mailboxSendReservation.count()).toBe(0);
  await prisma.$executeRawUnsafe('DROP TRIGGER fail_staff_review_audit ON "AuditLog"');
  expect(await approveHeldEmail(request)).toMatchObject({ ok: true });
});
it("refuses approval when the mailbox has no remaining allowance", async () => {
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { dailySendCap: 1 } });
  await prisma.mailboxSendReservation.create({ data: { clientId: "client", mailboxIdentityId: "mailbox", idempotencyKey: "other", windowKey: new Date().toISOString().slice(0, 10), status: "CONSUMED" } });
  expect(await approveHeldEmail(await input())).toMatchObject({ ok: false });
  expect(await prisma.auditLog.count({ where: { entityId: "held" } })).toBe(0);
});
it("still enforces a new do-not-contact block after human approval at real dispatch", async () => {
  expect(await approveHeldEmail(await input())).toMatchObject({ ok: true });
  await prisma.suppressedEmail.create({ data: { clientId: "client", email: "recipient@example.test" } });
  await prisma.outboundEmail.update({ where: { id: "held" }, data: { status: "PROCESSING", claimedAt: new Date(), claimExpiresAt: new Date(Date.now() + 60000), sendAttempt: 2 } });
  await executeOutboundSend("held");
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "held" } });
  expect(row.status).toBe("BLOCKED_SUPPRESSION");
  expect(row.lastErrorCode).toBe("SUPPRESSED");
  expect((await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId: "held" } })).status).toBe("RELEASED");
  expect(row.providerMessageId).toBeNull();
  expect(row.dispatchStartedAt).toBeNull();
});
