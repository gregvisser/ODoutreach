import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { countCalendarSendingDays, loadClientSendingWindow, scheduleClientSendingCalendar } from "./client-sending-calendar";
import { recomputeMailboxLedgerCounterInTransaction, tryReserveSendSlotInTransaction } from "./sending-policy";
import { getMailboxSendingReadinessForClient } from "@/server/queries/mailbox-sending-readiness";

const settings = { timeZone: "Europe/London", weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1020 };
const staff = { id: "calendar-staff", role: "OPERATOR" as const };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T12:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK BLOCKED"); }));
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: { ...staff, entraObjectId: "synthetic-calendar-staff", email: "staff@example.test", isActive: true } });
  await prisma.client.create({ data: { id: "calendar-client", name: "Synthetic calendar", slug: "synthetic-calendar" } });
  await prisma.clientMailboxIdentity.create({ data: { id: "calendar-mailbox", clientId: "calendar-client", provider: "GOOGLE", email: "sender@example.test", emailNormalized: "sender@example.test", connectionStatus: "CONNECTED", canSend: true, isSendingEnabled: true } });
});
afterEach(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS calendar_audit_failure ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS calendar_audit_failure()');
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

it("preserves the existing active-staff policy despite a legacy VIEWER role value", async () => {
  const viewer = await prisma.staffUser.create({ data: { id: "calendar-viewer", entraObjectId: "calendar-viewer", email: "viewer@example.test", role: "VIEWER" } });
  await prisma.clientMembership.create({ data: { clientId: "calendar-client", staffUserId: viewer.id, role: "VIEWER" } });
  expect((await scheduleClientSendingCalendar(viewer, "calendar-client", settings)).ok).toBe(true);
  expect(await prisma.clientSendingCalendar.count()).toBe(1);
  expect(await prisma.auditLog.findFirstOrThrow({ where: { entityType: "ClientSendingCalendar" } })).toMatchObject({ staffUserId: viewer.id });
});

it.each([false, true])("reports the same booked allowance as dispatch during calendar transition=%s", async transition => {
  expect((await scheduleClientSendingCalendar(staff, "calendar-client", { ...settings, timeZone: "America/Los_Angeles" })).ok).toBe(true);
  vi.setSystemTime(new Date(transition ? "2026-09-09T02:00Z" : "2026-09-10T02:00Z"));
  const key = transition ? "2026-09-08" : "2026-09-09T07:00:00.000Z";
  const wrongUtcKey = transition ? "2026-09-09" : "2026-09-10";
  await prisma.mailboxSendReservation.createMany({ data: [
    ...Array.from({ length: 29 }, (_, n) => ({ clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", idempotencyKey: `right-${n}`, windowKey: key, status: "CONSUMED" as const })),
    ...Array.from({ length: 30 }, (_, n) => ({ clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", idempotencyKey: `other-${n}`, windowKey: wrongUtcKey, status: "CONSUMED" as const })),
  ] });
  const mailboxes = await prisma.clientMailboxIdentity.findMany({ where: { clientId: "calendar-client" } });
  expect(await getMailboxSendingReadinessForClient("calendar-client", mailboxes)).toMatchObject([{ bookedInUtcDay: 29, remaining: 1, atLedgerCap: false }]);
});

it("serializes competing edits and records one authenticated client-scoped revision and audit", async () => {
  const results = await Promise.all([
    scheduleClientSendingCalendar(staff, "calendar-client", settings),
    scheduleClientSendingCalendar(staff, "calendar-client", { ...settings, timeZone: "America/Los_Angeles" }),
  ]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await prisma.clientSendingCalendar.count()).toBe(1);
  const row = await prisma.clientSendingCalendar.findFirstOrThrow();
  expect(row).toMatchObject({ clientId: "calendar-client", createdByStaffUserId: staff.id, previousDayEndsAt: new Date("2026-09-09T00:00Z") });
  expect(await prisma.auditLog.findMany({ where: { entityType: "ClientSendingCalendar" } })).toMatchObject([{ clientId: "calendar-client", staffUserId: staff.id, entityId: row.id }]);
});

it("lets an already-locked booking finish while a calendar edit waits for its mailbox", async () => {
  const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "calendar-mailbox" } });
  let signalLocked!: () => void;
  let allowBooking!: () => void;
  const locked = new Promise<void>(resolve => { signalLocked = resolve; });
  const proceed = new Promise<void>(resolve => { allowBooking = resolve; });
  const booking = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ClientMailboxIdentity" WHERE id = 'calendar-mailbox' FOR UPDATE`;
    signalLocked();
    await proceed;
    return tryReserveSendSlotInTransaction(tx, { clientId: "calendar-client", mailbox, idempotencyKey: "overlapping-booking", at: new Date() });
  }, { timeout: 10_000 });
  await locked;
  const change = scheduleClientSendingCalendar(staff, "calendar-client", settings);
  let observedWait = false;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%ORDER BY id FOR UPDATE%') AS waiting`;
      if (rows[0]?.waiting) { observedWait = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally { allowBooking(); }
  const [booked, changed] = await Promise.all([booking, change]);
  expect(observedWait).toBe(true);
  expect(booked.ok).toBe(true);
  expect(changed.ok).toBe(true);
  expect(await prisma.mailboxSendReservation.count()).toBe(1);
});

it("resolves the old quota bucket through the transition without touching reservations or an uncertain send", async () => {
  await prisma.mailboxSendReservation.createMany({ data: Array.from({ length: 30 }, (_, n) => ({ clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", idempotencyKey: `old-${n}`, windowKey: "2026-09-08", status: "CONSUMED" as const })) });
  await prisma.outboundEmail.create({ data: { id: "uncertain", clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", toEmail: "recipient@example.test", status: "PROCESSING", dispatchStartedAt: new Date(), lastErrorCode: "SEND_OUTCOME_UNCONFIRMED" } });
  expect((await scheduleClientSendingCalendar(staff, "calendar-client", settings)).ok).toBe(true);
  const before = await loadClientSendingWindow("calendar-client", new Date("2026-09-08T23:59Z"));
  const gap = await loadClientSendingWindow("calendar-client", new Date("2026-09-09T12:00Z"));
  expect(before).toMatchObject({ key: "2026-09-08", endsAt: new Date("2026-09-09T23:00Z"), pausedUntil: null });
  expect(gap).toMatchObject({ key: before.key, startsAt: before.startsAt, endsAt: before.endsAt, pausedUntil: new Date("2026-09-09T23:00Z") });
  expect(await prisma.mailboxSendReservation.count({ where: { windowKey: gap.key, status: "CONSUMED" } })).toBe(30);
  const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "calendar-mailbox" } });
  const reserve = (at: string) => prisma.$transaction(tx => tryReserveSendSlotInTransaction(tx, { clientId: "calendar-client", mailbox, idempotencyKey: "new-attempt", at: new Date(at) }));
  expect(await reserve("2026-09-09T12:00Z")).toMatchObject({ ok: false, errorCode: "MAILBOX_DAILY_CAP" });
  expect(await reserve("2026-09-09T23:00Z")).toMatchObject({ ok: true, windowKey: "2026-09-09T23:00:00.000Z", duplicate: false });
  await prisma.$transaction(tx => recomputeMailboxLedgerCounterInTransaction(tx, mailbox.id, new Date("2026-09-09T23:00Z")));
  expect(await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: mailbox.id } })).toMatchObject({ emailsSentToday: 1, dailyWindowResetAt: new Date("2026-09-10T23:00Z") });
  const next = await loadClientSendingWindow("calendar-client", new Date("2026-09-09T23:00Z"));
  expect(next).toMatchObject({ key: "2026-09-09T23:00:00.000Z", startsAt: new Date("2026-09-09T23:00Z"), endsAt: new Date("2026-09-10T23:00Z"), pausedUntil: null, calendar: settings });
  expect(await prisma.outboundEmail.findUniqueOrThrow({ where: { id: "uncertain" } })).toMatchObject({ status: "PROCESSING", dispatchStartedAt: new Date("2026-09-08T12:00Z"), lastErrorCode: "SEND_OUTCOME_UNCONFIRMED" });
});

it("serializes two bookings for the last remaining old-day slot during a timezone transition", async () => {
  await scheduleClientSendingCalendar(staff, "calendar-client", settings);
  await prisma.mailboxSendReservation.createMany({ data: Array.from({ length: 29 }, (_, n) => ({ clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", idempotencyKey: `used-${n}`, windowKey: "2026-09-08", status: "CONSUMED" as const })) });
  const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "calendar-mailbox" } });
  const results = await Promise.all(["reply-a", "reply-b"].map(idempotencyKey => prisma.$transaction(tx => tryReserveSendSlotInTransaction(tx, { clientId: "calendar-client", mailbox, idempotencyKey, at: new Date("2026-09-09T12:00Z") }))));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await prisma.mailboxSendReservation.count({ where: { windowKey: "2026-09-08" } })).toBe(30);
  expect(await prisma.mailboxSendReservation.count({ where: { windowKey: "2026-09-09" } })).toBe(0);
});

it("does not book an accepted attempt again under a newly active timezone", async () => {
  await scheduleClientSendingCalendar(staff, "calendar-client", settings);
  await prisma.outboundEmail.create({ data: { id: "accepted", clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", toEmail: "recipient@example.test", status: "SENT", sentAt: new Date() } });
  await prisma.mailboxSendReservation.create({ data: { clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", outboundEmailId: "accepted", idempotencyKey: "same-attempt", windowKey: "2026-09-08", status: "CONSUMED" } });
  const mailbox = await prisma.clientMailboxIdentity.findUniqueOrThrow({ where: { id: "calendar-mailbox" } });
  const result = await prisma.$transaction(tx => tryReserveSendSlotInTransaction(tx, { clientId: "calendar-client", mailbox, idempotencyKey: "same-attempt", at: new Date("2026-09-09T23:00Z") }));
  expect(result).toMatchObject({ ok: true, alreadyQueued: true, duplicate: true, outboundEmailId: "accepted" });
  expect(await prisma.mailboxSendReservation.count()).toBe(1);
});

it("counts an extended old day once and advances only after a completed local day", async () => {
  await scheduleClientSendingCalendar(staff, "calendar-client", settings);
  const dates = ["2026-09-04T12:00Z", "2026-09-05T12:00Z", "2026-09-06T12:00Z", "2026-09-07T12:00Z", "2026-09-08T12:00Z", "2026-09-09T12:00Z", "2026-09-10T00:30Z", "2026-09-10T23:30Z"];
  await prisma.outboundEmail.createMany({ data: dates.map((sentAt, n) => ({ id: `history-${n}`, clientId: "calendar-client", mailboxIdentityId: "calendar-mailbox", toEmail: "history@example.test", status: "SENT" as const, sentAt: new Date(sentAt) })) });
  expect(await countCalendarSendingDays("calendar-mailbox", new Date("2026-09-08T23:59Z"))).toBe(4);
  expect(await countCalendarSendingDays("calendar-mailbox", new Date("2026-09-09T12:00Z"))).toBe(4);
  expect(await countCalendarSendingDays("calendar-mailbox", new Date("2026-09-09T23:00Z"))).toBe(5);
  expect(await countCalendarSendingDays("calendar-mailbox", new Date("2026-09-10T23:00Z"))).toBe(6);
});

it("preserves revision history and keeps a second client's legacy window separate", async () => {
  await prisma.client.create({ data: { id: "other", name: "Other synthetic client", slug: "other-calendar" } });
  await scheduleClientSendingCalendar(staff, "calendar-client", settings);
  const original = await prisma.clientSendingCalendar.findFirstOrThrow();
  vi.setSystemTime(new Date("2026-09-10T12:00Z"));
  expect((await scheduleClientSendingCalendar(staff, "calendar-client", { ...settings, timeZone: "UTC" })).ok).toBe(true);
  expect(await prisma.clientSendingCalendar.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
  expect(await prisma.clientSendingCalendar.count()).toBe(2);
  expect(await loadClientSendingWindow("other", new Date("2026-09-09T12:00Z"))).toMatchObject({ key: "2026-09-09", calendar: null, pausedUntil: null, endsAt: new Date("2026-09-10T00:00Z") });
});

it("rolls back the calendar if its audit cannot be saved", async () => {
  await prisma.$executeRawUnsafe("CREATE FUNCTION calendar_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
  await prisma.$executeRawUnsafe('CREATE TRIGGER calendar_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION calendar_audit_failure()');
  await expect(scheduleClientSendingCalendar(staff, "calendar-client", settings)).rejects.toThrow();
  expect(await prisma.clientSendingCalendar.count()).toBe(0);
});

it("refuses inactive staff and deleted clients", async () => {
  await prisma.staffUser.update({ where: { id: staff.id }, data: { isActive: false } });
  expect((await scheduleClientSendingCalendar(staff, "calendar-client", settings)).ok).toBe(false);
  await prisma.client.update({ where: { id: "calendar-client" }, data: { deletedAt: new Date() } });
  await expect(scheduleClientSendingCalendar(staff, "calendar-client", settings)).rejects.toThrow();
  expect(await prisma.clientSendingCalendar.count()).toBe(0);
});

it("requires a mailbox and rejects invalid settings without creating a revision", async () => {
  expect((await scheduleClientSendingCalendar(staff, "calendar-client", { ...settings, weekdays: [] })).ok).toBe(false);
  await prisma.client.create({ data: { id: "empty", name: "No mailbox", slug: "empty-calendar" } });
  expect((await scheduleClientSendingCalendar(staff, "empty", settings)).ok).toBe(false);
  expect(await prisma.clientSendingCalendar.count()).toBe(0);
});

it("does not activate a change during a transaction crossing midnight", async () => {
  vi.setSystemTime(new Date("2026-09-08T23:59:45Z"));
  const result = await scheduleClientSendingCalendar(staff, "calendar-client", settings);
  expect(result.ok).toBe(true);
  const row = await prisma.clientSendingCalendar.findFirstOrThrow();
  expect(row.previousDayEndsAt).toEqual(new Date("2026-09-10T00:00Z"));
});

it("fails closed on corrupted calendar history rather than returning a fresh default bucket", async () => {
  await scheduleClientSendingCalendar(staff, "calendar-client", settings);
  await prisma.clientSendingCalendar.updateMany({ data: { timeZone: "Invalid/Timezone" } });
  await expect(loadClientSendingWindow("calendar-client", new Date())).rejects.toThrow();
});
