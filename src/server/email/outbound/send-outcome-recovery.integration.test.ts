import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { executeOutboundSend } from "./execute-one";
import { operatorRequeueFailedSend, releaseStaleProcessingClaimsForScope } from "./operator-recovery";
import { processOutboundSendQueue } from "./queue-processor";
import { getOutboundOperationsSnapshot } from "@/server/queries/outbound-operations";
import { decideCompanyName } from "@/server/suppression/company-names";
import { sendSlotsForDay } from "@/lib/mailboxes/send-pacing";
import { countMailboxSendingDays, countSendingDaysForPool } from "@/server/mailbox/mailbox-sending-history";
import { effectiveDailyCap } from "@/lib/mailboxes/mailbox-warmup";
import { calendarSendSlotsForDay } from "@/lib/mailboxes/calendar-send-pacing";
import { beginOutboundDispatch } from "./send-outcome";

// Real database and orchestration. Every sending transport is inert; unexpected
// HTTP and DNS cannot reach a provider or a customer.
const { send, lookup, token } = vi.hoisted(() => ({ send: vi.fn(), lookup: vi.fn(), token: vi.fn() }));
vi.mock("node:dns", () => ({ promises: { resolveMx: async () => [{ exchange: "mx.example.test", priority: 10 }], resolve4: async () => [], resolve6: async () => [] } }));
vi.mock("@/server/mailbox/google-mailbox-access", () => ({ getGoogleGmailAccessTokenForMailbox: token }));
vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({ getMicrosoftGraphAccessTokenForMailbox: token }));
vi.mock("@/server/mailbox/gmail-sendmail", async (original) => ({ ...await original<object>(), sendGmailUsersMessagesSend: send, fetchDeliveredGmailMessageId: async () => null, findGmailMessageIdByRfc822MessageId: lookup }));
vi.mock("@/server/mailbox/microsoft-graph-sendmail", async (original) => ({ ...await original<object>(), sendMicrosoftGraphSendMail: send, sendMicrosoftGraphMimeSendMail: send, findGraphSentMessageId: lookup }));
vi.mock("../providers", () => ({ getOutboundEmailProvider: () => ({ send }) }));

beforeEach(async () => {
  send.mockReset().mockResolvedValue({ ok: true, providerMessageId: "synthetic-accepted", providerName: "synthetic" });
  lookup.mockReset().mockResolvedValue({ status: "not_found" });
  token.mockReset().mockResolvedValue("synthetic-token");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  vi.stubEnv("SEND_PREFLIGHT_DEDUP_ENABLED", "false");
  vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", "");
  await resetIntegrationDatabase();
  await prisma.client.create({ data: { id: "client", name: "Outcome test", slug: "outcome-test", defaultSenderEmail: "sender@example.test", senderIdentityStatus: "VERIFIED_READY" } });
});
afterEach(async () => {
  vi.useRealTimers();
  for (const table of ["OutboundEmail", "MailboxSendReservation"]) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_outcome_test ON "${table}"`);
  await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_outcome_test()");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

async function seed(provider: "GOOGLE" | "MICROSOFT" | "LEGACY") {
  if (provider !== "LEGACY") await prisma.clientMailboxIdentity.create({ data: { id: "mailbox", clientId: "client", provider, email: "sender@example.test", emailNormalized: "sender@example.test", isActive: true, connectionStatus: "CONNECTED", canSend: true, isSendingEnabled: true } });
  await prisma.outboundEmail.create({ data: { id: "outbound", clientId: "client", mailboxIdentityId: provider === "LEGACY" ? null : "mailbox", status: "PROCESSING", subject: "Synthetic recovery", bodySnapshot: "Test only", toEmail: "recipient@example.test", fromAddress: "sender@example.test", claimedAt: new Date(), claimExpiresAt: new Date(Date.now() + 600_000), sendAttempt: 1 } });
  if (provider !== "LEGACY") await prisma.mailboxSendReservation.create({ data: { clientId: "client", mailboxIdentityId: "mailbox", outboundEmailId: "outbound", idempotencyKey: "synthetic", windowKey: new Date().toISOString().slice(0, 10), status: "RESERVED" } });
}

async function seedCalendar(timeZone = "America/Los_Angeles") {
  await prisma.clientSendingCalendar.create({ data: { clientId: "client", timeZone, weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1080, previousDayEndsAt: new Date("2026-09-01T00:00Z"), effectiveAt: new Date(timeZone === "America/Los_Angeles" ? "2026-09-01T07:00Z" : "2026-09-01T23:00Z"), createdByStaffUserId: "synthetic-staff" } });
}

it.each(["GOOGLE", "MICROSOFT"] as const)("holds %s automated work when permission is revoked while queued", async provider => {
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "0");
  await seed(provider);
  await prisma.client.update({ where: { id: "client" }, data: { status: "ACTIVE", autonomousSendEnabled: true } });
  await prisma.staffUser.create({ data: { id: "attributed-system-actor", email: "actor@example.test", entraObjectId: "synthetic-actor", role: "ADMIN" } });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { staffUserId: "attributed-system-actor", metadata: { sendOrigin: "AUTOMATED_SEQUENCE" } } });
  token.mockImplementation(async () => {
    await prisma.client.update({ where: { id: "client" }, data: { autonomousSendEnabled: false } });
    return "synthetic-token";
  });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "FAILED", dispatchStartedAt: null, lastErrorCode: "AUTOMATED_SEND_DISABLED" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
});

it("rolls back the automated hold if releasing its allowance fails, then recovers atomically", async () => {
  await seed("GOOGLE");
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { metadata: { sendOrigin: "AUTOMATED_SEQUENCE" } } });
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic release failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "MailboxSendReservation" FOR EACH ROW EXECUTE FUNCTION fail_outcome_test()`);
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } });
  await expect(beginOutboundDispatch(row)).rejects.toThrow("synthetic release failure");
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "PROCESSING", dispatchStartedAt: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  await prisma.$executeRawUnsafe(`DROP TRIGGER fail_outcome_test ON "MailboxSendReservation"`);
  expect(await beginOutboundDispatch(row)).toMatchObject({ ok: false });
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "FAILED", lastErrorCode: "AUTOMATED_SEND_DISABLED" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
  expect(send).not.toHaveBeenCalled();
});

