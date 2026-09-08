import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma, StaffUser } from "@/generated/prisma/client";
import { parseSendingCalendar, planSendingCalendarChange } from "@/lib/mailboxes/sending-calendar";
import { resolveClientSendingWindow } from "@/lib/mailboxes/sending-calendar-history";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import type { CalendarSettingsSnapshot } from "@/lib/mailboxes/calendar-settings";

type CalendarDb = Pick<Prisma.TransactionClient, "clientSendingCalendar">;

export async function loadClientSendingWindow(clientId: string, at: Date, db: CalendarDb = prisma) {
  return (await loadClientSendingCalendarState(clientId, at, db)).window;
}

export async function loadClientSendingCalendarState(clientId: string, at: Date, db: CalendarDb = prisma) {
  const revisions = await db.clientSendingCalendar.findMany({ where: { clientId }, orderBy: { effectiveAt: "asc" } });
  const window = resolveClientSendingWindow(clientId, revisions, at);
  const pending = revisions.find(revision => +revision.effectiveAt > +at);
  const settings: CalendarSettingsSnapshot = {
    current: window.calendar,
    pending: pending ? { timeZone: pending.timeZone, weekdays: pending.weekdays, startMinute: pending.startMinute, endMinute: pending.endMinute, effectiveAt: pending.effectiveAt.toISOString(), pauseStartsAt: pending.previousDayEndsAt.toISOString() } : null,
  };
  return { window, settings };
}

/** Internal service; the server action obtains staff from the authenticated session. */
export async function scheduleClientSendingCalendar(staff: Pick<StaffUser, "id" | "role">, clientId: string, value: unknown) {
  await requireClientMailboxMutator(staff, clientId);
  const parsed = parseSendingCalendar(value);
  if (!parsed.ok) return parsed;
  return prisma.$transaction(async tx => {
    // Serialize edits while allowing existing send transactions to validate
    // their client foreign keys before releasing the mailbox locks we need.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Client" WHERE id = ${clientId} AND "deletedAt" IS NULL FOR NO KEY UPDATE`;
    if (!locked.length || !await tx.staffUser.findFirst({ where: { id: staff.id, isActive: true }, select: { id: true } })) {
      return { ok: false as const, error: "This staff account or client is no longer available." };
    }
    // Calendar edits and send bookings must agree at the transition. Acquire
    // mailbox locks in a stable order; do not modify any bookings or outbounds.
    const mailboxes = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ClientMailboxIdentity" WHERE "clientId" = ${clientId} ORDER BY id FOR UPDATE`;
    if (!mailboxes.length) return { ok: false as const, error: "Add a sending mailbox before configuring a calendar." };
    const at = new Date();
    const supported = await tx.$queryRaw<{ supported: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name = ${parsed.value.timeZone}) AS supported`;
    if (!supported[0]?.supported) return { ok: false as const, error: "This timezone is not supported by the sending database." };
    const revisions = await tx.clientSendingCalendar.findMany({ where: { clientId }, orderBy: { effectiveAt: "asc" } });
    const current = resolveClientSendingWindow(clientId, revisions, at);
    if (revisions.some(revision => +revision.effectiveAt > +at)) {
      return { ok: false as const, error: "A calendar change is already scheduled. Wait until it takes effect before changing it again." };
    }
    // Avoid scheduling a boundary seconds away while this transaction commits.
    // Transaction timeout is 5s; the planning margin is one minute.
    const planned = planSendingCalendarChange(current.calendar, parsed.value, new Date(+at + 60_000));
    if (!planned.ok) return planned;
    const revision = await tx.clientSendingCalendar.create({ data: {
      clientId, ...parsed.value,
      previousDayEndsAt: planned.value.pauseStartsAt, effectiveAt: planned.value.effectiveAt,
      createdByStaffUserId: staff.id, createdAt: at,
    } });
    await tx.auditLog.create({ data: {
      staffUserId: staff.id, clientId, action: "UPDATE", entityType: "ClientSendingCalendar", entityId: revision.id,
      metadata: { ...parsed.value, previousDayEndsAt: revision.previousDayEndsAt.toISOString(), effectiveAt: revision.effectiveAt.toISOString() },
    } });
    return { ok: true as const, revision, current: current.calendar };
  }, { timeout: 5_000 });
}

/**
 * Completed sending days across immutable calendar revisions. Accepted sends
 * in a transition extension belong to the old day, including human replies.
 * Current-day sends and unknown outcomes do not advance warm-up.
 */
export async function countCalendarSendingDays(mailboxIdentityId: string, at: Date, db: Pick<Prisma.TransactionClient,
  "clientMailboxIdentity" | "clientSendingCalendar" | "$queryRaw"> = prisma): Promise<number> {
  const mailbox = await db.clientMailboxIdentity.findUnique({ where: { id: mailboxIdentityId }, select: { clientId: true } });
  if (!mailbox) return 0;
  const context = await loadClientCalendarPlanningContext(mailbox.clientId, [mailboxIdentityId], at, db);
  return context.sendingDays.get(mailboxIdentityId) ?? 0;
}

/** One calendar lookup and one grouped history query for the whole client pool. */
export async function loadClientCalendarPlanningContext(clientId: string, mailboxIds: readonly string[], at: Date,
  db: Pick<Prisma.TransactionClient, "clientSendingCalendar" | "$queryRaw"> = prisma) {
  const window = await loadClientSendingWindow(clientId, at, db);
  const sendingDays = new Map<string, number>(mailboxIds.map(id => [id, 0]));
  if (!mailboxIds.length) return { window, sendingDays };
  const rows = await db.$queryRaw<{ mailboxIdentityId: string; days: bigint }[]>`
    SELECT sent."mailboxIdentityId", COUNT(DISTINCT (COALESCE(active.id, 'legacy'), DATE(
      (CASE WHEN upcoming."previousDayEndsAt" <= sent."sentAt"
        THEN upcoming."previousDayEndsAt" - INTERVAL '1 millisecond'
        ELSE sent."sentAt" END AT TIME ZONE 'UTC')
      AT TIME ZONE COALESCE(active."timeZone", 'UTC')
    ))) AS days
    FROM "OutboundEmail" sent
    LEFT JOIN LATERAL (
      SELECT id, "timeZone" FROM "ClientSendingCalendar"
      WHERE "clientId" = sent."clientId" AND "effectiveAt" <= sent."sentAt"
      ORDER BY "effectiveAt" DESC LIMIT 1
    ) active ON TRUE
    LEFT JOIN LATERAL (
      SELECT "previousDayEndsAt" FROM "ClientSendingCalendar"
      WHERE "clientId" = sent."clientId" AND "effectiveAt" > sent."sentAt"
      ORDER BY "effectiveAt" ASC LIMIT 1
    ) upcoming ON TRUE
    WHERE sent."clientId" = ${clientId}
      AND sent."mailboxIdentityId" = ANY(${[...mailboxIds]}::text[])
      AND sent."sentAt" < ${window.startsAt}
    GROUP BY sent."mailboxIdentityId"
  `;
  for (const row of rows) sendingDays.set(row.mailboxIdentityId, Number(row.days));
  return { window, sendingDays };
}