it.each(["GOOGLE", "MICROSOFT"] as const)("refuses unset %s automation consent without a relay, but permits deliberate opt-in", async provider => {
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "0");
  await seed(provider);
  await prisma.client.update({ where: { id: "client" }, data: { status: "ACTIVE" } });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { metadata: { sendOrigin: "AUTOMATED_SEQUENCE" } } });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  await prisma.client.update({ where: { id: "client" }, data: { autonomousSendEnabled: true } });
  // Explicit local recovery, not an automatic retry of a held row.
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "PROCESSING" } });
  await prisma.mailboxSendReservation.updateMany({ data: { status: "RESERVED" } });
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});

it.each(["GOOGLE", "MICROSOFT"] as const)("reconciles an already accepted %s automated send after consent is removed", async provider => {
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "0");
  vi.stubEnv("SEND_PREFLIGHT_DEDUP_ENABLED", "true");
  await seed(provider);
  await prisma.client.update({ where: { id: "client" }, data: { status: "ACTIVE", autonomousSendEnabled: false } });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { metadata: { sendOrigin: "AUTOMATED_SEQUENCE" }, rfc822MessageId: "<accepted@example.test>", sendAttempt: 2 } });
  lookup.mockResolvedValue({ status: "found", providerMessageId: "synthetic-existing" });
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "SENT", providerMessageId: "synthetic-existing" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "CONSUMED" });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("holds %s at the local daily cap across UTC midnight", async provider => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-09T00:10Z"));
  vi.stubEnv("MAILBOX_SEND_PACING", "false");
  await seed(provider);
  await seedCalendar();
  await prisma.mailboxSendReservation.createMany({ data: Array.from({ length: 30 }, (_, n) => ({ clientId: "client", mailboxIdentityId: "mailbox", idempotencyKey: `local-used-${n}`, windowKey: "2026-09-08T07:00:00.000Z", status: "CONSUMED" as const })) });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "QUEUED", lastErrorCode: "MAILBOX_DAILY_CAP", nextRetryAt: new Date("2026-09-09T07:00Z"), dispatchStartedAt: null });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("holds %s outside local hours even with pacing disabled, then resumes at opening", async provider => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T15:59Z"));
  vi.stubEnv("MAILBOX_SEND_PACING", "false");
  await seed(provider);
  await seedCalendar();
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "QUEUED", lastErrorCode: "CLIENT_CALENDAR_CLOSED", nextRetryAt: new Date("2026-09-08T16:00Z"), dispatchStartedAt: null, retryCount: 0 });
  vi.setSystemTime(new Date("2026-09-08T16:00Z"));
  await processOutboundSendQueue({ limit: 1 });
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId: "outbound" } })).toMatchObject({ status: "CONSUMED", windowKey: "2026-09-08T07:00:00.000Z" });
});

it.each(["internalProofSend", "governedTestSend"])("keeps %s exempt from calendar hours but inside local daily accounting", async kind => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T15:00Z"));
  vi.stubEnv("MAILBOX_SEND_PACING", "true");
  await seed("GOOGLE");
  await seedCalendar();
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { metadata: { kind } } });
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId: "outbound" } })).toMatchObject({ status: "CONSUMED", windowKey: "2026-09-08T07:00:00.000Z" });
});

it("serializes queued outreach into the configured calendar's paced batches", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const calendar = { timeZone: "America/Los_Angeles", weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1080 };
  const schedule = calendarSendSlotsForDay(calendar, { mailboxId: "mailbox", at: new Date("2026-09-08T16:00Z"), dailyCap: 30, batchSize: 1 });
  if (!schedule.ok) throw Error(schedule.error);
  vi.setSystemTime(schedule.slots[0]);
  vi.stubEnv("MAILBOX_SEND_PACING", "true");
  await seed("GOOGLE");
  await seedCalendar();
  await prisma.client.update({ where: { id: "client" }, data: { sendBatchSize: 1 } });
  await prisma.outboundEmail.create({ data: { id: "second-calendar", clientId: "client", mailboxIdentityId: "mailbox", toEmail: "second@example.test", fromAddress: "sender@example.test", subject: "Synthetic calendar batch", bodySnapshot: "No real mail", status: "PROCESSING", claimedAt: new Date(), sendAttempt: 1 } });
  await prisma.mailboxSendReservation.create({ data: { clientId: "client", mailboxIdentityId: "mailbox", outboundEmailId: "second-calendar", idempotencyKey: "second-calendar", windowKey: "2026-09-07", status: "RESERVED" } });
  const results = await Promise.all([executeOutboundSend("outbound"), executeOutboundSend("second-calendar")]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.outboundEmail.findFirstOrThrow({ where: { status: "QUEUED" } })).toMatchObject({ lastErrorCode: "MAILBOX_SEND_PACING", nextRetryAt: schedule.slots[1], retryCount: 0, dispatchStartedAt: null });
  vi.setSystemTime(schedule.slots[1]);
  await processOutboundSendQueue({ limit: 1 });
  expect(send).toHaveBeenCalledTimes(2);
});

it.each(["GOOGLE", "MICROSOFT"] as const)("keeps the fifth %s warm-up day's allowance fixed until midnight", async provider => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T23:59:00Z"));
  vi.stubEnv("MAILBOX_WARMUP_RAMP", "on");
  vi.stubEnv("MAILBOX_SEND_PACING", "false");
  await seed(provider);
  // Four completed sending days, then five accepted sends today. Today's
  // first acceptance must not promote the remainder of today to the next step.
  await prisma.outboundEmail.createMany({ data: [
    ...Array.from({ length: 4 }, (_, n) => ({ id: `past-${n}`, clientId: "client", mailboxIdentityId: "mailbox", toEmail: "past@example.test", status: "SENT" as const, sentAt: new Date(`2026-09-0${n + 4}T12:00:00Z`) })),
    ...Array.from({ length: 5 }, (_, n) => ({ id: `today-${n}`, clientId: "client", mailboxIdentityId: "mailbox", toEmail: "today@example.test", status: "SENT" as const, sentAt: new Date("2026-09-08T12:00:00Z") })),
  ] });
  await prisma.mailboxSendReservation.createMany({ data: Array.from({ length: 5 }, (_, n) => ({ clientId: "client", mailboxIdentityId: "mailbox", outboundEmailId: `today-${n}`, idempotencyKey: `today-${n}`, windowKey: "2026-09-08", status: "CONSUMED" as const })) });
  await prisma.mailboxSendReservation.updateMany({ where: { outboundEmailId: "outbound" }, data: { windowKey: "2026-09-07" } });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "QUEUED", lastErrorCode: "MAILBOX_WARMUP_CAP", nextRetryAt: new Date("2026-09-09T00:00:00Z"), dispatchStartedAt: null, retryCount: 0 });
  expect(await countMailboxSendingDays("mailbox")).toBe(4);
  expect((await countSendingDaysForPool(["mailbox"])).get("mailbox")).toBe(4);
  vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
  expect(await countMailboxSendingDays("mailbox")).toBe(5);
  expect((await countSendingDaysForPool(["mailbox"])).get("mailbox")).toBe(5);
  expect(effectiveDailyCap(await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "mailbox" } }), 5)).toBe(10);
  await processOutboundSendQueue({ limit: 1 });
  expect(send).toHaveBeenCalledTimes(1);
});

it.each(["GOOGLE", "MICROSOFT"] as const)("holds older %s queue entries until today's paced window opens", async provider => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T06:59:00Z"));
  vi.stubEnv("MAILBOX_SEND_PACING", "true");
  await seed(provider);
  await prisma.mailboxSendReservation.updateMany({ data: { windowKey: "2026-09-07" } });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "QUEUED", lastErrorCode: "MAILBOX_SEND_PACING", retryCount: 0, dispatchStartedAt: null });
});

it.each(["2026-09-07", "2026-09-08"])("serializes dispatches reserved on %s into paced batches without stranding today's bookings", async reservationDay => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const slots = sendSlotsForDay({ mailboxId: "mailbox", dateKey: "2026-09-08", dailyCap: 30, batchSize: 1 });
  const midnight = Date.parse("2026-09-08T00:00:00Z");
  vi.setSystemTime(new Date(midnight + slots[0] * 60_000));
  vi.stubEnv("MAILBOX_SEND_PACING", "true");
  await seed("GOOGLE");
  await prisma.client.update({ where: { id: "client" }, data: { sendBatchSize: 1 } });
  await prisma.outboundEmail.create({ data: { id: "second", clientId: "client", mailboxIdentityId: "mailbox", status: "PROCESSING", subject: "Second paced message", bodySnapshot: "Synthetic", toEmail: "second@example.test", fromAddress: "sender@example.test", claimedAt: new Date(), sendAttempt: 1 } });
  await prisma.mailboxSendReservation.create({ data: { clientId: "client", mailboxIdentityId: "mailbox", outboundEmailId: "second", idempotencyKey: "second", windowKey: "2026-09-07", status: "RESERVED" } });
  await prisma.mailboxSendReservation.updateMany({ data: { windowKey: reservationDay } });
  const results = await Promise.all([executeOutboundSend("outbound"), executeOutboundSend("second")]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(send).toHaveBeenCalledTimes(1);
  const held = await prisma.outboundEmail.findFirstOrThrow({ where: { status: "QUEUED" } });
  expect(held.nextRetryAt?.getTime()).toBe(midnight + slots[1] * 60_000);
  vi.setSystemTime(new Date(midnight + slots[1] * 60_000));
  await processOutboundSendQueue({ limit: 1 });
  expect(send).toHaveBeenCalledTimes(2);
});

it("counts an unconfirmed fenced attempt in the current paced batch without resending it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const slots = sendSlotsForDay({ mailboxId: "mailbox", dateKey: "2026-09-08", dailyCap: 30, batchSize: 1 });
  vi.setSystemTime(new Date(Date.parse("2026-09-08T00:00:00Z") + slots[0] * 60_000));
  vi.stubEnv("MAILBOX_SEND_PACING", "true");
  await seed("GOOGLE");
  await prisma.client.update({ where: { id: "client" }, data: { sendBatchSize: 1 } });
  await prisma.outboundEmail.create({ data: { id: "uncertain", clientId: "client", mailboxIdentityId: "mailbox", status: "PROCESSING", subject: "Unknown result", bodySnapshot: "Synthetic", toEmail: "unknown@example.test", fromAddress: "sender@example.test", dispatchStartedAt: new Date(), lastErrorCode: "SEND_OUTCOME_UNCONFIRMED" } });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "uncertain" } })).toMatchObject({ status: "PROCESSING", lastErrorCode: "SEND_OUTCOME_UNCONFIRMED", dispatchStartedAt: new Date() });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("holds %s company review before transport and safely retries after a human decision", async provider => {
  await seed(provider);
  await prisma.contact.create({ data: { clientId: "client", email: "recipient@example.test", company: "Acme Group" } });
  const entry = await prisma.companyDncEntry.create({ data: { clientId: "client", originalName: "Acme Ltd", canonicalName: "acme" } });
  await executeOutboundSend("outbound");
  expect(send).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "FAILED", lastErrorCode: "COMPANY_REVIEW", dispatchStartedAt: null, retryCount: 0 });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
  // An unresolved retry still cannot send: the actual dispatcher rechecks.
  expect(await operatorRequeueFailedSend("outbound", "client", "COMPANY_REVIEW")).toEqual({ count: 1 });
  await processOutboundSendQueue({ limit: 1 });
  expect(send).not.toHaveBeenCalled();
  await prisma.staffUser.create({ data: { id: "review-staff", entraObjectId: "synthetic-review-staff", email: "reviewer@example.test", displayName: "Synthetic reviewer" } });
  await decideCompanyName({ clientId: "client", staffUserId: "review-staff", entryId: entry.id, company: "Acme Group", outcome: "ALLOW" });
  expect(await operatorRequeueFailedSend("outbound", "client", "COMPANY_REVIEW")).toEqual({ count: 1 });
  await processOutboundSendQueue({ limit: 1 });
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "SENT" });
});

it("blocks an exact employer name loaded after the outbound was queued", async () => {
  await seed("GOOGLE");
  await prisma.contact.create({ data: { clientId: "client", email: "recipient@example.test", company: "Acme Limited" } });
  await prisma.companyDncEntry.create({ data: { clientId: "client", originalName: "Acme", canonicalName: "acme" } });
  await executeOutboundSend("outbound");
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "BLOCKED_SUPPRESSION" });
});

it("does not let company-review recovery retry another kind of failure", async () => {
  await seed("GOOGLE");
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "FAILED", lastErrorCode: "UNRELATED_FAILURE" } });
  expect(await operatorRequeueFailedSend("outbound", "client", "COMPANY_REVIEW")).toEqual({ count: 0 });
  expect(send).not.toHaveBeenCalled();
});

it("rolls back a company hold if releasing its allowance fails", async () => {
  await seed("GOOGLE");
  await prisma.companyDncEntry.create({ data: { clientId: "client", originalName: "Acme", canonicalName: "acme" } });
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic review release interruption'; END $$");
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "MailboxSendReservation" FOR EACH ROW WHEN (NEW.status = 'RELEASED') EXECUTE FUNCTION fail_outcome_test()`);
  await expect(executeOutboundSend("outbound")).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "PROCESSING", lastErrorCode: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
});
async function failSave(table: "OutboundEmail" | "MailboxSendReservation") {
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic persistence interruption'; END $$");
  const status = table === "OutboundEmail" ? "SENT" : "CONSUMED";
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "${table}" FOR EACH ROW WHEN (NEW.status = '${status}') EXECUTE FUNCTION fail_outcome_test()`);
}
async function expectHeld() {
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "PROCESSING", providerMessageId: null, claimExpiresAt: null });
  expect(await operatorRequeueFailedSend("outbound", "client")).toEqual({ count: 0 });
  expect(await releaseStaleProcessingClaimsForScope(["client"])).toEqual({ count: 0 });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
}

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("holds an accepted %s send when saving its result fails", async (provider) => {
  await seed(provider);
  await failSave("OutboundEmail");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  if (provider !== "LEGACY") expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("saves %s sent status and allowance atomically", async (provider) => {
  await seed(provider);
  await failSave("MailboxSendReservation");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("records ordinary %s acceptance once", async (provider) => {
  await seed(provider);
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "SENT", providerMessageId: "synthetic-accepted" });
  if (provider !== "LEGACY") expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "CONSUMED" });
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("holds %s connection loss without retrying", async (provider) => {
  await seed(provider);
  send.mockRejectedValueOnce(Error("socket timed out"));
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("holds ambiguous %s server errors", async (provider) => {
  await seed(provider);
  send.mockResolvedValueOnce({ ok: false, error: "synthetic server error", code: "502" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
});

it.each(["GOOGLE", "MICROSOFT", "LEGACY"] as const)("allows %s retry after explicit throttling", async (provider) => {
  await seed(provider);
  send.mockResolvedValueOnce({ ok: false, error: "synthetic throttle", code: "429" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "QUEUED", dispatchStartedAt: null, retryCount: 1 });
  if (provider !== "LEGACY") expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { nextRetryAt: new Date(0) } });
  expect(await processOutboundSendQueue({ limit: 1 })).toMatchObject({ claimed: 1, completed: 1 });
  expect(send).toHaveBeenCalledTimes(2);
});

it("saves an explicit rejection and released allowance together", async () => {
  await seed("GOOGLE");
  send.mockResolvedValueOnce({ ok: false, error: "synthetic invalid payload", code: "400" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "FAILED", dispatchStartedAt: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
  expect(await operatorRequeueFailedSend("outbound", "client")).toEqual({ count: 1 });
});

it("keeps the hold if saving an explicit rejection is interrupted", async () => {
  await seed("GOOGLE");
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic release interruption'; END $$");
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "MailboxSendReservation" FOR EACH ROW WHEN (NEW.status = 'RELEASED') EXECUTE FUNCTION fail_outcome_test()`);
  send.mockResolvedValueOnce({ ok: false, error: "synthetic invalid payload", code: "400" });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
});

it("allows only one worker to dispatch while a provider call is in flight", async () => {
  await seed("GOOGLE");
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let release!: (value: unknown) => void;
  send.mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve; }); });
  const first = executeOutboundSend("outbound");
  await started;
  try { await expectHeld(); }
  finally { release({ ok: true, providerMessageId: "synthetic-accepted", providerName: "synthetic" }); }
  expect((await first).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});

it("keeps a held record out of queue and operator recovery even if its status was changed", async () => {
  await seed("GOOGLE");
  send.mockRejectedValueOnce(Error("timeout"));
  await executeOutboundSend("outbound");
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "FAILED" } });
  expect(await operatorRequeueFailedSend("outbound", "client")).toEqual({ count: 0 });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "QUEUED", nextRetryAt: null } });
  expect(await processOutboundSendQueue({ limit: 1 })).toMatchObject({ claimed: 0 });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { status: "PROCESSING", claimExpiresAt: new Date(0) } });
  expect(await releaseStaleProcessingClaimsForScope(["client"])).toEqual({ count: 0 });
  expect(send).toHaveBeenCalledTimes(1);
});

it("shows held sends only in the authorised operations scope", async () => {
  await seed("GOOGLE");
  send.mockRejectedValueOnce(Error("timeout"));
  await executeOutboundSend("outbound");
  expect((await getOutboundOperationsSnapshot(["client"])).unconfirmed.map(row => row.id)).toEqual(["outbound"]);
  expect((await getOutboundOperationsSnapshot([])).unconfirmed).toEqual([]);
  expect((await getOutboundOperationsSnapshot(["other"])).unconfirmed).toEqual([]);
});

it.each(["GOOGLE", "MICROSOFT"] as const)("keeps an existing %s preflight match held when saving fails", async (provider) => {
  await seed(provider);
  vi.stubEnv("SEND_PREFLIGHT_DEDUP_ENABLED", "true");
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { sendAttempt: 2 } });
  lookup.mockResolvedValue({ status: "found", providerMessageId: "synthetic-existing" });
  await failSave("MailboxSendReservation");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "PROCESSING", providerMessageId: null, claimExpiresAt: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RESERVED" });
  expect(send).not.toHaveBeenCalled();
  expect(lookup).toHaveBeenCalledTimes(1);
});

it("fences two workers that both read the row before either starts dispatch", async () => {
  await seed("GOOGLE");
  let arrived = 0;
  let release!: () => void;
  const both = new Promise<void>(resolve => { release = resolve; });
  token.mockImplementation(async () => { if (++arrived === 2) release(); await both; return "synthetic-token"; });
  const results = await Promise.all([executeOutboundSend("outbound"), executeOutboundSend("outbound")]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "CONSUMED" });
});

it("never calls the provider when the pre-dispatch record cannot be saved", async () => {
  await seed("GOOGLE");
  await prisma.$executeRawUnsafe("CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic fence failure'; END $$");
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "OutboundEmail" FOR EACH ROW WHEN (NEW."dispatchStartedAt" IS NOT NULL) EXECUTE FUNCTION fail_outcome_test()`);
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findFirstOrThrow()).toMatchObject({ status: "FAILED", dispatchStartedAt: null });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
});

it("holds a Microsoft MIME acceptance if saving fails", async () => {
  await seed("MICROSOFT");
  vi.stubEnv("MICROSOFT_MIME_SEND", "on");
  await failSave("OutboundEmail");
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
  expect(send.mock.calls[0][0]).toHaveProperty("rfc5322Message");
});

it.each(["408", "200"])("holds ambiguous response code %s", async (code) => {
  await seed("GOOGLE");
  send.mockResolvedValueOnce({ ok: false, error: "synthetic unreadable outcome", code });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  await expectHeld();
});


it.each(["GOOGLE", "MICROSOFT"] as const)("defers a previous-day %s reservation when today already has 30 bookings", async provider => {
  await seed(provider);
  await prisma.clientMailboxIdentity.update({ where: { id: "mailbox" }, data: { dailySendCap: 5000 } });
  await prisma.mailboxSendReservation.updateMany({ where: { outboundEmailId: "outbound" }, data: { windowKey: "2020-01-01" } });
  await prisma.mailboxSendReservation.createMany({ data: Array.from({ length: 30 }, (_, n) => ({ clientId: "client", mailboxIdentityId: "mailbox", idempotencyKey: "used-" + n, windowKey: new Date().toISOString().slice(0,10), status: "CONSUMED" as const })) });
  expect(await executeOutboundSend("outbound")).toMatchObject({ ok:false, error: expect.stringContaining("stays queued") });
  expect(send).not.toHaveBeenCalled();
  const held = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } });
  expect(held).toMatchObject({ status:"QUEUED", dispatchStartedAt:null, lastErrorCode:"MAILBOX_DAILY_CAP", retryCount:0 });
  expect(held.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId:"outbound" } })).toMatchObject({ status:"RESERVED", windowKey:"2020-01-01" });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("rebooks an older %s queue entry into today's allowance before sending", async provider => {
  await seed(provider);
  await prisma.mailboxSendReservation.updateMany({ where: { outboundEmailId:"outbound" }, data: { windowKey:"2020-01-01" } });
  expect(await executeOutboundSend("outbound")).toMatchObject({ ok:true });
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({ where: { outboundEmailId:"outbound" } })).toMatchObject({ status:"CONSUMED", windowKey:new Date().toISOString().slice(0,10) });
});

it.each(["GOOGLE", "MICROSOFT"] as const)("does not send a %s message whose allowance was already consumed", async provider => {
  await seed(provider);
  await prisma.mailboxSendReservation.updateMany({ where: { outboundEmailId:"outbound" }, data: { status:"CONSUMED" } });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
});


it.each([["off",29,30],["on",4,5]] as const)("serializes two older queue entries with warm-up=%s", async (warmup, prior, cap) => {
  vi.stubEnv("MAILBOX_WARMUP_RAMP",warmup);
  await seed("GOOGLE");
  await prisma.clientMailboxIdentity.update({ where:{ id:"mailbox" }, data:{ dailySendCap:5000 } });
  await prisma.mailboxSendReservation.updateMany({ where:{ outboundEmailId:"outbound" }, data:{ windowKey:"2020-01-01" } });
  await prisma.outboundEmail.create({ data:{ id:"second", clientId:"client", mailboxIdentityId:"mailbox", status:"PROCESSING", subject:"Synthetic second", bodySnapshot:"Never real mail", toEmail:"second@example.test", fromAddress:"sender@example.test", claimedAt:new Date(), sendAttempt:1 } });
  await prisma.mailboxSendReservation.create({ data:{ clientId:"client", mailboxIdentityId:"mailbox", outboundEmailId:"second", idempotencyKey:"second", windowKey:"2020-01-01", status:"RESERVED" } });
  await prisma.mailboxSendReservation.createMany({ data:Array.from({ length:prior }, (_,n)=>({ clientId:"client", mailboxIdentityId:"mailbox", idempotencyKey:"prior-"+n, windowKey:new Date().toISOString().slice(0,10), status:"CONSUMED" as const })) });
  const results = await Promise.all([executeOutboundSend("outbound"), executeOutboundSend("second")]);
  expect(results.filter(r=>r.ok)).toHaveLength(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.outboundEmail.count({ where:{ status:"QUEUED", lastErrorCode: warmup === "on" ? "MAILBOX_WARMUP_CAP" : "MAILBOX_DAILY_CAP" } })).toBe(1);
  expect(await prisma.mailboxSendReservation.count({ where:{ windowKey:new Date().toISOString().slice(0,10), status:{ in:["RESERVED","CONSUMED"] } } })).toBe(cap);
});


it.each(["GOOGLE", "MICROSOFT"] as const)("holds an older %s outreach email when today's five warm-up slots are used", async provider => {
  vi.stubEnv("MAILBOX_WARMUP_RAMP","on");
  await seed(provider);
  await prisma.outboundEmail.update({ where:{id:"outbound"}, data:{ metadata:{kind:"sequenceIntroductionSend"} } });
  await prisma.mailboxSendReservation.updateMany({ where:{outboundEmailId:"outbound"}, data:{windowKey:"2020-01-01"} });
  await prisma.mailboxSendReservation.createMany({data:Array.from({length:5},(_,n)=>({clientId:"client",mailboxIdentityId:"mailbox",idempotencyKey:"warmup-used-"+n,windowKey:new Date().toISOString().slice(0,10),status:"CONSUMED" as const}))});
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({where:{id:"outbound"}})).toMatchObject({status:"QUEUED",dispatchStartedAt:null,lastErrorCode:"MAILBOX_WARMUP_CAP"});
});


it.each(["sequenceFollowUpSend", "controlledPilotSend", null])("applies dispatch warm-up to outreach kind %s", async kind => {
  vi.stubEnv("MAILBOX_WARMUP_RAMP","on"); await seed("GOOGLE");
  await prisma.outboundEmail.update({where:{id:"outbound"},data:{metadata:kind?{kind}:{}}});
  await prisma.mailboxSendReservation.createMany({data:Array.from({length:5},(_,n)=>({clientId:"client",mailboxIdentityId:"mailbox",idempotencyKey:"used-"+n,windowKey:new Date().toISOString().slice(0,10),status:"CONSUMED" as const}))});
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

it.each(["internalProofSend", "governedTestSend"])("preserves the internal %s warm-up exemption within the hard daily cap", async kind => {
  vi.stubEnv("MAILBOX_SEND_PACING", "true");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-08T06:59:00Z"));
  vi.stubEnv("MAILBOX_WARMUP_RAMP","on"); await seed("GOOGLE");
  await prisma.outboundEmail.update({where:{id:"outbound"},data:{metadata:{kind}}});
  await prisma.mailboxSendReservation.createMany({data:Array.from({length:5},(_,n)=>({clientId:"client",mailboxIdentityId:"mailbox",idempotencyKey:"used-"+n,windowKey:new Date().toISOString().slice(0,10),status:"CONSUMED" as const}))});
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});

it("uses actual sending history so an established mailbox can use its higher allowance", async()=>{
  vi.stubEnv("MAILBOX_WARMUP_RAMP","on"); await seed("GOOGLE");
  await prisma.outboundEmail.createMany({data:Array.from({length:25},(_,n)=>({id:"history-"+n,clientId:"client",mailboxIdentityId:"mailbox",toEmail:"history@example.test",status:"SENT" as const,sentAt:new Date(Date.now()-(n+1)*86400000)}))});
  await prisma.mailboxSendReservation.createMany({data:Array.from({length:5},(_,n)=>({clientId:"client",mailboxIdentityId:"mailbox",idempotencyKey:"used-"+n,windowKey:new Date().toISOString().slice(0,10),status:"CONSUMED" as const}))});
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});


it.each(["GOOGLE", "MICROSOFT"] as const)("records an already accepted %s send without booking new warm-up allowance", async provider=>{
  vi.stubEnv("MAILBOX_SEND_PACING", "true");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-08T06:59:00Z"));
  vi.stubEnv("MAILBOX_WARMUP_RAMP","on"); vi.stubEnv("SEND_PREFLIGHT_DEDUP_ENABLED","true");
  await seed(provider);
  await prisma.outboundEmail.update({where:{id:"outbound"},data:{sendAttempt:2}});
  // A calendar that is currently closed cannot turn a positive provider lookup
  // into a new send or require fresh allowance for an accepted outcome.
  await seedCalendar();
  await prisma.mailboxSendReservation.updateMany({where:{outboundEmailId:"outbound"},data:{windowKey:"2020-01-01"}});
  await prisma.mailboxSendReservation.createMany({data:Array.from({length:30},(_,n)=>({clientId:"client",mailboxIdentityId:"mailbox",idempotencyKey:"full-"+n,windowKey:new Date().toISOString().slice(0,10),status:"CONSUMED" as const}))});
  lookup.mockResolvedValue({status:"found",providerMessageId:"synthetic-existing"});
  expect((await executeOutboundSend("outbound")).ok).toBe(true);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({where:{id:"outbound"}})).toMatchObject({status:"SENT",providerMessageId:"synthetic-existing"});
  expect(await prisma.mailboxSendReservation.findUniqueOrThrow({where:{outboundEmailId:"outbound"}})).toMatchObject({status:"CONSUMED",windowKey:"2020-01-01"});
});

async function linkSelectedCampaign() {
  await prisma.client.update({ where: { id: "client" }, data: { status: "ACTIVE", autonomousSendEnabled: true } });
  await prisma.contactList.create({ data: { id: "selection-list", clientId: "client", name: "Synthetic" } });
  await prisma.contact.create({ data: { id: "selection-contact", clientId: "client", email: "recipient@example.test" } });
  await prisma.clientEmailTemplate.create({ data: { id: "selection-template", clientId: "client", name: "Synthetic", category: "FOLLOW_UP_1", subject: "Synthetic", content: "Synthetic", status: "APPROVED" } });
  await prisma.clientEmailSequence.create({ data: { id: "selection-sequence", clientId: "client", contactListId: "selection-list", name: "Synthetic", status: "APPROVED" } });
  await prisma.clientEmailSequenceStep.create({ data: { id: "selection-step", sequenceId: "selection-sequence", templateId: "selection-template", position: 2, category: "FOLLOW_UP_1" } });
  await prisma.clientEmailSequenceEnrollment.create({ data: { id: "selection-enrollment", clientId: "client", sequenceId: "selection-sequence", contactListId: "selection-list", contactId: "selection-contact", status: "PENDING" } });
  await prisma.clientEmailSequenceStepSend.create({ data: { clientId: "client", sequenceId: "selection-sequence", enrollmentId: "selection-enrollment", stepId: "selection-step", templateId: "selection-template", contactListId: "selection-list", contactId: "selection-contact", idempotencyKey: "selection-test", status: "SENT", outboundEmailId: "outbound" } });
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { metadata: { sendOrigin: "AUTOMATED_SEQUENCE" } } });
  vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", JSON.stringify({ clientId: "client", sequenceIds: ["selection-sequence"] }));
}
it.each(["GOOGLE", "MICROSOFT"] as const)("rechecks the campaign selection after %s authentication", async provider => {
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "0");
  await seed(provider);
  await linkSelectedCampaign();
  token.mockImplementation(async () => {
    vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", JSON.stringify({ clientId: "client", sequenceIds: ["different"] }));
    return "synthetic-token";
  });
  expect((await executeOutboundSend("outbound")).ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "FAILED", dispatchStartedAt: null, lastErrorCode: "CAMPAIGN_SELECTION_HELD" });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
});
it("permits the linked selected automatic campaign at the durable boundary", async () => {
  await seed("LEGACY");
  await linkSelectedCampaign();
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } });
  expect(await beginOutboundDispatch(row)).toBeTruthy();
  expect((await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).dispatchStartedAt).not.toBeNull();
});
it("refuses a stopped selected enrollment and preserves the hold atomically", async () => {
  await seed("GOOGLE");
  await linkSelectedCampaign();
  await prisma.clientEmailSequenceEnrollment.update({ where: { id: "selection-enrollment" }, data: { status: "COMPLETED" } });
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } });
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_outcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic release failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome_test BEFORE UPDATE ON "MailboxSendReservation" FOR EACH ROW EXECUTE FUNCTION fail_outcome_test()`);
  await expect(beginOutboundDispatch(row)).rejects.toThrow("synthetic release failure");
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "PROCESSING", dispatchStartedAt: null });
  await prisma.$executeRawUnsafe(`DROP TRIGGER fail_outcome_test ON "MailboxSendReservation"`);
  expect(await beginOutboundDispatch(row)).toMatchObject({ ok: false });
  expect(await prisma.mailboxSendReservation.findFirstOrThrow()).toMatchObject({ status: "RELEASED" });
});
it("malformed selection blocks automatic dispatch without mutating the claim", async () => {
  await seed("LEGACY");
  await linkSelectedCampaign();
  vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", "{bad");
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } });
  await expect(beginOutboundDispatch(row)).rejects.toThrow();
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } })).toMatchObject({ status: "PROCESSING", dispatchStartedAt: null });
});
it("leaves manual dispatch and provider-confirmed reconciliation outside campaign selection", async () => {
  await seed("LEGACY");
  vi.stubEnv("CAMPAIGN_SCHEDULER_SELECTION", "{bad");
  const row = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "outbound" } });
  expect(await beginOutboundDispatch(row)).toBeTruthy();
  await prisma.outboundEmail.update({ where: { id: "outbound" }, data: { dispatchStartedAt: null, metadata: { sendOrigin: "AUTOMATED_SEQUENCE" } } });
  expect(await beginOutboundDispatch(row, undefined, true)).toBeTruthy();
});
